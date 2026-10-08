"""Regression-test retained browser transport; offline fixtures are not live proof."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/brain-transport'
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf-8'))
for name,digest in index['sources'].items():
    assert hashlib.sha256((SOURCE/name).read_bytes()).hexdigest()==digest,name
with tempfile.TemporaryDirectory(prefix='fog-transport-replay-') as directory:
    target=Path(directory)/'NEMESIS_Brain_Extension_V6'
    shutil.copytree(SOURCE,target,ignore=shutil.ignore_patterns('node_modules'))
    patch=ROOT/'nemesis/integration/brain-message-deadlines.patch'
    command=['git','-c','core.autocrlf=false','-C',directory,'apply']
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    subprocess.run([*command,'--check',str(patch)],check=True)
    subprocess.run([*command,str(patch)],check=True)
    for name,digest in index['sources'].items():
        assert hashlib.sha256((target/name).read_bytes()).hexdigest()==digest,name
environment={**os.environ,'NEMESIS_QA_NODE_MODULES':os.environ.get('NEMESIS_QA_NODE_MODULES',str(SOURCE/'node_modules'))}
for test in ['brain_liveness_v624.test.cjs','fog_packet_file_v624.test.cjs','brain_rejection_v624.test.cjs','site_files.test.cjs','transport_editor_v624.test.cjs']:
    subprocess.run(['node',str(SOURCE/'tests'/test)],env=environment,check=True)
print('PASS exact retained source hashes, portable patch round-trip and browser delivery regressions. Live acceptance is separate.')
