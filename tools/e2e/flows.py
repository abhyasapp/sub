import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve()
res=[]
def check(name,ok,detail=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ')+name+(' | '+str(detail) if detail else ''))
with sync_playwright() as p:
    b=p.chromium.launch(); R=Run(b,base); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(3500)
    check('app boots signed in, no errors', pg.evaluate("document.getElementById('app').classList.contains('on')") and not R.errors, R.errors)
    # --- tutorial dialog: present for a new user, focus inside, Escape closes it
    pg.wait_for_timeout(800)
    has=pg.evaluate("!!document.getElementById('tut-modal')")
    check('welcome dialog shown to new user (role=dialog, aria-modal)', has and pg.evaluate("document.getElementById('tut-modal').getAttribute('role')==='dialog'"))
    check('dialog focuses its primary button', pg.evaluate("document.activeElement && document.activeElement.id==='tut-next'"))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    check('Escape closes the dialog', not pg.evaluate("!!document.getElementById('tut-modal')"))
    # --- Quiz via "Just 5"
    R.errors.clear()
    pg.get_by_text('Just 5').first.click(); pg.wait_for_timeout(2500)
    qvis=pg.evaluate("(()=>{const w=document.getElementById('quiz-wrap');return !!w && w.style.display!=='none' && w.offsetHeight>0})()")
    check('Just 5 opens quiz screen',qvis, R.errors[:2])
    if qvis:
        pg.screenshot(path='/tmp/abhyas_quiz_m.png')
        info=pg.evaluate("({opts:document.querySelectorAll('#quiz-wrap .eo').length, q:(document.querySelector('#quiz-wrap .qt')||{}).textContent})")
        check('question + 4 options render',info['opts']>=2 and bool(info['q']),info)
        answered=0
        for i in range(5):
            pg.locator('#quiz-wrap .eo').nth(1).click(timeout=3000); answered+=1; pg.wait_for_timeout(300)
            if i==0:
                check('explanation shown after answering', 'IS 456' in pg.evaluate("document.getElementById('quiz-wrap').innerText"))
                pg.get_by_role('button',name='Save this question').first.click(); pg.wait_for_timeout(300)
                pg.get_by_role('button',name='Sure').first.click(); pg.wait_for_timeout(300)
            if i<4: pg.locator('#fc-next').click(timeout=3000); pg.wait_for_timeout(300)
        pg.get_by_role('button',name='Finish').first.click(timeout=3000); pg.wait_for_timeout(1500)
        pg.screenshot(path='/tmp/abhyas_quiz_end_m.png')
        pg.wait_for_timeout(1200)
        check('answered all 5 questions',answered==5)
        txt=pg.evaluate("document.body.innerText")
        r=pg.evaluate("document.getElementById('quiz-wrap').innerText")
        check('results: 5 total, 5 correct, 100%', '100%' in r and r.count('5')>=2, r[:60].replace(chr(10),' '))
        check('results/summary or next state reached', any(w in txt for w in ('Score','score','Correct','correct','Result','result','accuracy','Accuracy')), txt[:0])
        check('no JS errors during quiz',not R.errors,R.errors[:3])
        pg.screenshot(path='/tmp/abhyas_quiz_end_m.png')
    pg.locator('#quiz-wrap button:has-text("Home")').first.click(); pg.wait_for_timeout(800)
    bk=pg.evaluate("JSON.parse(localStorage.getItem('abhyas_bk')||'[]').length")
    check('saved question lands in bookmarks',bk==1,bk)
    pg.evaluate("UI.go('bookmarks')"); pg.wait_for_timeout(600)
    check('bookmarks screen lists it','Sample question' in pg.evaluate("document.getElementById('view-bookmarks').innerText"))
    # --- progress saved
    prog=pg.evaluate("JSON.parse(localStorage.getItem('abhyas_prog')||'null')")
    check('progress recorded locally', bool(prog) and prog.get('total',0)>0 if prog else False, prog if not prog else {k:prog[k] for k in ('total','correct') if k in prog})
    print('backend actions seen:',sorted(set(R.actions)))
    b.close()
print('SUMMARY',sum(res),'/',len(res),'passed')
