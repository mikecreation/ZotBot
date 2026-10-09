"""Verify reversible deployment and fresh-chat isolation using retained sources."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/fresh-chat'
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf8'))
with tempfile.TemporaryDirectory(prefix='fog-fresh-chat-') as directory:
    target=Path(directory)
    for name in ('completed-fence','paged-planning','planning-recovery','cancellation-recovery','bounded-evidence','fresh-chat'):
        layer=ROOT/'nemesis/integration'/name
        for path,expected in json.loads((layer/'source-sha256.json').read_text(encoding='utf8'))['sources'].items():
            raw=(layer/path).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,path
            p=target/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
    command=['git','-c','core.autocrlf=false','-C',directory,'apply'];patch=SOURCE/'upgrade.patch'
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    for path,expected in index['preimages'].items():assert hashlib.sha256((target/path).read_bytes()).hexdigest()==expected,path
    for path in set(index['sources'])-set(index['preimages']):assert not (target/path).exists(),path
    subprocess.run([*command,str(patch)],check=True)
    for path,expected in index['sources'].items():assert hashlib.sha256((target/path).read_bytes()).hexdigest()==expected,path
    env={**os.environ,'FOG_PROJECT_ROOT':str(ROOT),'NEMESIS_QA_NODE_MODULES':os.environ.get('NEMESIS_QA_NODE_MODULES',str(ROOT/'nemesis/integration/brain-transport/node_modules'))}
    if '--source-only' not in sys.argv:
        tests=['tests'] if '--full-native' in sys.argv else ['tests/test_fresh_chat.py','tests/test_crew_cancellation.py','tests/test_brain_bridge_v14.py']
        subprocess.run([sys.executable,'-X','utf8','-m','pytest',*tests,'-q','--disable-warnings'],cwd=target/'native',env=env,check=True)
        for test in sorted((target/'extension/tests').glob('*.cjs')):subprocess.run(['node',str(test)],env=env,check=True)
print('PASS retained fresh-chat bytes, reversible deployment, lease quarantine, independent delivery and completed-job rollover. Live activation requires separate verification.')
