"""Storage guard: early warning, no silent deletion. Run: python3 tools/e2e/storage.py"""
import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i) if i!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch()
    wr=[{'uid':'u%d'%i,'q':'Q%d'%i,'fid':'L7-1','i':i,'at':1} for i in range(400)]
    R=Run(b,base,init="localStorage.setItem('abhyas_wr', JSON.stringify(%s));"%json.dumps(wr)); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(3000); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    n0=pg.evaluate("S.wr.length"); check('S1 400 wrong answers loaded', n0==400, n0)
    # fill storage to ~85%
    pg.evaluate("localStorage.setItem('zz_filler','x'.repeat(Math.floor(STORE_GUARD.LIMIT*0.85/2)))")
    pct=pg.evaluate("STORE_GUARD.percent()"); check('S2 usage meter reads >=80%', pct>=80, pct)
    pg.evaluate("localStorage.removeItem('abhyas_storage_warned'); STORE_GUARD._mem=0; STORE_GUARD.maybeCheck(true)"); pg.wait_for_timeout(400)
    txt=pg.evaluate("(document.getElementById('modal')||document.body).innerText")
    check('S3 early warning dialog appears', 'Storage is filling up' in txt)
    check('S4 it says nothing is deleted and offers a backup', 'Nothing has been deleted' in txt and 'Download backup' in txt)
    pg.evaluate("closeMod()"); pg.evaluate("STORE_GUARD._mem=Date.now(); STORE_GUARD.maybeCheck(true)"); pg.wait_for_timeout(300)
    check('S5 warning is rate-limited (no repeat nagging)', 'Storage is filling up' not in pg.evaluate("document.body.innerText"))
    # hard quota failure
    pg.evaluate("localStorage.removeItem('zz_filler'); const o=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='abhyas_wr'){ const e=new Error('q'); e.name='QuotaExceededError'; throw e;} return o.apply(this instanceof Storage ? this : localStorage, arguments); }; 0")
    ok=pg.evaluate("_lastStorageWarnAt=0; _save('abhyas_wr', S.wr)")
    pg.wait_for_timeout(300)
    check('S6 failed write reports false', ok==False)
    check('S7 NOTHING was trimmed: still 400 wrong answers in memory', pg.evaluate("S.wr.length")==400, pg.evaluate("S.wr.length"))
    check('S8 user is told progress was not saved, nothing deleted', 'out of storage' in pg.evaluate("document.body.innerText") and 'Nothing has been deleted' in pg.evaluate("document.body.innerText"))
    check('S9 no JS errors', not [e for e in R.errors if 'Quota' not in e[1]], R.errors[:2])
    b.close()
n=sum(res); print(f'SUMMARY {n} / {len(res)} passed'); sys.exit(0 if n==len(res) else 1)
