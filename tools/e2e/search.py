import os,sys,json; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,d=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(d)[:110] if d else ''))
HOOK="""window.__msgs=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='DUAL_SEARCH_REQUEST')window.__msgs.push(e.data)});"""
with sync_playwright() as p:
    b=p.chromium.launch(); R=Run(b,base); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(3500); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate(HOOK)
    pg.get_by_text('Just 5').first.click()
    pg.wait_for_selector('#quiz-wrap .ext-search-btn', timeout=8000)
    pg.wait_for_timeout(250)
    btn=pg.locator('#quiz-wrap .ext-search-btn').first
    check('search button rendered in quiz', btn.count()==1)
    check('fallback href is a Google search with the tutor prompt', pg.evaluate("document.querySelector('.ext-search-btn').href").startswith('https://www.google.com/search?q=You%20are%20a%20tutor'))
    # A) extension NOT installed -> normal link opens in a new tab
    with pg.context.expect_page() as newp:
        btn.click()
    check('no extension: opens Google search in a new tab', 'google.com/search' in newp.value.url, newp.value.url[:50]); newp.value.close()
    check('no extension: nothing posted to extension', pg.evaluate("window.__msgs.length")==0)
    # B) extension installed -> intercepted, message posted, no tab
    pg.evaluate("document.dispatchEvent(new Event('DualSearchExtensionReady'))")
    pages=len(pg.context.pages); btn.click(); pg.wait_for_timeout(500)
    m=pg.evaluate("window.__msgs")
    check('extension: click posts DUAL_SEARCH_REQUEST', len(m)==1, m)
    check('extension: payload has question and lettered options', m and 'Sample question' in m[0]['query'] and 'Options: A) M15 B) M20' in m[0]['query'])
    check('extension: no extra tab opened', len(pg.context.pages)==pages)
    # C) modified clicks keep normal browser behaviour. Headless browsers do
    # not reliably emit a popup for Ctrl-click, so assert the contract instead:
    # the app must not preventDefault and must not post to the extension.
    ctrl = pg.evaluate("""() => {
      const a = document.querySelector('.ext-search-btn');
      let prevented = null;
      const watch = e => { if (e.target.closest && e.target.closest('.ext-search-btn')) prevented = e.defaultPrevented; };
      document.addEventListener('click', watch, { once: true });
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      return { prevented, msgs: window.__msgs.length, target: a.target, href: a.href };
    }""")
    check('extension: ctrl-click keeps the link default and posts nothing', ctrl['prevented'] is False and ctrl['target'] == '_blank' and ctrl['msgs'] == 1, ctrl)
    # D) special characters survive the attribute round-trip untouched
    tricky='Is 5 < 7 & "quoted" \'single\' <b>bold</b> &amp; ok?'
    out=pg.evaluate("(t)=>{const h=qSearchHtml({q:t,options:['a&b','<x>']});const d=document.createElement('div');d.innerHTML=h;const a=d.firstChild;return {q:a.getAttribute('data-query'),inj:d.querySelectorAll('b,x').length}}",tricky)
    check('special characters round-trip exactly, no markup injected', out['q']==tricky+'  Options: A) a&b B) <x>' and out['inj']==0, out)
    check('no JS errors', not [e for e in R.errors if e[0]=='pageerror'], R.errors[:2])
    b.close()
print('SUMMARY',sum(res),'/',len(res),'passed')
