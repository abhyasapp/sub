import json, threading, http.server, socketserver, functools, os, re, sys
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
AXE=open(os.path.join(ROOT,'node_modules','axe-core','axe.min.js')).read()
STUB=open(os.path.join(os.path.dirname(__file__),'chapters_stub.js.txt')).read()

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
def serve():
    h=functools.partial(Q,directory=ROOT)
    s=socketserver.ThreadingTCPServer(('127.0.0.1',0),h); s.daemon_threads=True
    threading.Thread(target=s.serve_forever,daemon=True).start()
    return s, f'http://127.0.0.1:{s.server_address[1]}'

def questions(n=10, tag=''):
    return [{'q':f'{tag}Sample question {i+1}: minimum grade of concrete for reinforced work?','options':['M15','M20','M25','M30'],'correct':1,'explanation':'IS 456 specifies M20 minimum.'} for i in range(n)]

# Questions per file in the realistic stub syllabus (4 Level 7 + 2 GK sets of 30).
FCOUNT = {'L7-1': 30, 'L7-2': 30, 'L7-3': 30, 'L7-4': 30, 'GK-1': 30, 'GK-2': 30}

class Run:
    def __init__(self,b,base,width=390,height=844,theme='light',offline=False,session=True,sw='block',init='',fcount=None,overrides=None):
        self.base=base; self.actions=[]; self.errors=[]; self.failed=[]
        self.ctx=b.new_context(viewport={'width':width,'height':height},service_workers=sw)
        if session:
            self.ctx.add_init_script("""
            if(!localStorage.getItem('abhyas_session')){
              localStorage.setItem('abhyas_session',JSON.stringify({type:'user',username:'demo',name:'Demo Student',email:'d@x.np',token:'t',access:{level:'permanent',permanent:true,accessType:'permanent'},lastVerified:Date.now()}));
              localStorage.setItem('abhyas_theme',JSON.stringify('%s'));
              localStorage.setItem('abhyas_tutorial_seen',JSON.stringify({demo:true}));
            }""" % theme)
        # Syllabus sizes are normally learned lazily; seed them unless a test wants the 'not counted yet' state.
        seed = FCOUNT if fcount is None else fcount
        if seed:
            self.ctx.add_init_script("localStorage.setItem('abhyas_fcount', %s);" % json.dumps(json.dumps(seed)))
        if init: self.ctx.add_init_script(init)
        self.overrides = overrides or {}
        self.ctx.route('**/*', self.route)
        self.pg=self.ctx.new_page()
        self.pg.on('pageerror', lambda e: self.errors.append(('pageerror',str(e)[:200])))
        self.pg.on('console', lambda m: self.errors.append(('console.error',m.text[:200])) if m.type=='error' else None)
        self.pg.on('requestfailed', lambda r: self.failed.append((r.url[:90], r.failure)))
    def route(self,r):
        u=r.request.url
        if u.startswith(self.base):
            for suffix, body in self.overrides.items():
                if u.split('?')[0].endswith(suffix): return r.fulfill(status=200, content_type='text/javascript', body=body)
            if 'chapters-data.js' in u: return r.fulfill(body=STUB,content_type='text/javascript')
            return r.continue_()
        if 'chapters-data.js' in u: return r.fulfill(status=200,content_type='text/javascript',body=STUB)
        m=re.search(r'/content/(.+)\.json',u)
        if m: return r.fulfill(status=200,content_type='application/json',body=json.dumps(questions(FCOUNT.get(m.group(1),12))))
        if 'supabase.co' in u or 'script.google' in u:
            body={}
            try:
                d=json.loads(r.request.post_data or '{}'); body=d
            except Exception: 
                qs=u.split('?',1)[-1]; body=dict(p.split('=',1) for p in qs.split('&') if '=' in p)
            act=(body.get('action') or '?'); self.actions.append(act)
            return r.fulfill(status=200,content_type='application/json',body=json.dumps({'success':True,'sessions':[],'files':[],'result':{},'items':[],'user':{'username':'demo','status':'active'},'permanentAccess':True,'token':'t'}))
        if u.startswith('data:') or u.startswith('blob:'): return r.continue_()
        return r.fulfill(status=200,body='')
    def axe(self):
        self.pg.evaluate(AXE)
        return self.pg.evaluate("axe.run(document,{resultTypes:['violations']})")['violations']
    def close(self): self.ctx.close()
