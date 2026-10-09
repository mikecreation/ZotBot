"""Verify the incremental planning recovery and run the changed Native suite."""
import hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'nemesis/integration/planning-recovery'
BASE=ROOT/'nemesis/integration/paged-planning'
index=json.loads((SOURCE/'source-sha256.json').read_text(encoding='utf8'))
baseline=json.loads((BASE/'source-sha256.json').read_text(encoding='utf8'))
with tempfile.TemporaryDirectory(prefix='fog-planning-recovery-') as directory:
    target=Path(directory)
    for name,expected in baseline['sources'].items():
        if not name.startswith('native/'):continue
        raw=(BASE/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,name
        file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
    for name,expected in index['sources'].items():
        raw=(SOURCE/name).read_bytes();assert hashlib.sha256(raw).hexdigest()==expected,name
        file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
    command=['git','-c','core.autocrlf=false','-C',directory,'apply']
    patch=SOURCE/'upgrade.patch'
    subprocess.run([*command,'--reverse','--check',str(patch)],check=True)
    subprocess.run([*command,'--reverse',str(patch)],check=True)
    for name,expected in index['preimages'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    assert not (target/'native/tests/test_planning_recovery.py').exists()
    subprocess.run([*command,str(patch)],check=True)
    for name,expected in index['sources'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
    env={**os.environ,'FOG_PROJECT_ROOT':str(ROOT)}
    tests=['tests'] if '--full-native' in sys.argv else ['tests/test_planning_recovery.py','tests/test_scientific_planner.py','tests/test_paged_planning.py','tests/test_fog_coverage.py']
    subprocess.run([sys.executable,'-X','utf8','-m','pytest',*tests,'-q','--disable-warnings'],cwd=target/'native',env=env,check=True)
print('PASS exact incremental source, reversible patch and planning recovery. Offline only; actual delivery and scientific publication are separate checks.')
