"""Verify retained bounded evidence delivery and exercise the actual Native gate."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/bounded-evidence'
LAYERS=[ROOT/'nemesis/integration'/n for n in ('paged-planning','planning-recovery','cancellation-recovery','bounded-evidence')]
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf8'))
with tempfile.TemporaryDirectory(prefix='fog-bounded-evidence-') as directory:
    target=Path(directory)
    for layer in LAYERS:
        layer_index=json.loads((layer/'source-sha256.json').read_text(encoding='utf8'))
        for name,expected in layer_index['sources'].items():
            if not name.startswith('native/'):continue
            raw=(layer/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,name
            file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
    command=['git','-c','core.autocrlf=false','-C',directory,'apply'];patch=SOURCE/'upgrade.patch'
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    for name,expected in index['preimages'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    for name in set(index['sources'])-set(index['preimages']):assert not (target/name).exists(),name
    subprocess.run([*command,str(patch)],check=True)
    for name,expected in index['sources'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    if '--source-only' not in sys.argv:
        env={**os.environ,'FOG_PROJECT_ROOT':str(ROOT)}
        tests=['tests'] if '--full-native' in sys.argv else ['tests/test_evidence_reads.py','tests/test_crew_cancellation.py','tests/test_github_evidence.py']
        subprocess.run([sys.executable,'-X','utf8','-m','pytest',*tests,'-q','--disable-warnings'],cwd=target/'native',env=env,check=True)
print('PASS exact sources, reversible patch and bounded evidence delivery. Installed activation/live scientific progress remain separate.')
