import hashlib
import json
import os
import secrets
import subprocess
import sys
from uuid import UUID
from datetime import datetime
from .identity import identity_for, digest
from fastapi import FastAPI, Depends, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.types.json import Jsonb
from .db import connection
from .domain import classify, normalized, statistics, sufficient
from .security import verify_password, hash_password

app = FastAPI(title='EventLens local API', version='2.0')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('FRONTEND_ORIGINS','http://localhost:8080,http://localhost:3000').split(','),allow_credentials=True,allow_methods=['GET','POST','PUT'],allow_headers=['Content-Type','X-EventLens'])

@app.exception_handler(Exception)
async def unexpected(request, exc):
    import logging
    logging.getLogger('eventlens').error('Operation failed: %s', type(exc).__name__)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={'detail':'Não foi possível concluir a operação.'})

def user(request: Request):
    token = request.cookies.get('eventlens_session','')
    if request.method != 'GET' and request.headers.get('X-EventLens') != '1':
        raise HTTPException(403,'Pedido inválido')
    with connection() as c:
        result = c.execute('SELECT u.id,u.username,u.role FROM el_sessions s JOIN el_users u ON u.id=s.user_id WHERE s.token_hash=%s AND s.expires_at>now() AND u.active', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not result: raise HTTPException(401,'Entre na sua conta')
    return result

def admin(u=Depends(user)):
    if u['role'] != 'admin': raise HTTPException(403,'Acesso administrativo necessário')
    return u

def audit(c, occurrence, u, action, details):
    c.execute('INSERT INTO el_audit(occurrence_id,user_id,action,details) VALUES(%s,%s,%s,%s)',(occurrence,u['id'],action,Jsonb(details)))

def get_occurrence(c, oid):
    o=c.execute('SELECT o.*,t.name AS type_name FROM el_occurrences o LEFT JOIN el_types t ON t.id=o.type_id WHERE o.id=%s',(oid,)).fetchone()
    if not o: raise HTTPException(404,'Ocorrência não encontrada')
    return o

def get_link(c, oid, sid):
    o=get_occurrence(c,oid)
    if not o['type_id']: raise HTTPException(409,'Confirme o tipo do evento antes de avaliar')
    if not c.execute('SELECT id FROM el_solutions WHERE id=%s',(sid,)).fetchone():
        raise HTTPException(404,'Solução não encontrada')
    return c.execute('INSERT INTO el_links(solution_id,type_id,scope_key) VALUES(%s,%s,%s) ON CONFLICT(solution_id,type_id,scope_key) DO UPDATE SET solution_id=excluded.solution_id RETURNING id',(sid,o['type_id'],o['scope_key'])).fetchone()['id']

def recommendations(c, oid):
    o=get_occurrence(c,oid)
    rows=c.execute('''SELECT s.*,l.id AS link_id,count(e.id) FILTER(WHERE e.positive) AS positivos,count(e.id) FILTER(WHERE NOT e.positive) AS negativos,count(e.id) FILTER(WHERE e.positive AND e.created_at>now()-interval '30 days') AS positivos_30d FROM el_links l JOIN el_solutions s ON s.id=l.solution_id LEFT JOIN el_evaluations e ON e.link_id=l.id WHERE l.type_id=%s AND l.scope_key=%s GROUP BY s.id,l.id''',(o['type_id'],o['scope_key'])).fetchall()
    for s in rows:
        s.update(statistics(s['positivos'],s['negativos']))
        s['sources']=c.execute('SELECT * FROM el_sources WHERE solution_id=%s',(s['id'],)).fetchall()
        c.execute('INSERT INTO el_recommendations(occurrence_id,link_id,snapshot) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(oid,s['link_id'],Jsonb(json.loads(json.dumps(s,default=str)))))
    return sorted(rows,key=lambda s:(s['confidence'],s['total']),reverse=True)

class Login(BaseModel):
    username: str = Field(min_length=1,max_length=100)
    password: str = Field(min_length=1,max_length=500)

@app.post('/auth/login')
def login(data: Login, response: Response, request: Request):
    if request.headers.get('X-EventLens') != '1': raise HTTPException(403,'Pedido inválido')
    with connection() as c:
        u=c.execute('SELECT * FROM el_users WHERE username=%s AND active',(data.username,)).fetchone()
        if not u or not verify_password(data.password,u['password_hash']): raise HTTPException(401,'Usuário ou senha inválidos')
        token=secrets.token_urlsafe(40)
        c.execute("INSERT INTO el_sessions VALUES(%s,%s,now()+interval '8 hours')",(hashlib.sha256(token.encode()).hexdigest(),u['id']))
    response.set_cookie('eventlens_session',token,httponly=True,secure=os.getenv('COOKIE_SECURE','true')=='true',samesite='strict',max_age=28800,path='/')
    return {k:u[k] for k in ('id','username','role')}

@app.get('/auth/me')
def me(u=Depends(user)): return u

@app.post('/auth/logout')
def logout(request: Request,response: Response,u=Depends(user)):
    with connection() as c: c.execute('DELETE FROM el_sessions WHERE token_hash=%s',(hashlib.sha256(request.cookies.get('eventlens_session','').encode()).hexdigest(),))
    response.delete_cookie('eventlens_session',path='/')
    return {'ok':True}

class UserCreate(Login):
    role: str = Field(pattern='^(admin|analyst)$')

@app.post('/users')
def create_user(data: UserCreate,u=Depends(admin)):
    if len(data.password)<12: raise HTTPException(422,'Use pelo menos 12 caracteres')
    with connection() as c:
        r=c.execute('INSERT INTO el_users(username,password_hash,role) VALUES(%s,%s,%s) RETURNING id,username,role',(data.username,hash_password(data.password),data.role)).fetchone()
        audit(c,None,u,'user_created',{'username':data.username,'role':data.role})
    return r

class Occurrence(BaseModel):
    title: str = Field(min_length=3,max_length=500)
    external_id: str | None = Field(default=None,min_length=1,max_length=200)
    tenant: str = Field(default='',max_length=200)
    host: str = Field(default='',max_length=200)
    ips: list[str] = Field(default_factory=list,max_length=100)
    environment: str = Field(default='',max_length=200)
    source: str = Field(default='manual',max_length=200)
    system: str = Field(default='',max_length=200)
    technical_context: str = Field(default='',max_length=1000)
    manual_key: UUID | None = None
    new_occurrence: UUID | None = None
    received_at: datetime | None = None

@app.post('/occurrences')
def occurrence(data: Occurrence,u=Depends(user)):
    identity,scope,context=identity_for(data)
    with connection() as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(identity,))
        existing=c.execute('SELECT id,context FROM el_occurrences WHERE identity_key=%s',(identity,)).fetchone()
        if existing:
            if existing['context']!=context:
                raise HTTPException(409,'Identificador externo já utilizado com outro contexto')
            audit(c,existing['id'],u,'searched',{'identity_key':identity})
            return get_occurrence(c,existing['id'])
        name=classify(data.title); tid=None
        if name: tid=c.execute("INSERT INTO el_types(name,key,origin) VALUES(%s,%s,'rule') ON CONFLICT(key) DO UPDATE SET key=excluded.key RETURNING id",(name,normalized(name))).fetchone()['id']
        r=c.execute('INSERT INTO el_occurrences(original_title,type_id,created_by,identity_key,scope_key,context,received_at) VALUES(%s,%s,%s,%s,%s,%s,coalesce(%s,now())) RETURNING id',(data.title,tid,u['id'],identity,scope,Jsonb(context),data.received_at)).fetchone()
        audit(c,r['id'],u,'received',{'original_title':data.title,'classified_as':name,'context':context})
        return get_occurrence(c,r['id'])

@app.get('/types')
def types(u=Depends(user)):
    with connection() as c: return c.execute('SELECT * FROM el_types ORDER BY name').fetchall()

@app.get('/legacy/solutions')
def legacy(u=Depends(user)):
    with connection() as c:
        return c.execute('SELECT s.id,s.procedure,s.author,k.evento AS original_event,k.ticket_numero FROM el_solutions s JOIN kb_solucoes k ON k.id=s.legacy_id ORDER BY k.created_at DESC LIMIT 200').fetchall()

@app.post('/occurrences/{oid}/legacy/{sid}')
def associate_legacy(oid: UUID,sid: UUID,u=Depends(user)):
    with connection() as c:
        if not c.execute('SELECT id FROM el_solutions WHERE id=%s AND legacy_id IS NOT NULL',(sid,)).fetchone():
            raise HTTPException(404,'Solução legada não encontrada')
        link=get_link(c,oid,sid)
        audit(c,oid,u,'legacy_associated',{'solution_id':str(sid),'link_id':str(link)})
    return {'id':sid}

class Classification(BaseModel):
    name: str = Field(min_length=2,max_length=100)

@app.put('/occurrences/{oid}/classification')
def correction(oid: UUID,data: Classification,u=Depends(user)):
    with connection() as c:
        c.execute('SELECT id FROM el_occurrences WHERE id=%s FOR UPDATE',(oid,))
        o=get_occurrence(c,oid)
        tid=c.execute("INSERT INTO el_types(name,key,origin) VALUES(%s,%s,'manual') ON CONFLICT(key) DO UPDATE SET key=excluded.key RETURNING id",(data.name,normalized(data.name))).fetchone()['id']
        if tid==o['type_id']: return o
        c.execute('UPDATE el_occurrences SET type_id=%s WHERE id=%s',(tid,oid))
        audit(c,oid,u,'classification_corrected',{'previous_type':str(o['type_id']),'previous_name':o['type_name'],'new_type':str(tid),'new_name':data.name})
        return get_occurrence(c,oid)

@app.get('/occurrences/{oid}/recommendations')
def kb(oid: UUID,u=Depends(user)):
    with connection() as c:
        rows=recommendations(c,oid)
        p=c.execute("SELECT value FROM el_settings WHERE key='confidence'").fetchone()
        return {'occurrence':get_occurrence(c,oid),'solutions':rows,'otrs_required':not sufficient(rows,p['value'] if p else None),'policy':p['value'] if p else None}

class Policy(BaseModel):
    min_evaluations: int = Field(ge=1)
    min_success: float = Field(ge=0,le=100)
    wilson_lower: float = Field(ge=0,le=1)

@app.put('/settings/confidence')
def policy(data: Policy,u=Depends(admin)):
    with connection() as c:
        c.execute("INSERT INTO el_settings VALUES('confidence',%s) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(Jsonb(data.model_dump()),))
        audit(c,None,u,'confidence_policy',data.model_dump())
    return data

class Source(BaseModel):
    ticket_number: str = Field(min_length=1,max_length=50)
    article_id: str | None = Field(default=None,max_length=100)
    ticket_title: str = Field(default='',max_length=500)
    author: str = Field(default='',max_length=200)
    source_date: str = Field(default='',max_length=100)
    content: str = Field(min_length=5,max_length=20000)
    metadata: dict = Field(default_factory=dict)

class Solution(BaseModel):
    procedure: str = Field(min_length=5,max_length=20000)
    source: Source | None = None
    applied: bool = False
    comment: str = Field(default='',max_length=20000)

def save_solution(c,oid,data,u):
    source=data.source
    if source:
        key=(os.getenv('OTRS_SOURCE_ID','local-otrs')+':'+source.ticket_number+':'+(source.article_id or hashlib.sha256(source.content.encode()).hexdigest()))
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(key,))
        found=c.execute('SELECT solution_id FROM el_sources WHERE source_key=%s',(key,)).fetchone()
        if found: sid=found['solution_id']
        else:
            sid=c.execute("INSERT INTO el_solutions(procedure,author,origin) VALUES(%s,%s,'otrs') RETURNING id",(source.content,source.author)).fetchone()['id']
            c.execute('INSERT INTO el_sources(solution_id,source_key,ticket_number,article_id,ticket_title,author,source_date,content,metadata) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)',(sid,key,source.ticket_number,source.article_id,source.ticket_title,source.author,source.source_date,source.content,Jsonb(source.metadata)))
    else:
        sid=c.execute("INSERT INTO el_solutions(procedure,author,origin) VALUES(%s,%s,'analista') RETURNING id",(data.procedure,u['username'])).fetchone()['id']
    link=get_link(c,oid,sid)
    c.execute('INSERT INTO el_recommendations(occurrence_id,link_id,snapshot) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(oid,link,Jsonb({'procedure':data.procedure,'source':source.model_dump() if source else None})))
    audit(c,oid,u,'solution_saved',{'solution_id':str(sid),'comment':data.comment})
    if data.applied:
        record_application(c,oid,sid,u,data.comment,False)
    return sid


def record_application(c,oid,sid,u,comment,resolved):
    c.execute('SELECT id FROM el_occurrences WHERE id=%s FOR UPDATE',(oid,))
    o=get_occurrence(c,oid)
    get_link(c,oid,sid)
    r=c.execute('INSERT INTO el_applications(occurrence_id,solution_id,user_id,type_id,type_name,comment,resolved) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id',(oid,sid,u['id'],o['type_id'],o['type_name'],comment,resolved)).fetchone()
    c.execute("UPDATE el_occurrences SET applied_solution_id=%s,status=%s,resolved_at=CASE WHEN %s THEN now() ELSE NULL END WHERE id=%s",(sid,'resolved' if resolved else 'in_progress',resolved,oid))
    audit(c,oid,u,'solution_applied',{'application_id':str(r['id']),'solution_id':str(sid),'resolved':resolved,'comment':comment})
    return r

class Application(BaseModel):
    solution_id: UUID
    comment: str = Field(default='',max_length=20000)
    resolved: bool = False

@app.post('/occurrences/{oid}/applications')
def application(oid: UUID,data: Application,u=Depends(user)):
    with connection() as c:
        return record_application(c,oid,data.solution_id,u,data.comment,data.resolved)

@app.post('/occurrences/{oid}/solutions')
def solution(oid: UUID,data: Solution,u=Depends(user)):
    with connection() as c: return {'id':save_solution(c,oid,data,u)}

class Evaluation(BaseModel):
    solution_id: UUID
    positive: bool
    attempt_key: UUID
    comment: str = Field(default='',max_length=20000)
    correct_procedure: str | None = Field(default=None,min_length=5,max_length=20000)

@app.post('/occurrences/{oid}/evaluations')
def evaluate(oid: UUID,data: Evaluation,u=Depends(user)):
    fingerprint=digest({'occurrence_id':str(oid),'user_id':str(u['id']),**data.model_dump(mode='json')})
    with connection() as c:
        # Global attempt lock precedes occurrence lock: safe across different occurrences.
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(str(data.attempt_key),))
        c.execute('SELECT id FROM el_occurrences WHERE id=%s FOR UPDATE',(oid,))
        o=get_occurrence(c,oid)
        existing=c.execute('SELECT e.*,l.solution_id FROM el_evaluations e JOIN el_links l ON l.id=e.link_id WHERE attempt_key=%s',(data.attempt_key,)).fetchone()
        if existing:
            same=(existing['request_fingerprint']==fingerprint) if existing['request_fingerprint'] else (existing['occurrence_id']==oid and existing['solution_id']==data.solution_id and existing['positive']==data.positive and existing['user_id']==u['id'] and (existing['comment'] or '')==data.comment and data.correct_procedure is None)
            if not same: raise HTTPException(409,'Tentativa já utilizada para outros dados')
            return {'id':existing['id'],'duplicate':True,'corrective_solution_id':existing['corrective_solution_id']}
        if data.positive and data.correct_procedure:
            raise HTTPException(422,'Procedimento corretivo pertence à avaliação negativa')
        link=get_link(c,oid,data.solution_id)
        c.execute('INSERT INTO el_recommendations(occurrence_id,link_id,snapshot) SELECT %s,%s,jsonb_build_object(\'procedure\',procedure) FROM el_solutions WHERE id=%s ON CONFLICT DO NOTHING',(oid,link,data.solution_id))
        corrective=save_solution(c,oid,Solution(procedure=data.correct_procedure,comment=data.comment),u) if data.correct_procedure else None
        r=c.execute('INSERT INTO el_evaluations(occurrence_id,link_id,positive,comment,user_id,attempt_key,request_fingerprint,evaluated_type_name,corrective_solution_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',(oid,link,data.positive,data.comment,u['id'],data.attempt_key,fingerprint,o['type_name'],corrective)).fetchone()
        audit(c,oid,u,'evaluation',{'evaluation_id':str(r['id']),'solution_id':str(data.solution_id),'link_id':str(link),'evaluated_type':o['type_name'],'positive':data.positive,'corrective_solution_id':str(corrective) if corrective else None,'comment':data.comment})
        return {**r,'duplicate':False,'corrective_solution_id':corrective}

@app.get('/occurrences/{oid}/history')
def history(oid: UUID,u=Depends(user)):
    with connection() as c:
        return {
            'occurrence':get_occurrence(c,oid),
            'recommendations':c.execute('SELECT r.*,l.solution_id,l.type_id,t.name AS recommended_type FROM el_recommendations r JOIN el_links l ON l.id=r.link_id JOIN el_types t ON t.id=l.type_id WHERE r.occurrence_id=%s ORDER BY r.created_at,r.id',(oid,)).fetchall(),
            'evaluations':c.execute('SELECT e.*,u.username,s.procedure,l.solution_id,l.type_id,coalesce(e.evaluated_type_name,t.name) AS evaluated_type,cs.procedure AS corrective_procedure FROM el_evaluations e JOIN el_users u ON u.id=e.user_id JOIN el_links l ON l.id=e.link_id JOIN el_solutions s ON s.id=l.solution_id JOIN el_types t ON t.id=l.type_id LEFT JOIN el_solutions cs ON cs.id=e.corrective_solution_id WHERE e.occurrence_id=%s ORDER BY e.created_at,e.id',(oid,)).fetchall(),
            'audit':c.execute('SELECT a.*,u.username FROM el_audit a LEFT JOIN el_users u ON u.id=a.user_id WHERE occurrence_id=%s ORDER BY created_at,a.id',(oid,)).fetchall(),
            'applications':c.execute('SELECT a.*,s.procedure,u.username FROM el_applications a JOIN el_solutions s ON s.id=a.solution_id JOIN el_users u ON u.id=a.user_id WHERE a.occurrence_id=%s ORDER BY a.created_at,a.id',(oid,)).fetchall(),
            'applied':c.execute('SELECT s.* FROM el_solutions s JOIN el_occurrences o ON o.applied_solution_id=s.id WHERE o.id=%s',(oid,)).fetchone()
        }

@app.post('/occurrences/{oid}/otrs')
def otrs(oid: UUID,u=Depends(user)):
    with connection() as c: o=get_occurrence(c,oid)
    script=os.getenv('OTRS_SCRIPT')
    if not script or not os.path.isfile(script): raise HTTPException(503,'Motor OTRS oficial não configurado no servidor')
    try:
        p=subprocess.run([sys.executable,script,'evento',o['original_title'],'--json'],capture_output=True,text=True,timeout=120,cwd=os.path.dirname(os.path.abspath(script)))
        if p.returncode: raise ValueError('motor failed')
        raw=json.loads(p.stdout[p.stdout.index('{'):])
        if not isinstance(raw.get('candidatos'),list): raise ValueError('invalid contract')
    except (ValueError,OSError,subprocess.TimeoutExpired): raise HTTPException(502,'Não foi possível obter os resultados do OTRS')
    with connection() as c: audit(c,oid,u,'otrs_consulted',{'result':raw})
    return raw

@app.get('/health')
def health():
    with connection() as c: c.execute('SELECT 1')
    return {'status':'ok'}
