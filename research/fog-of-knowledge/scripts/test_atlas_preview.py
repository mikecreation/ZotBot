"""HTTP regression tests for refresh-to-published preview, without live workers."""
from contextlib import contextmanager
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import atlas_server


@contextmanager
def serving(handler):
    server=ThreadingHTTPServer(("127.0.0.1",0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown();server.server_close();thread.join()


class QuietPreview(atlas_server.Handler):
    def log_message(self,*args):pass


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.sha="a"*40
        self.failure=False
        self.override={}
        self.calls=[]
        fixture=self

        class Upstream(BaseHTTPRequestHandler):
            def log_message(self,*args):pass

            def do_GET(self):
                fixture.calls.append((self.command,self.path))
                if fixture.failure:
                    self.send_error(503);return
                value={"ok":True,"owner":"mikecreation","repo":"ZotBot",
                       "path":"research/fog-of-knowledge","sha":fixture.sha,
                       "url":f"/github-atlas/mikecreation/ZotBot/{fixture.sha}/research__fog-of-knowledge/"}
                value.update(fixture.override)
                raw=json.dumps(value).encode()
                self.send_response(200);self.send_header("Content-Length",str(len(raw)))
                self.end_headers();self.wfile.write(raw)

            def do_POST(self):
                fixture.calls.append((self.command,self.path));self.send_error(405)

        self.upstream=Upstream

    def get(self,url,headers=None):
        try:response=urlopen(Request(url,headers=headers or {}),timeout=5)
        except HTTPError as exc:response=exc
        with response:return response.status,dict(response.headers),response.read().decode()

    def test_refresh_resolves_new_head_and_pins_the_entire_frame(self):
        with serving(self.upstream) as native, patch.object(atlas_server,"NATIVE_ORIGIN",native):
            with serving(partial(QuietPreview,published_preview=True)) as preview:
                first=self.get(preview+"/#github/atlas/mikecreation/ZotBot")
                self.sha="b"*40
                second=self.get(preview+"/",{"If-Modified-Since":"Wed, 01 Jan 2031 00:00:00 GMT"})
                for response,sha in ((first,"a"*40),(second,"b"*40)):
                    status,headers,body=response
                    self.assertEqual(status,200)
                    self.assertEqual(headers["Cache-Control"],"no-store")
                    self.assertEqual(headers["X-Fog-Preview-Commit"],sha)
                    self.assertIn(f'src="{native}/github-atlas/mikecreation/ZotBot/{sha}/research__fog-of-knowledge/"',body)
                    self.assertIn("<iframe",body)
                self.assertNotIn("a"*40,second[2])
                self.assertEqual(self.calls,[("GET",atlas_server.PUBLISHED_ATLAS_API)]*2)

    def test_failure_is_visible_and_refresh_recovers_without_stale_fallback(self):
        with serving(self.upstream) as native, patch.object(atlas_server,"NATIVE_ORIGIN",native):
            with serving(partial(QuietPreview,published_preview=True)) as preview:
                self.assertEqual(self.get(preview)[0],200)
                self.failure=True
                status,headers,body=self.get(preview+"/index.html")
                self.assertEqual(status,503)
                self.assertEqual(headers["Cache-Control"],"no-store")
                self.assertNotIn("X-Fog-Preview-Commit",headers)
                self.assertNotIn("<iframe",body)
                self.assertIn("Unable to sync",body)
                self.failure=False
                self.assertEqual(self.get(preview)[0],200)
                self.assertTrue(all(method=="GET" and path==atlas_server.PUBLISHED_ATLAS_API for method,path in self.calls))

    def test_rejects_wrong_project_or_unpinned_external_url(self):
        with serving(self.upstream) as native, patch.object(atlas_server,"NATIVE_ORIGIN",native):
            with serving(partial(QuietPreview,published_preview=True)) as preview:
                for override in ({"url":"https://example.com/atlas"},{"sha":"main"},
                                 {"repo":"other"},{"path":"other"},{"ok":False}):
                    with self.subTest(override=override):
                        self.override=override
                        status,_,body=self.get(preview)
                        self.assertEqual(status,503)
                        self.assertNotIn("<iframe",body)

    def test_local_mode_and_asset_requests_do_not_resolve_or_mutate_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            index=Path(directory)/"index.html";index.write_text("local development page",encoding="utf-8")
            asset=Path(directory)/"asset.txt";asset.write_text("unchanged asset",encoding="utf-8")
            with serving(self.upstream) as native, patch.object(atlas_server,"NATIVE_ORIGIN",native):
                with serving(partial(QuietPreview,directory=directory)) as preview:
                    self.assertEqual(self.get(preview)[2],"local development page")
                with serving(partial(QuietPreview,directory=directory,published_preview=True)) as preview:
                    self.assertEqual(self.get(preview+"/asset.txt")[2],"unchanged asset")
                    self.assertEqual(self.get(preview)[0],200)
                self.assertEqual(self.calls,[("GET",atlas_server.PUBLISHED_ATLAS_API)])
            self.assertEqual(index.read_text(encoding="utf-8"),"local development page")
            self.assertEqual(asset.read_text(encoding="utf-8"),"unchanged asset")


if __name__=="__main__":unittest.main()
