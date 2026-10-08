"""Reusable identity/completeness contracts. Hashes are not scientific approval."""
from __future__ import annotations
import hashlib,json

PROTOCOL='nemesis-integrity/1'
class IntegrityError(ValueError):pass

def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')

def digest(value):return hashlib.sha256(canonical(value)).hexdigest()

def strict_json(value):
    def pairs(items):
        result={}
        for key,item in items:
            if key in result:raise IntegrityError('Duplicate JSON key: '+key)
            result[key]=item
        return result
    def invalid(value):raise IntegrityError('Non-finite JSON value: '+value)
    try:
        if isinstance(value,(bytes,bytearray)):value=bytes(value).decode('utf8','strict')
        return json.loads(value,object_pairs_hook=pairs,parse_constant=invalid)
    except (UnicodeError,ValueError) as exc:raise IntegrityError('Invalid exact JSON: '+str(exc)) from exc

def manifest(value,*,boundary,snapshot,scope,counts,complete):
    if not isinstance(boundary,str) or not boundary or not isinstance(snapshot,str) or not snapshot:
        raise IntegrityError('Boundary and snapshot identities required')
    if type(complete) is not bool or not isinstance(scope,dict) or not scope:
        raise IntegrityError('Explicit scope and completeness required')
    if not isinstance(counts,dict) or any(type(n) is not int or n<0 for n in counts.values()):
        raise IntegrityError('Nonnegative integer counts required')
    data=canonical(value)
    return {'protocol':PROTOCOL,'encoding':'canonical-json-utf8/1','boundary':boundary,
        'snapshot':snapshot,'scope':scope,'counts':counts,'complete':complete,
        'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def verify(value,proof,*,boundary,snapshot,scope,counts,complete):
    expected=manifest(value,boundary=boundary,snapshot=snapshot,scope=scope,counts=counts,complete=complete)
    if canonical(proof)!=canonical(expected):raise IntegrityError('Transfer identity, bytes, counts, scope or completeness mismatch')
    return True

def context_proof(packet):
    graph=packet.get('planning_graph',{})
    counts={k:len(graph[k]) for k in ('nodes','edges','reviews')}
    counts['coverage_inventory']=len(packet['coverage_inventory'])
    return manifest(packet,boundary='compiler-context',snapshot=digest(graph),
        scope={'graph':'complete','advisory_lists':'bounded; not exhaustive'},counts=counts,complete=True)

def verify_context(packet):
    if not isinstance(packet,dict):raise IntegrityError('Context must be an object')
    body={k:v for k,v in packet.items() if k!='integrity'}
    graph=body.get('planning_graph',{})
    if any(not isinstance(graph.get(k),list) for k in ('nodes','edges','reviews')):
        raise IntegrityError('Complete planning graph required')
    inventory=body.get('coverage_inventory')
    if not isinstance(inventory,list):raise IntegrityError('Complete inventory required')
    ids=[n.get('id') for n in graph['nodes']]
    if any(not isinstance(n,str) or not n for n in ids) or len(ids)!=len(set(ids)):
        raise IntegrityError('Planning nodes require unique identities')
    if {n.get('id') for n in inventory}!=set(ids) or len(inventory)!=len(ids):
        raise IntegrityError('Inventory differs from complete planning graph')
    counts=body.get('counts',{})
    if any(type(counts.get(k)) is not int or counts[k]!=len(graph[k]) for k in ('nodes','edges','reviews')):
        raise IntegrityError('Context counts differ from graph')
    expected=context_proof(body)
    if canonical(packet.get('integrity'))!=canonical(expected):raise IntegrityError('Context manifest mismatch or missing')
    return body
