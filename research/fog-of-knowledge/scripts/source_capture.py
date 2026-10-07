"""Compiler-owned HTTP capture; source contents remain untrusted evidence."""
from __future__ import annotations
import hashlib,json,urllib.request
from datetime import datetime,timezone
from html.parser import HTMLParser
from pathlib import Path
from evidence_compiler import ROOT,EvidenceError,digest

class TextExtractor(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in {'script','style','noscript'}:self.skip+=1
    def handle_endtag(self,tag):
        if tag in {'script','style','noscript'} and self.skip:self.skip-=1
    def handle_data(self,value):
        if not self.skip and value.strip():self.parts.append(value.strip())

def extract_pdf(body):
    import io
    try:from pypdf import PdfReader,__version__
    except ImportError as exc:raise EvidenceError('PDF capture needs pip install -r requirements.txt') from exc
    if __version__!='6.19.0':raise EvidenceError('PDF extractor version differs; install the pinned capture dependency')
    reader=PdfReader(io.BytesIO(body))
    if reader.is_encrypted:raise EvidenceError('encrypted PDF cannot be captured without an authorized accessible source')
    if len(reader.pages)>500:raise EvidenceError('PDF exceeds 500-page capture limit; use a bounded source')
    parts=[];pages=[];offset=0
    for number,page in enumerate(reader.pages,1):
        contents=page.get_contents()
        if contents and len(contents.get_data())>16_000_000:raise EvidenceError('PDF page content stream exceeds capture limit')
        value=(page.extract_text(extraction_mode='layout') or '') if contents is not None else ''
        pages.append({'page':number,'start':offset,'end':offset+len(value),'has_text':bool(value.strip())})
        parts.append(value);offset+=len(value)+2
    text='\n\n'.join(parts)
    if not text.strip():raise EvidenceError('PDF has no extractable text layer; scanned evidence requires reviewed OCR and page images')
    return text,pages

def capture_source(url,source_id,title,source_kind='unknown'):
    if not url.startswith(('https://','http://')):raise EvidenceError('HTTP(S) source URL required')
    if source_kind not in {'primary','secondary','unknown'}:raise EvidenceError('unsupported source kind')
    request=urllib.request.Request(url,headers={'User-Agent':'FogEvidenceCapture/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response:
        body=response.read(8_000_001)
        if len(body)>8_000_000:raise EvidenceError('source exceeds 8 MB; retain a bounded authorized extract through a supported capture adapter')
        content_type=response.headers.get_content_type();charset=response.headers.get_content_charset() or 'utf-8';final_url=response.geturl()
    pages=None
    if content_type=='application/pdf' or body.startswith(b'%PDF-'):
        text,pages=extract_pdf(body);method='pypdf-layout/6.19.0';charset=None
    else:
        if content_type not in {'text/html','application/xhtml+xml','text/plain','text/markdown'}:raise EvidenceError('source format unavailable: '+content_type)
        try:text=body.decode(charset)
        except (UnicodeError,LookupError) as exc:raise EvidenceError('source text could not be decoded without changes') from exc
        method='http-text/1'
    if content_type in {'text/html','application/xhtml+xml'} and pages is None:
        parser=TextExtractor();parser.feed(text);text='\n'.join(parser.parts);method='http-html-data-lines/1'
    if not text.strip():raise EvidenceError('captured source has no extractable text')
    source={'id':source_id,'url':url,'final_url':final_url,'title':title,'source_kind':source_kind,
            'retrieved_at':datetime.now(timezone.utc).isoformat(),'text':text,'sha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'raw_sha256':hashlib.sha256(body).hexdigest(),'content_type':content_type,'charset':charset,'extraction_method':method}
    if pages is not None:source.update({'pages':pages,'extraction_quality':'text-layer-unverified; figures, tables and formulas require page review'})
    source['capture_id']=digest(source)
    folder=ROOT/'data/evidence';(folder/'captures').mkdir(parents=True,exist_ok=True);(folder/'raw').mkdir(parents=True,exist_ok=True)
    (folder/'raw'/(source['raw_sha256']+'.bin')).write_bytes(body)
    (folder/'captures'/(source['capture_id']+'.json')).write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return source

def validate_captures(sources,root=ROOT):
    for source in sources.values():
        capture_id=source.get('capture_id','')
        if len(capture_id)!=64 or any(c not in '0123456789abcdef' for c in capture_id):raise EvidenceError('source needs a compiler capture before review: '+source['id'])
        receipt=root/'data/evidence/captures'/(capture_id+'.json')
        if not receipt.exists() or json.loads(receipt.read_text(encoding='utf-8'))!=source:raise EvidenceError('candidate source differs from retained capture: '+source['id'])
        if digest({k:v for k,v in source.items() if k!='capture_id'})!=capture_id:raise EvidenceError('capture revision changed')
        raw=root/'data/evidence/raw'/(source['raw_sha256']+'.bin')
        if not raw.exists() or hashlib.sha256(raw.read_bytes()).hexdigest()!=source['raw_sha256']:raise EvidenceError('retained HTTP response missing or changed')
        # Reproduce the documented extraction from retained bytes, not candidate prose.
        if source['extraction_method']=='pypdf-layout/6.19.0':
            body,pages=extract_pdf(raw.read_bytes())
            if pages!=source.get('pages'):raise EvidenceError('PDF page offsets changed')
        else:body=raw.read_bytes().decode(source['charset'])
        if source['extraction_method']=='http-html-data-lines/1':
            parser=TextExtractor();parser.feed(body);body='\n'.join(parser.parts)
        elif source['extraction_method'] not in {'http-text/1','pypdf-layout/6.19.0'}:raise EvidenceError('unsupported capture extraction method')
        if body!=source['text']:raise EvidenceError('source text does not reproduce retained response')
