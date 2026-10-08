"""Offline exact Native excerpts and observed UI replay; staged build, not activation."""
import ast,hashlib,json,re,subprocess,sys,tempfile,types,unittest
from pathlib import Path
from stage_engineering_upgrade import ROOT,once,prepare
from research_integrity import IntegrityError

class BoundaryUpgrade(unittest.TestCase):
    def test_preimages_are_exact_and_unexpected_versions_block(self):
        before,after=prepare()
        self.assertEqual(set(before),set(after));self.assertTrue(all(before[k]!=after[k] for k in before))
        with self.assertRaises(IntegrityError):once('different','old','new')
    def test_staged_machine_bytes_unredacted_diagnostics_bounded(self):
        before,after=prepare();tree=ast.parse(after['native/sim/github_sandbox.py']);execute=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='execute')
        token='ghp_'+'a'*36;payload=json.dumps({'quote':token+' '+('x'*500000)}).encode()
        redact=lambda s:re.sub(r'ghp_[a-z]{36}','[redacted]',str(s))
        ctx={'sys':sys,'subprocess':subprocess,'Path':Path,'time':__import__('time'),'TIMEOUT':120,'OUTPUT_CAP':400*1024,'_NO_WINDOW':0,'redact':redact,'sandbox_env':lambda _:{}}
        exec(compile(ast.Module(body=[execute],type_ignores=[]),'staged-execute','exec'),ctx)
        result=ctx['execute'](Path('.'),'fixture.py',[],runner=lambda *a,**k:types.SimpleNamespace(returncode=0,stdout=payload,stderr=(token+' '+('e'*500000)).encode()))
        self.assertEqual(result['stdout'].encode(),payload);self.assertNotIn(token,result['stderr']);self.assertLessEqual(len(result['stderr']),400*1024)
    def test_locally_clipped_tree_is_explicit_and_stale_cache_not_used(self):
        _,after=prepare();tree=ast.parse(after['native/sim/github_workspace.py']);method=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='full_tree')
        ctx={};exec(compile(ast.Module(body=[method],type_ignores=[]),'staged-tree','exec'),ctx)
        called=[];saved=[];rows=[{'path':str(i),'type':'blob','sha':'a'*40} for i in range(200001)]
        fixture=types.SimpleNamespace(s=types.SimpleNamespace(cache_get=lambda key,ttl:called.append(key),cache_set=lambda key,v:saved.append(v)),
            client=types.SimpleNamespace(get=lambda *a,**k:{'tree':rows,'truncated':False}))
        result=ctx['full_tree'](fixture,'owner','repo','a'*40)
        self.assertTrue(result['truncated']);self.assertFalse(result['complete']);self.assertEqual(result['received_entries'],200001);self.assertEqual(result['returned_entries'],200000)
        self.assertIn('tree-integrity-v2',called[0])
    def test_observed_platform_error_owned_turn_excludes_source_and_old_alert(self):
        _,after=prepare();text=after['extension/contentScript.js'].decode();start=text.index('  function nbRequestRejection(');end=text.index('  async function nbRepairFormat(',start)
        module_path=ROOT/'nemesis/integration/brain-transport/node_modules/jsdom'
        if not module_path.exists():
            import os
            module_path=Path(os.environ.get('NEMESIS_QA_NODE_MODULES',str(ROOT.parents[2]/'release-v17-transport/qa/node_modules')))/'jsdom'
        program="""const assert=require('node:assert/strict'),{JSDOM}=require(process.argv[2]),vm=require('node:vm');
const dom=new JSDOM('<main><aside role="alert">Something went wrong</aside><div id="owned">request <aside role="alert">Something seems to have gone wrong</aside></div><aside role="alert" id="current">Hmm...something seems to have gone wrong.<button>Retry</button></aside></main>');
const root=dom.window.document.getElementById('owned');let latest={root};
const ctx={document:dom.window.document,Node:dom.window.Node,elementVisible:()=>true,latestMessage:()=>latest,norm:s=>String(s).replace(/\\s+/g,' ').trim()};
vm.createContext(ctx);vm.runInContext(SOURCE+';this.check=nbRequestRejection',ctx);
assert.match(ctx.check({root}),/platform generation error/);
dom.window.document.getElementById('current').remove();assert.equal(ctx.check({root}),null);
const alert=dom.window.document.createElement('aside');alert.setAttribute('role','alert');root.after(alert);
for(const phrase of ['Something went wrong','Error while generating a response']){alert.textContent=phrase;assert.match(ctx.check({root}),/platform generation error/);}
latest={root:alert};assert.equal(ctx.check({root}),null);dom.window.close();
""".replace('SOURCE',json.dumps(text[start:end]))
        with tempfile.TemporaryDirectory(prefix='fog-platform-replay-') as folder:
            script=Path(folder)/'replay.cjs';script.write_text(program,encoding='utf8')
            result=subprocess.run(['node',str(script),str(module_path)],capture_output=True,text=True,timeout=30)
            self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__':unittest.main()
