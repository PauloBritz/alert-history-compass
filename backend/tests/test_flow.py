from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor
from backend.tests.test_knowledge import client, occurrence, solution, vote
from backend.db import connection


def create(client, **kwargs):
    r=client.post('/occurrences',json={'title':'LINK DOWN - server', **kwargs})
    assert r.status_code==200,r.text
    return r.json()


def test_save_does_not_apply_or_resolve(client):
    oid=occurrence(client); sid=solution(client,oid)
    h=client.get(f'/occurrences/{oid}/history').json()
    assert h['occurrence']['status']=='pending'
    assert h['applied'] is None and h['evaluations']==[] and h['applications']==[]
    assert h['recommendations'][0]['solution_id']==sid


def test_unclassified_evaluation_rolls_back(client):
    oid=occurrence(client);sid=solution(client,oid);other=occurrence(client,'Timac Agro - Zabbix Server')
    r=vote(client,other,sid,True)
    assert r.status_code==409 and 'Confirme o tipo' in r.json()['detail']
    assert client.get(f'/occurrences/{other}/history').json()['evaluations']==[]


def test_positive_updates_statistics_not_resolution(client):
    oid=occurrence(client);sid=solution(client,oid)
    assert vote(client,oid,sid,True).status_code==200
    row=client.get(f'/occurrences/{oid}/recommendations').json()['solutions'][0]
    assert (row['positivos'],row['total'],row['taxa_sucesso'])==(1,1,100)
    h=client.get(f'/occurrences/{oid}/history').json()
    assert h['occurrence']['status']=='pending' and h['applied'] is None


def test_negative_preserves_existing_application(client):
    oid=occurrence(client);sid=solution(client,oid)
    client.post(f'/occurrences/{oid}/applications',json={'solution_id':sid,'resolved':False})
    assert vote(client,oid,sid,False,correct_procedure='Try replacing damaged hardware',comment='Original failed').status_code==200
    h=client.get(f'/occurrences/{oid}/history').json()
    assert h['occurrence']['status']=='in_progress' and h['occurrence']['applied_solution_id']==sid
    assert h['evaluations'][0]['solution_id']==sid
    assert h['evaluations'][0]['corrective_procedure']=='Try replacing damaged hardware'
    assert len(h['applications'])==1


def test_explicit_application_only_resolves_when_requested(client):
    oid=occurrence(client);sid=solution(client,oid)
    assert client.post(f'/occurrences/{oid}/applications',json={'solution_id':sid}).status_code==200
    h=client.get(f'/occurrences/{oid}/history').json()
    assert h['occurrence']['status']=='in_progress' and not h['applications'][0]['resolved']
    assert client.post(f'/occurrences/{oid}/applications',json={'solution_id':sid,'resolved':True}).status_code==200
    h=client.get(f'/occurrences/{oid}/history').json()
    assert h['occurrence']['status']=='resolved' and h['applications'][1]['resolved']
    assert len(h['evaluations'])==0


def test_context_identity_reuses_history_and_receipt(client):
    context={'tenant':'Timac','host':'Zabbix Server','source':'zabbix','received_at':'2026-11-16T19:19:00Z'}
    a=create(client,**context);sid=solution(client,a['id']);vote(client,a['id'],sid,True)
    b=create(client,**{**context,'received_at':'2026-11-16T20:19:00Z'})
    assert a['id']==b['id'] and b['received_at']==a['received_at']
    assert len(client.get(f"/occurrences/{b['id']}/history").json()['evaluations'])==1


def test_same_title_different_host_and_tenant(client):
    a=create(client,tenant='A',host='01');b=create(client,tenant='A',host='02');c=create(client,tenant='B',host='01')
    assert len({a['id'],b['id'],c['id']})==3
    sid=solution(client,a['id']);vote(client,a['id'],sid,True)
    for other in [b,c]:
        h=client.get(f"/occurrences/{other['id']}/history").json()
        assert h['evaluations']==[] and h['recommendations']==[] and h['applications']==[]


def test_tenant_statistics_are_separate(client):
    a=create(client,tenant='A',host='01');b=create(client,tenant='B',host='01');sid=solution(client,a['id'])
    vote(client,a['id'],sid,True);vote(client,b['id'],sid,False)
    ra=client.get(f"/occurrences/{a['id']}/recommendations").json()['solutions'][0]
    rb=client.get(f"/occurrences/{b['id']}/recommendations").json()['solutions'][0]
    assert (ra['positivos'],ra['negativos'])==(1,0)
    assert (rb['positivos'],rb['negativos'])==(0,1)


def test_external_id_scoped_and_context_conflict(client):
    a=create(client,tenant='A',source='zabbix',external_id='123',host='01')
    assert create(client,tenant='A',source='zabbix',external_id='123',host='01')['id']==a['id']
    assert create(client,tenant='B',source='zabbix',external_id='123',host='01')['id']!=a['id']
    assert client.post('/occurrences',json={'title':'LINK DOWN - server','tenant':'A','source':'zabbix','external_id':'123','host':'02'}).status_code==409


def test_manual_identity_never_title_only_and_new_incident(client):
    key=str(uuid4());a=create(client,manual_key=key);b=create(client,manual_key=key)
    assert a['id']==b['id']
    assert create(client)['id']!=a['id']
    assert create(client,manual_key=key,new_occurrence=str(uuid4()))['id']!=a['id']


def test_idempotency_rejects_changed_payload_and_survives_reclassification(client):
    oid=occurrence(client);sid=solution(client,oid);other=solution(client,oid)
    data={'solution_id':sid,'positive':False,'attempt_key':str(uuid4()),'comment':'Failed','correct_procedure':'Replace the failed cable'}
    assert client.post(f'/occurrences/{oid}/evaluations',json=data).status_code==200
    for change in [{'solution_id':other},{'positive':True},{'comment':'changed'},{'correct_procedure':'Restart another process'}]:
        assert client.post(f'/occurrences/{oid}/evaluations',json={**data,**change}).status_code==409
    another=occurrence(client)
    assert client.post(f'/occurrences/{another}/evaluations',json=data).status_code==409
    client.put(f'/occurrences/{oid}/classification',json={'name':'OTHER TYPE'})
    assert client.post(f'/occurrences/{oid}/evaluations',json=data).json()['duplicate'] is True
    h=client.get(f'/occurrences/{oid}/history').json()
    assert len(h['evaluations'])==1 and h['evaluations'][0]['evaluated_type']=='LINK DOWN'


def test_repeated_classification_has_no_redundant_audit(client):
    oid=occurrence(client)
    for _ in range(2): client.put(f'/occurrences/{oid}/classification',json={'name':'LINK DOWN'})
    assert not [a for a in client.get(f'/occurrences/{oid}/history').json()['audit'] if a['action']=='classification_corrected']
    client.put(f'/occurrences/{oid}/classification',json={'name':'OTHER TYPE'})
    assert len([a for a in client.get(f'/occurrences/{oid}/history').json()['audit'] if a['action']=='classification_corrected'])==1


def test_concurrent_attempt_only_counted_once(client):
    oid=occurrence(client);sid=solution(client,oid)
    data={'solution_id':sid,'positive':True,'attempt_key':str(uuid4())}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:client.post(f'/occurrences/{oid}/evaluations',json=data),range(2)))
    assert all(r.status_code==200 for r in results)
    assert sum(r.json()['duplicate'] for r in results)==1
    assert client.get(f'/occurrences/{oid}/recommendations').json()['solutions'][0]['total']==1


def test_failure_after_corrective_save_is_atomic(client,monkeypatch):
    import backend.main as main
    import pytest
    oid=occurrence(client);sid=solution(client,oid);original=main.audit
    def fail(c,occ,u,action,details):
        if action=='evaluation': raise RuntimeError('audit failure')
        return original(c,occ,u,action,details)
    monkeypatch.setattr(main,'audit',fail)
    with pytest.raises(RuntimeError): vote(client,oid,sid,False,correct_procedure='Corrective procedure created before failure')
    with connection() as c:
        assert c.execute('SELECT count(*) AS n FROM el_evaluations').fetchone()['n']==0
        assert c.execute('SELECT count(*) AS n FROM el_solutions').fetchone()['n']==1
        assert c.execute("SELECT count(*) AS n FROM el_audit WHERE action='solution_saved'").fetchone()['n']==1