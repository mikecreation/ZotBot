"""Prepare exact small boundary fixes WITHOUT editing/reloading the live runtime."""
import argparse,ast,difflib,hashlib,json
from pathlib import Path
from research_integrity import IntegrityError
ROOT=Path(__file__).resolve().parents[1]

def once(text,old,new):
    if text.count(old)!=1:raise IntegrityError('Upgrade preimage differs; inspect dependency assumption before adapting patch')
    return text.replace(old,new)

def prepare():
    source=ROOT/'nemesis/integration'
    originals={
        'native/sim/github_sandbox.py':(source/'scientific-authority/sim/github_sandbox.py').read_bytes(),
        'native/sim/github_workspace.py':(source/'scientific-authority/sim/github_workspace.py').read_bytes(),
        'extension/contentScript.js':(source/'brain-transport/contentScript.js').read_bytes()}
    transformed={k:v.decode('utf8') for k,v in originals.items()}
    key='native/sim/github_sandbox.py'
    transformed[key]=once(transformed[key],"return redact((raw if limit is None else raw[:limit]).decode('utf-8',errors))",
        "decoded=(raw if limit is None else raw[:limit]).decode('utf-8',errors)\n        # Exact scientific stdout is not diagnostic text.\n        return decoded if errors=='strict' and limit is None else redact(decoded)")
    key='native/sim/github_workspace.py'
    transformed[key]=once(transformed[key],"key = 'gh:tree:%s/%s:%s' % (owner, repo, sha)","key = 'gh:tree-integrity-v2:%s/%s:%s' % (owner, repo, sha)")
    transformed[key]=once(transformed[key],"out = {'entries': entries, 'truncated': bool((value or {}).get('truncated'))}",
        "received=len((value or {}).get('tree', []))\n        truncated=bool((value or {}).get('truncated')) or received>len(entries)\n        out = {'entries': entries, 'truncated': truncated, 'received_entries':received, 'returned_entries':len(entries), 'complete':not truncated}")
    key='extension/contentScript.js'
    transformed[key]=once(transformed[key],".filter(n=>elementVisible(n) && (user.root.contains(n) || user.root.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING));",
        ".filter(n=>elementVisible(n) && !user.root.contains(n) && !n.closest('[data-message-author-role],pre,code') && (user.root.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING));")
    transformed[key]=once(transformed[key],"    return null;\n  }\n  async function nbRepairFormat(job)",
        "    if(/something (?:seems to have )?(?:gone|went) wrong|error while generating/.test(text))return 'ChatGPT reported a platform generation error for this owned request. No completed answer was collected; no automatic resend of an ambiguous user turn.';\n    return null;\n  }\n  async function nbRepairFormat(job)")
    for name,text in transformed.items():
        if name.endswith('.py'):ast.parse(text)
    return originals,{k:v.encode('utf8') for k,v in transformed.items()}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--native-root',type=Path,required=True);p.add_argument('--stage-dir',type=Path,required=True)
    args=p.parse_args();native=args.native_root.resolve();stage=args.stage_dir.resolve()
    if not stage.is_relative_to(native/'output') or stage==native/'output':raise IntegrityError('Stage only in a named directory below Native output; never installed source')
    before,after=prepare();index={};patch=[]
    for name,raw in before.items():
        actual=(native/name.removeprefix('native/')) if name.startswith('native/') else native.parent/'NEMESIS_Brain_Extension_V6'/name.removeprefix('extension/')
        if actual.read_bytes()!=raw:raise IntegrityError('Installed preimage differs: '+str(actual))
        dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True)
        if dest.exists() and dest.read_bytes()!=after[name]:raise IntegrityError('Existing staging file differs; original preserved')
        dest.write_bytes(after[name])
        index[name]={'preimage_sha256':hashlib.sha256(raw).hexdigest(),'staged_sha256':hashlib.sha256(after[name]).hexdigest(),'activated':False}
        patch.extend(difflib.unified_diff(raw.decode().splitlines(True),after[name].decode().splitlines(True),fromfile='a/'+name,tofile='b/'+name))
    stage.mkdir(parents=True,exist_ok=True)
    (stage/'upgrade.patch').write_text(''.join(patch),encoding='utf8',newline='\n')
    (stage/'source-manifest.json').write_text(json.dumps({'protocol':'nemesis-staged-upgrade/1','activated':False,'sources':index,
        'activation_gate':'Preserve current live run. Validate actual installed preimages, complete affected-path tests, assign new explicit runtime/extension build identities and activate only after preserved work safely ends.'},indent=2)+'\n',encoding='utf8')
    print(json.dumps({'stage':str(stage),'activated':False,'sources':index},indent=2))

if __name__=='__main__':main()
