"""Verify exact extension 6.2.11 bytes, incremental deployment and UI regressions."""
import hashlib,json,os,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/status-scan'
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf8'))
with tempfile.TemporaryDirectory(prefix='fog-status-scan-') as directory:
    target=Path(directory)
    for name,expected in index['sources'].items():
        raw=(SOURCE/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,name
        file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
    command=['git','-c','core.autocrlf=false','-C',directory,'apply']
    patch=SOURCE/'upgrade.patch'
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    for name,expected in index['preimages'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    subprocess.run([*command,str(patch)],check=True)
    for name,expected in index['sources'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    env={**os.environ,'NEMESIS_QA_NODE_MODULES':os.environ.get('NEMESIS_QA_NODE_MODULES',str(ROOT/'nemesis/integration/brain-transport/node_modules'))}
    for test in sorted((target/'extension/tests').glob('*.cjs')):
        subprocess.run(['node',str(test)],env=env,check=True)
print('PASS exact Brain 6.2.11 postimages, reversible incremental patch and file-first and tab recovery regressions; live activation and delivery require separate verification.')
