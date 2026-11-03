"""Practice history is kept, not trimmed. Run: python3 tools/e2e/history.py"""
import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i) if i!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); R=Run(b,base); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(2500); pg.keyboard.press('Escape')
    pg.evaluate("""(()=>{S.prog={total:0,correct:0,sessions:[]};
      for(let i=0;i<420;i++){ PROG.recordSession({chapter:'Ch '+(i%9),mode:'practice',total:20,correct:14,wrong:6,skipped:0,pct:70,at:1700000000000+i*60000,durationSec:300,sessionKind:'new',fid:'L7-1',
        qres:Array.from({length:20},(_,j)=>({uid:'L7-1:'+i+':'+j,ok:j%3!==0}))}); } })()""")
    n=pg.evaluate("S.prog.sessions.length"); check('H1 all 420 sessions kept (was capped at 50)', n==420, n)
    check('H2 newest 300 keep per-question detail', pg.evaluate("S.prog.sessions.slice(0,300).every(s=>Array.isArray(s.qres)&&s.qres.length===20)"))
    check('H3 older 120 keep their summary, minus only the detail list', pg.evaluate("S.prog.sessions.slice(300).every(s=>!s.qres&&s.total===20&&s.correct===14&&s.chapter&&s.at)"))
    check('H4 newest session is first', pg.evaluate("S.prog.sessions[0].at")==1700000000000+419*60000)
    local=pg.evaluate("JSON.parse(JSON.stringify(S.prog))")
    m=pg.evaluate("(()=>{const remote={prog:{total:0,correct:0,sessions:S.prog.sessions.slice(0,100)}};const r=mergeSyncData({prog:S.prog},remote);return r.prog.sessions.length})()")
    check('H5 cloud merge does not drop older local history', m==420, m)
    check('H6 no JS errors', not R.errors, R.errors[:2]); R.close(); b.close()
k=sum(res); print(f'SUMMARY {k} / {len(res)} passed'); sys.exit(0 if k==len(res) else 1)
