"""Run the cancellation regression against exact retained Native postimages."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/cancellation-recovery'
LAYERS=[ROOT/'nemesis/integration/paged-planning',ROOT/'nemesis/integration/planning-recovery',SOURCE]
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf8'))
with tempfile.TemporaryDirectory(prefix='fog-cancellation-recovery-') as directory:
    target=Path(directory)
    for layer in LAYERS:
        layer_index=json.loads((layer/'source-sha256.json').read_text(encoding='utf8'))
        for name,expected in layer_index['sources'].items():
            if not name.startswith('native/'):continue
            raw=(layer/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,name
            file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
    command=['git','-c','core.autocrlf=false','-C',directory,'apply']
    patch=SOURCE/'upgrade.patch'
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    for name,expected in index['preimages'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    assert not (target/'native/tests/test_crew_cancellation.py').exists()
    subprocess.run([*command,str(patch)],check=True)
    for name,expected in index['sources'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    if '--source-only' not in sys.argv:
        env={**os.environ,'FOG_PROJECT_ROOT':str(ROOT)}
        tests=['tests'] if '--full-native' in sys.argv else ['tests/test_crew_cancellation.py'] if '--regression-only' in sys.argv else ['tests/test_crew_cancellation.py','tests/test_github_evidence.py','tests/test_fog_pipeline_reliability.py','tests/test_brain_bridge_v14.py','tests/test_fog_coverage.py','tests/test_planning_recovery.py']
        subprocess.run([sys.executable,'-X','utf8','-m','pytest',*tests,'-q','--disable-warnings'],cwd=target/'native',env=env,check=True)
print('PASS exact source, reversible patch and cancellation preservation. Offline only; installed activation and live publication are separate checks.')
