"""Wrong-answer bank: remove (with undo) and report incomplete / incorrect questions. Run: python3 tools/e2e/qbank.py"""
import os,sys,json; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i) if i!='' else ''))
wr=[{'uid':'L7-1:q%d'%i,'q':'Wrong question %d?'%i,'options':['a','b','c','d'],'correct':1,'fid':'L7-1','explanation':'because','_streak':0,'_nextDue':1,'_addedAt':1} for i in range(3)]
with sync_playwright() as p:
    b=p.chromium.launch(); R=Run(b,base,init="localStorage.setItem('abhyas_wr', JSON.stringify(%s));"%json.dumps(wr)); pg=R.pg
    sent=[]
    def spy(route):
        u=route.request.url
        if ('supabase.co' in u or 'script.google' in u) and route.request.method=='POST':
            try:
                b_=json.loads(route.request.post_data or '{}')
                if b_.get('action')=='reportQuestion': sent.append(b_)
            except Exception: pass
        route.fallback()
    R.ctx.route('**/*',spy)
    pg.goto(base+'/user.html'); pg.wait_for_timeout(3000); pg.keyboard.press('Escape')
    pg.evaluate("UI.go('wrong')"); pg.wait_for_timeout(600); pg.evaluate("WRONGBY._plain('wr')"); pg.wait_for_timeout(600)
    check('Q1 three questions in the wrong bank', pg.evaluate("S.wr.length")==3)
    pg.evaluate("document.querySelector('#wr-list [aria-label=\"Remove from review\"]').click()"); pg.wait_for_timeout(400)
    check('Q2 a student can remove a question from the wrong bank', pg.evaluate("S.wr.length")==2, pg.evaluate("S.wr.length"))
    body=pg.evaluate("document.body.innerText").lower()
    undo=pg.evaluate("[...document.querySelectorAll('button')].some(b=>/undo/i.test(b.textContent)&&b.offsetParent!==null)")
    check('Q3 removal offers Undo', undo)
    pg.evaluate("[...document.querySelectorAll('button')].find(b=>/undo/i.test(b.textContent)&&b.offsetParent!==null).click()"); pg.wait_for_timeout(400)
    check('Q4 Undo puts it back', pg.evaluate("S.wr.length")==3, pg.evaluate("S.wr.length"))
    reasons=pg.evaluate("REPORT_REASONS")
    check('Q5 report reasons include "incomplete" and "wrong_answer"', 'incomplete' in reasons and 'wrong_answer' in reasons, reasons)
    # online report: incomplete question
    pg.evaluate("USER_REPORT.reportList('wr','L7-1:q0')"); pg.wait_for_timeout(500)
    pg.select_option('#qr-reason','incomplete'); pg.fill('#qr-note','Option D is cut off'); pg.click('#qr-send-btn'); pg.wait_for_timeout(1500)
    check('Q6 online report reaches the server with reason + note', len(sent)==1 and sent[0].get('reason')=='incomplete' and sent[0].get('uid')=='L7-1:q0' and 'cut off' in sent[0].get('note',''), sent[:1])
    # offline: queued, nothing lost
    pg.evaluate("S.forcedOffline=true; S.online=false")
    pg.evaluate("USER_REPORT.reportList('wr','L7-1:q1')"); pg.wait_for_timeout(500)
    pg.select_option('#qr-reason','wrong_answer'); pg.click('#qr-send-btn'); pg.wait_for_timeout(800)
    q=pg.evaluate("JSON.parse(localStorage.getItem('abhyas_report_queue')||'[]')")
    check('Q7 offline report of an incorrect answer is queued, not lost', len(q)==1 and q[0]['reason']=='wrong_answer' and q[0]['uid']=='L7-1:q1', q[:1])
    check('Q8 no JS errors', not R.errors, R.errors[:2]); R.close(); b.close()
k=sum(res); print(f'SUMMARY {k} / {len(res)} passed'); sys.exit(0 if k==len(res) else 1)
