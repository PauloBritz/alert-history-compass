"""Identity is contextual; a title alone never identifies a manual incident."""
import hashlib
import json
from uuid import uuid4


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def scope_for(context):
    # Hosts share efficacy within a tenant, not across tenants/environments/origins.
    return digest({k: context.get(k, '') for k in ('tenant', 'environment', 'source', 'system')})


def identity_for(data):
    context = {k: ' '.join((getattr(data, k) or '').strip().casefold().split())
               for k in ('tenant', 'host', 'environment', 'source', 'system', 'technical_context')}
    context['ips'] = sorted(set(ip.strip().casefold() for ip in data.ips if ip.strip()))
    scope = scope_for(context)
    if data.external_id:
        identity = {'scope': scope, 'external_id': data.external_id.strip()}
    elif any(context[k] for k in ('tenant', 'host', 'ips', 'environment', 'system', 'technical_context')):
        identity = {'context': context, 'title': ' '.join(data.title.casefold().split())}
    else:
        identity = {'scope': scope, 'manual_key': str(data.manual_key or uuid4())}
    if data.new_occurrence:
        identity['new_occurrence'] = str(data.new_occurrence)
    context['external_id'] = data.external_id
    return digest(identity), scope, context