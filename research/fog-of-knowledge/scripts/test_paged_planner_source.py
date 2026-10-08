"""Exact deployed postimages, reversible patch and portable Native integration."""
import ast,hashlib,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/paged-planning'
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf8'))
with tempfile.TemporaryDirectory(prefix='fog-paged-upgrade-') as directory:
    target=Path(directory)
    for name,expected in index['sources'].items():
        raw=(SOURCE/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,name
        if name.endswith('.py'):ast.parse(raw.decode('utf8'))
        file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
    command=['git','-c','core.autocrlf=false','-C',directory,'apply']
    patch=SOURCE/'upgrade.patch'
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    for name,expected in index['preimages'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    subprocess.run([*command,str(patch)],check=True)
    for name,expected in index['sources'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    env={**os.environ,'FOG_PROJECT_ROOT':str(ROOT),'NEMESIS_QA_NODE_MODULES':os.environ.get('NEMESIS_QA_NODE_MODULES',str(ROOT/'nemesis/integration/brain-transport/node_modules'))}
    if '--source-only' not in sys.argv:
        subprocess.run([sys.executable,'-X','utf8','-m','pytest','tests','-q','--disable-warnings'],cwd=target/'native',env=env,check=True)
    for test in sorted((target/'extension/tests').glob('*.cjs')):
        subprocess.run(['node',str(test)],env=env,check=True)
print('PASS exact upgraded sources, reversible patch, Native integration and browser delivery. Live activation remains separately verified.')
