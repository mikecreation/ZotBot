"""Real pinned reader process and integrity faults; no scientific data writes."""
import copy,json,subprocess,sys,tempfile,unittest
from pathlib import Path
from retrieval_service import Reader,PROTOCOL
from research_integrity import IntegrityError,canonical
ROOT=Path(__file__).resolve().parents[1]

class Service(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='fog-reader-')
        cls.reader=Reader(ROOT,Path(cls.temp.name)/'index')
    @classmethod
    def tearDownClass(cls):cls.reader.close();cls.temp.cleanup()
    def request(self,**kw):return self.reader.execute(dict(snapshot=self.reader.catalog['snapshot'],**kw))
    def test_catalog_is_explicitly_not_the_graph(self):
        e=self.request(operation='catalog',query={})
        self.assertFalse(e['manifest']['complete']);self.assertFalse(e['data']['complete_graph_in_prompt'])
        self.assertNotIn('nodes',e['data']);self.assertGreater(e['data']['counts']['nodes'],0)
    def test_cursor_walk_has_exact_count_and_record_hashes(self):
        cursor=None;keys=[];matched=None
        while True:
            e=self.request(operation='query',query={'kind':'nodes','limit':100,'cursor':cursor})
            self.assertLess(len(canonical(e)),98000);d=e['data'];keys.extend(r['key'] for r in d['records'])
            matched=d['matched'];cursor=d['continuation']
            if cursor is None:break
        self.assertEqual(len(keys),matched);self.assertEqual(len(set(keys)),matched)
    def test_changed_snapshot_or_unknown_argument_blocks(self):
        with self.assertRaises(IntegrityError):self.reader.execute({'snapshot':'changed','operation':'catalog'})
        with self.assertRaises(IntegrityError):self.request(operation='query',query={'kind':'nodes','sql':'DROP TABLE records'})
    def test_real_isolated_process_reuses_snapshot_and_rejects_duplicate_json(self):
        with tempfile.TemporaryDirectory(prefix='fog-service-process-') as cache:
            proc=subprocess.Popen([sys.executable,'-I','-B','-X','utf8',str(ROOT/'scripts/nemesis_retrieve.py'),'serve','--cache',cache],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                hello=json.loads(proc.stdout.readline());self.assertEqual(hello['protocol'],PROTOCOL)
                sid=hello['ready']['snapshot']
                for limit in (1,2):
                    proc.stdin.write(canonical({'snapshot':sid,'operation':'query','query':{'kind':'nodes','limit':limit}})+b'\n');proc.stdin.flush()
                    line=proc.stdout.readline();self.assertLess(len(line),100000)
                    reply=json.loads(line)['response'];self.assertEqual(reply['data']['snapshot'],sid);self.assertEqual(reply['data']['returned'],limit)
                proc.stdin.write(b'{"operation":"query","operation":"catalog"}\n');proc.stdin.flush()
                error=json.loads(proc.stdout.readline());self.assertEqual(error['status'],'blocked');self.assertFalse(error['complete'])
                proc.stdin.close();self.assertEqual(proc.wait(timeout=15),0)
            finally:
                if proc.poll() is None:proc.kill();proc.wait(timeout=10)
                proc.stdout.close();proc.stderr.close()

if __name__=='__main__':unittest.main()
