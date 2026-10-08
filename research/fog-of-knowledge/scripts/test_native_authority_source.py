"""Retained source integrity and reversible upgrade check; not live acceptance."""
import ast,hashlib,json,shutil,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root/'nemesis/integration/scientific-authority'
index=json.loads((source/'source-sha256.json').read_text(encoding='utf8'))
patch=root/'nemesis/integration/crew-scientific-authority.patch'
with tempfile.TemporaryDirectory(prefix='fog-authority-source-') as directory:
    target=Path(directory)
    for name,expected in index['sources'].items():
        data=(source/name).read_bytes();assert hashlib.sha256(data).hexdigest()==expected,name
        ast.parse(data.decode('utf8'));file=target/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data)
    subprocess.run(['git','-c','core.autocrlf=false','-C',str(target),'apply','--reverse','--check',str(patch)],check=True)
    subprocess.run(['git','-c','core.autocrlf=false','-C',str(target),'apply','--reverse',str(patch)],check=True)
    subprocess.run(['git','-c','core.autocrlf=false','-C',str(target),'apply',str(patch)],check=True)
    for name,expected in index['sources'].items():assert hashlib.sha256((target/name).read_bytes()).hexdigest()==expected,name
print('PASS exact retained native sources, Python parsing and reversible patch. Native integration tests and live mission remain separate.')
