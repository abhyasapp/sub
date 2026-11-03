"""'Syllabus complete' needs every question seen AND >= 85% accuracy. Run: python3 tools/e2e/sprint-accuracy.py"""
import os,sys,json,datetime,time; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i)[:150] if i!='' else ''))
TODAY=datetime.date.today(); ago=lambda n:(TODAY-datetime.timedelta(days=n)).isoformat()
fids=list(FCOUNT.keys())
def init(correct_by_fid):
    cov={f:{'p':'1'*n,'a':n,'c':n,'t':1} for f,n in FCOUNT.items()}
    now=int(time.time()*1000)
    sessions=[{'chapter':'Ch '+f,'fid':f,'mode':'practice','total':t,'correct':c,'wrong':t-c,'skipped':0,'pct':round(c/t*100),'at':now-i*3600000,'durationSec':300,'sessionKind':'new'} for i,(f,(t,c)) in enumerate(correct_by_fid.items())]
    prog={'total':sum(t for t,_ in correct_by_fid.values()),'correct':sum(c for _,c in correct_by_fid.values()),'sessions':sessions}
    return ("localStorage.setItem('abhyas_sprint_start','%s');localStorage.setItem('abhyas_cov',%s);localStorage.setItem('abhyas_prog',%s);"%(ago(55),json.dumps(json.dumps(cov)),json.dumps(json.dumps(prog))))
def open_page(b,correct_by_fid):
    R=Run(b,base,init=init(correct_by_fid)); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(3200); pg.keyboard.press('Escape'); pg.evaluate("UI.go('sprint')"); pg.wait_for_timeout(800)
    return R,pg
with sync_playwright() as p:
    b=p.chromium.launch()
    R,pg=open_page(b,{})
    st=pg.evaluate("(()=>{const p=SPRINT_PAGE.plan();return {s:p.status,m:p.mastered,o:p.mastery.overall}})()")
    check('A1 everything seen, no practice data -> covered but not mastered', st['s']=='complete' and st['m']==False and st['o'] is None, st)
    check('A2 pace line asks for 85% accuracy', 'raise accuracy to 85%' in pg.inner_text('#sprint-pace-verdict'))
    check('A3 coverage caption says there is no accuracy data yet', 'no accuracy data yet' in pg.inner_text('#sprint-cov-cap').lower(), pg.inner_text('#sprint-cov-cap'))
    check('A4 goal row is shown on the coverage card', 'accuracy goal 85%' in pg.inner_text('#sprint-cov-levels').lower())
    check('A5 no JS errors', not R.errors, R.errors[:2]); R.close()
    low={fids[0]:(60,36),fids[1]:(60,48)}            # 84/120 = 70% overall
    R,pg=open_page(b,low)
    st=pg.evaluate("(()=>{const p=SPRINT_PAGE.plan();return {s:p.status,m:p.mastered,o:p.mastery.overall,below:p.mastery.below.length}})()")
    check('B1 70% accuracy: not mastered, two chapters below goal', st['m']==False and st['o']==70 and st['below']==2, st)
    cap=pg.inner_text('#sprint-cov-cap'); check('B2 caption states the accuracy and the goal', '70%' in cap and '85%' in cap, cap)
    check('B3 header status says raise accuracy', 'raise accuracy' in pg.inner_text('#view-sprint').lower())
    check('B4 weakest chapters are named in the caption', 'Strength of Materials' in cap, cap[-80:])
    R.close()
    hi={fids[0]:(60,54),fids[1]:(60,52)}              # 106/120 = 88%
    R,pg=open_page(b,hi)
    st=pg.evaluate("(()=>{const p=SPRINT_PAGE.plan();return {s:p.status,m:p.mastered,o:p.mastery.overall}})()")
    check('C1 88% accuracy with everything seen -> mastered', st['m']==True and st['o']==88, st)
    check("C2 pace line says 'Syllabus complete'", 'Syllabus complete' in pg.inner_text('#sprint-pace-verdict'), pg.inner_text('#sprint-pace-verdict'))
    check('C3 no JS errors', not R.errors, R.errors[:2]); R.close()
    b.close()
k=sum(res); print(f'SUMMARY {k} / {len(res)} passed'); sys.exit(0 if k==len(res) else 1)
