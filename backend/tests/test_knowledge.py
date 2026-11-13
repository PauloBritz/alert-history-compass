import os
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.db import connection
from backend.security import hash_password
from backend.domain import classify, statistics

@pytest.fixture()
def client():
    with connection() as c:
        for table in ['el_audit','el_evaluations','el_recommendations','el_sources','el_occurrences','el_links','el_solutions','el_types','el_sessions','el_users','el_settings']:
            c.execute('DELETE FROM '+table)
        c.execute("INSERT INTO el_users(username,password_hash,role) VALUES('tester',%s,'admin')",(hash_password('test-only-password'),))
    with TestClient(app) as client:
        r=client.post('/auth/login',json={'username':'tester','password':'test-only-password'},headers={'X-EventLens':'1'})
        assert r.status_code==200
        client.headers['X-EventLens']='1'
        yield client

def occurrence(c,title='LINK DOWN - ROTEADOR 01'):
    r=c.post('/occurrences',json={'title':title});assert r.status_code==200,r.text;return r.json()['id']

def solution(c,oid):
    r=c.post(f'/occurrences/{oid}/solutions',json={'procedure':'Restart and validate the link'});assert r.status_code==200,r.text;return r.json()['id']

def vote(c,oid,sid,positive,**kw):
    return c.post(f'/occurrences/{oid}/evaluations',json={'solution_id':sid,'positive':positive,'attempt_key':str(uuid4()),**kw})

def test_independent_statistics_and_no_global_rate(client):
    a=occurrence(client);b=occurrence(client,'INTERFACE 0/1 - SWITCH 01');sid=solution(client,a)
    for oid,positive,negative in [(a,10,5),(b,2,13)]:
        for n in range(positive+negative):assert vote(client,oid,sid,n<positive).status_code==200
    ra=client.get(f'/occurrences/{a}/recommendations').json()['solutions'][0]
    rb=client.get(f'/occurrences/{b}/recommendations').json()['solutions'][0]
    assert (ra['taxa_sucesso'],ra['positivos'],ra['negativos'])==(66.7,10,5)
    assert (rb['taxa_sucesso'],rb['positivos'],rb['negativos'])==(13.3,2,13)
    assert ra['taxa_sucesso']!=40 and rb['taxa_sucesso']!=40

def test_negative_does_not_disable(client):
    oid=occurrence(client);sid=solution(client,oid);assert vote(client,oid,sid,False).status_code==200
    row=client.get(f'/occurrences/{oid}/recommendations').json()['solutions'][0]
    assert row['status']=='active' and row['negativos']==1

def test_unvalidated(client):
    oid=occurrence(client);solution(client,oid)
    row=client.get(f'/occurrences/{oid}/recommendations').json()['solutions'][0]
    assert row['validation']=='AINDA NÃO VALIDADA' and row['taxa_sucesso'] is None

def test_otrs_idempotent_and_unvalidated(client):
    oid=occurrence(client)
    data={'procedure':'Historical restart procedure','source':{'ticket_number':'123','article_id':'456','content':'Historical restart procedure','metadata':{'queue':'NOC','client':'customer'}}}
    first=client.post(f'/occurrences/{oid}/solutions',json=data).json()
    second=client.post(f'/occurrences/{oid}/solutions',json=data).json()
    assert first['id']==second['id']
    row=client.get(f'/occurrences/{oid}/recommendations').json()['solutions'][0]
    assert row['total']==0 and row['sources'][0]['metadata']['queue']=='NOC'
    with connection() as c:assert c.execute('SELECT count(*) AS n FROM el_sources').fetchone()['n']==1

def test_learning_and_history(client):
    oid=occurrence(client);sid=solution(client,oid)
    assert vote(client,oid,sid,False,correct_procedure='Replace the failed cable and validate',comment='Cable damaged').status_code==200
    h=client.get(f'/occurrences/{oid}/history').json()
    assert h['applied']['procedure']=='Replace the failed cable and validate'
    assert h['applied']['author']=='tester' and h['applied']['origin']=='analista'
    assert len(h['evaluations'])==1 and h['evaluations'][0]['positive'] is False
    assert h['recommendations'] and h['audit']
    rows=client.get(f'/occurrences/{oid}/recommendations').json()['solutions']
    assert len(rows)==2

def test_duplicate_attempt_and_legitimate_retry(client):
    oid=occurrence(client);sid=solution(client,oid)
    data={'solution_id':sid,'positive':True,'attempt_key':str(uuid4())}
    assert client.post(f'/occurrences/{oid}/evaluations',json=data).status_code==200
    assert client.post(f'/occurrences/{oid}/evaluations',json=data).json()['duplicate'] is True
    assert vote(client,oid,sid,True).status_code==200
    assert client.get(f'/occurrences/{oid}/recommendations').json()['solutions'][0]['total']==2

def test_original_and_classification_history(client):
    title='  LINK DOWN - ROTEADOR 01 IP 10.0.0.1  '
    a=occurrence(client,title);b=occurrence(client,'link down - ROTEADOR 02')
    with connection() as c:
        aa=c.execute('SELECT * FROM el_occurrences WHERE id=%s',(a,)).fetchone();bb=c.execute('SELECT * FROM el_occurrences WHERE id=%s',(b,)).fetchone()
        assert aa['original_title']==title and aa['type_id']==bb['type_id']
    sid=solution(client,a);vote(client,a,sid,True)
    assert client.put(f'/occurrences/{a}/classification',json={'name':'INTERFACE DOWN'}).status_code==200
    assert client.get(f'/occurrences/{a}/recommendations').json()['solutions']==[]
    history=client.get(f'/occurrences/{a}/history').json()
    assert history['evaluations'][0]['evaluated_type']=='LINK DOWN'
    assert history['occurrence']['original_title']==title
    assert classify('LINK DOWN INTERFACE 0/1') is None
    assert classify('HOST 01 unavailable') is None

def test_transaction_rollback(client,monkeypatch):
    import backend.main as main
    oid=occurrence(client);sid=solution(client,oid)
    def fail(*args,**kw):raise RuntimeError('simulated failure')
    monkeypatch.setattr(main,'save_solution',fail)
    with pytest.raises(RuntimeError):vote(client,oid,sid,False,correct_procedure='Correct procedure to save')
    with connection() as c:
        assert c.execute('SELECT count(*) AS n FROM el_evaluations').fetchone()['n']==0
        assert c.execute('SELECT count(*) AS n FROM el_solutions').fetchone()['n']==1

def test_wilson_sample_size_and_config(client):
    assert statistics(1,0)['confidence']<statistics(40,10)['confidence']
    oid=occurrence(client);sid=solution(client,oid)
    assert client.get(f'/occurrences/{oid}/recommendations').json()['otrs_required'] is True
    client.put('/settings/confidence',json={'min_evaluations':2,'min_success':60,'wilson_lower':0.1})
    vote(client,oid,sid,True);vote(client,oid,sid,True)
    assert client.get(f'/occurrences/{oid}/recommendations').json()['otrs_required'] is False

def test_security(client):
    client.cookies.clear()
    assert client.get('/types').status_code==401

def test_legacy_preserved(client):
    with connection() as c:
        assert c.execute('SELECT count(*) AS n FROM kb_solucoes').fetchone()['n']>=1
        assert c.execute('SELECT count(*) AS n FROM kb_votos').fetchone()['n']>=1
