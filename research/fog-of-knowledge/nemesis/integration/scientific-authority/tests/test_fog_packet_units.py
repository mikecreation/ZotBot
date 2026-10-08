"""Synthetic capacity faults: preserve full inputs and independently review units."""
import copy,json
import pytest
from sim.fog_packet_units import author_units,review_units,merge_authored,size

def test_author_partition_keeps_every_source_verbatim_and_all_context():
    sources=[{'id':str(i),'text':'Exact complete scientific evidence λ'*40} for i in range(10)]
    value={'sources':sources,'mission':'current objective','existing_targets':[{'id':'prior','summary':'Unchanged representation'}]}
    units=author_units(value,4500)
    assert len(units)>1 and all(size(u)<=4500 for u in units)
    assert [s for u in units for s in u['sources']]==sources
    assert all(u['existing_targets']==value['existing_targets'] for u in units)

def test_atomic_capacity_block_does_not_mutate_or_discard_input():
    value={'sources':[{'id':'huge','text':'x'*6000}],'existing_targets':[]};original=copy.deepcopy(value)
    with pytest.raises(ValueError,match='full capture'):author_units(value,2000)
    assert value==original

def test_assembly_preserves_findings_and_leaves_identity_conflicts_for_compiler():
    packets=[{'source_ids':['a'],'nodes':[{'id':'same','summary':'First'}]},
             {'source_ids':['b'],'nodes':[{'id':'same','summary':'Different'}]}]
    merged=merge_authored(packets)
    assert merged['source_ids']==['a','b'] and merged['nodes']==[p['nodes'][0] for p in packets]
    with pytest.raises(ValueError,match='blocked'):merge_authored([*packets,{'blocked_reason':'No actual source text'}])

def test_review_partition_keeps_exact_full_candidate_hash_and_every_assertion():
    from sim.fog_scientific_planner import digest
    nodes=[{'id':str(i),'summary':'distinct scoped result '+str(i)} for i in range(30)]
    sources=[{'id':str(i),'text':'verbatim '+str(i)+'x'*1000} for i in range(30)]
    assertions=[{'id':'assertion'+str(i),'target_kind':'node','target_sha256':digest(n),'canonical_record':n,
                 'support':[{'source_id':str(i),'quote':'verbatim '+str(i)}]} for i,n in enumerate(nodes)]
    packet={'candidate_sha256':'original-full-hash','context_sha256':'original-context-hash',
            'records':{'manifest.json':{'batch_id':'synthetic'},'nodes.jsonl':nodes,'sources.jsonl':sources,
                       'assertions.jsonl':assertions,'edges.jsonl':[],'reviews.jsonl':[],'taxonomy.jsonl':[],'identities.jsonl':[]},
            'existing_endpoints':[],'representation_policy':{'neutral':'still needs support'}}
    original=copy.deepcopy(packet);units=review_units(packet,6000)
    assert len(units)==30 and all(size(u)<=6000 for u in units)
    assert [a for u in units for a in u['records']['assertions.jsonl']]==assertions
    assert all(u['candidate_sha256']=='original-full-hash' and u['context_sha256']=='original-context-hash' for u in units)
    assert packet==original
