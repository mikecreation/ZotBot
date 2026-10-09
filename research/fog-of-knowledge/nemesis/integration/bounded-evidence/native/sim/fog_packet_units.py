"""Durable capacity partitioning; raw inputs and every unfinished unit survive.

No claim or source is shortened. A single indivisible evidence unit that cannot
fit remains explicitly blocked; partitioning never creates review approval.
"""
import copy,hashlib,json

def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def size(value):return len(encode(value).encode())

def author_units(value,limit):
    base=copy.deepcopy(value);sources=base.pop('sources')
    units=[];current=[]
    for source in sources:
        proposal={**base,'sources':current+[source]}
        if size(proposal)>limit and current:
            units.append({**base,'sources':current});current=[]
        single={**base,'sources':[source]}
        if size(single)>limit:raise ValueError('Atomic source exceeds author capacity; full capture and pending findings retained: '+source['id'])
        current.append(source)
    if current:units.append({**base,'sources':current})
    for i,unit in enumerate(units):
        unit['partition']={'index':i,'count':len(units),'rule':'Author only this unit; other source units remain pending. Do not invent cross-unit relationships. Return every supported finding, without a target quota.'}
        if size(unit)>limit:raise ValueError('Partition metadata exceeds author capacity; all inputs retained')
    return units

def review_units(packet,limit,measure=size):
    if measure(packet)<=limit:return [packet]
    result=[];records=packet['records'];assertions=records['assertions.jsonl']
    file_for={'node':'nodes.jsonl','edge':'edges.jsonl','review':'reviews.jsonl','taxonomy':'taxonomy.jsonl','identity':'identities.jsonl'}
    def record_hash(record):return hashlib.sha256(json.dumps(record,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    for assertion in assertions:
        subset={k:[] for k in records};subset['manifest.json']=copy.deepcopy(records['manifest.json'])
        subset['assertions.jsonl']=[copy.deepcopy(assertion)]
        kind=assertion['target_kind'];filename=file_for[kind]
        subset[filename]=[copy.deepcopy(r) for r in records[filename] if record_hash(r)==assertion['target_sha256']]
        if not subset[filename]:raise ValueError('Partition target does not match exact assertion hash')
        source_ids={s['source_id'] for s in assertion['support']}
        subset['sources.jsonl']=[copy.deepcopy(s) for s in records['sources.jsonl'] if s['id'] in source_ids]
        unit={**copy.deepcopy(packet),'records':subset,
              'existing_endpoints':copy.deepcopy(packet.get('existing_endpoints',[]))+copy.deepcopy(records['nodes.jsonl'])}
        unit['partition']={'index':len(result),'assertion_id':assertion['id'],
            'rule':'This exact assertion belongs to the unchanged full candidate/context hashes. Other assertions require separate reviews; never approve them implicitly.'}
        if measure(unit)>limit:raise ValueError('Atomic review evidence exceeds capacity; full candidate and all pending assertions retained: '+assertion['id'])
        result.append(unit)
    if not result:raise ValueError('No assertions to partition')
    return result

def merge_authored(packets):
    result={'source_ids':[],**{k:[] for k in ('nodes','edges','reviews','assertions','taxonomy','identities')}}
    for packet in packets:
        if packet.get('blocked_reason'):raise ValueError('Source unit blocked: '+packet['blocked_reason'])
        for sid in packet.get('source_ids',[]):
            if sid not in result['source_ids']:result['source_ids'].append(sid)
        for key in ('nodes','edges','reviews','assertions','taxonomy','identities'):
            value=packet.get(key,[])
            if not isinstance(value,list):raise ValueError('Partition '+key+' must be an array')
            result[key].extend(copy.deepcopy(value))
    # Duplicate IDs, conflicts and relationships are deliberately left to the
    # existing compiler: array assembly must never silently merge identities.
    return result
