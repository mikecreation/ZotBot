"""Crash-safe exact JSON checkpoint; bounded retry for Windows sharing denial."""
import errno,json,os,tempfile,time
from pathlib import Path

def write_json(path,value,*,replace=None,sleep=None,attempts=8):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    raw=(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf8')
    try:
        if path.exists() and path.read_bytes()==raw:return
    except PermissionError:pass  # A transient reader/writer denial is handled by bounded replace retries.
    fd,name=tempfile.mkstemp(prefix=path.name+'.pending-',suffix='.tmp',dir=path.parent)
    stage=Path(name);replace=replace or os.replace;sleep=sleep or time.sleep
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
        for attempt in range(attempts):
            try:replace(stage,path);return
            except OSError as exc:
                sharing=isinstance(exc,PermissionError) or getattr(exc,'winerror',None) in {5,32,33}
                if not sharing or attempt+1==attempts:raise
                sleep(min(.02*2**attempt,.25))
    finally:
        try:stage.unlink(missing_ok=True)
        except OSError:pass  # Never turn a successful replacement into failed admission.
