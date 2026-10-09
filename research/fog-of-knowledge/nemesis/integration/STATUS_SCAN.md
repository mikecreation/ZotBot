# Brain 6.2.11 status notice scanning

Long conversations contain large immutable research prompts and completed replies.
The old stream-error detector called `getBoundingClientRect`, `getComputedStyle`
and `innerText` on each div, paragraph and span before determining whether it
contained the short error notice. The quota detector also measured every element
before excluding source material. A status poll could therefore perform thousands
of layout-sensitive reads and concatenate large ancestor text unnecessarily.

The new detector rejects quoted sources and drafts first, reads at most a short
notice through a text-node walker, and measures rendered text and visibility only
when the bounded text matches the platform notice. Request ownership uses its
exact marker without whitespace-normalizing the entire scientific prompt. No
source, prompt, response, review or graph data is clipped or discarded.

The structural regression constructs 4,500 history elements and a 350 KB research
prompt. Rendered reads of unrelated history/source nodes throw; both real error
and quota notices must still be detected with at most six layout/read operations.
Hidden notices and quoted error/Retry pairs must not authorize recovery. The
complete evidence hash remains identical. Existing delivery, editor, ownership,
quota and recovery regressions remain required.

`status-scan/source-sha256.json` retains exact 6.2.11 postimages. Its upgrade patch
is reversible against the unchanged retained 6.2.10 upload-recovery bundle. Run
`scripts/test_status_scan_source.py` with the locked QA Node dependencies.
Offline results do not establish a particular memory reduction or eliminate all
ChatGPT/network failures; loaded identity and live collection remain separate.
