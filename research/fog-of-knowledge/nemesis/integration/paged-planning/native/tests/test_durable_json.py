"""Real atomic file replacement and bounded sharing-denial fault injection."""
import json,os,threading
import pytest
from sim.durable_json import write_json

def test_transient_denial_retries_then_commits_exact_json(tmp_path):
    file=tmp_path/'queue.json';write_json(file,{'old':True});calls=[]
    def replace(a,b):
        calls.append(str(a))
        if len(calls)<3:raise PermissionError('Access is denied')
        os.replace(a,b)
    write_json(file,{'text':'λ exact'},replace=replace,sleep=lambda _:None)
    assert len(calls)==3 and json.loads(file.read_text(encoding='utf8'))=={'text':'λ exact'}
    assert not list(tmp_path.glob('*.tmp'))

def test_persistent_denial_preserves_last_valid_checkpoint(tmp_path):
    file=tmp_path/'queue.json';write_json(file,{'old':True});old=file.read_bytes();calls=[]
    def denied(*a):calls.append(1);raise PermissionError('Access is denied')
    with pytest.raises(PermissionError):write_json(file,{'new':True},replace=denied,sleep=lambda _:None)
    assert len(calls)==8 and file.read_bytes()==old and not list(tmp_path.glob('*.tmp'))

def test_unrelated_io_failure_does_not_retry_or_destroy_original(tmp_path):
    file=tmp_path/'queue.json';write_json(file,{'old':True});calls=[]
    def full(*a):calls.append(1);raise OSError(28,'disk full')
    with pytest.raises(OSError):write_json(file,{'new':True},replace=full,sleep=lambda _:None)
    assert calls==[1] and json.loads(file.read_text())=={'old':True}

def test_parallel_writers_use_distinct_same_volume_staging_files(tmp_path):
    file=tmp_path/'queue.json';barrier=threading.Barrier(2);names=[];errors=[]
    def replace(a,b):
        if a not in names:names.append(a);barrier.wait(timeout=5)
        os.replace(a,b)
    def run(n):
        try:write_json(file,{'writer':n},replace=replace)
        except Exception as e:errors.append(e)
    threads=[threading.Thread(target=run,args=(n,)) for n in range(2)]
    for t in threads:t.start()
    for t in threads:t.join(timeout=10)
    assert not errors and len(set(names))==2 and json.loads(file.read_text())['writer'] in {0,1}

@pytest.mark.skipif(os.name!='nt',reason='Windows sharing-denial integration')
def test_real_windows_reader_lock_is_retried_after_release(tmp_path):
    import ctypes
    from ctypes import wintypes
    file=tmp_path/'queue.json';write_json(file,{'old':True})
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
    kernel.CreateFileW.restype=wintypes.HANDLE;kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    handle=kernel.CreateFileW(str(file),0x80000000,1,None,3,0,None)
    assert handle not in {None,ctypes.c_void_p(-1).value};released=[]
    def release(_):
        if not released:assert kernel.CloseHandle(handle);released.append(True)
    try:write_json(file,{'new':True},sleep=release)
    finally:
        if not released:kernel.CloseHandle(handle)
    assert released and json.loads(file.read_text())=={'new':True}
