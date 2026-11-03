"""Timed exam: answers can be unselected on any question. Run: python3 tools/e2e/exam.py"""
import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i) if i!='' else ''))
QS="Array.from({length:6},(_,i)=>({uid:'L7-1:x'+i,q:'Question '+(i+1)+'?',options:['A1','B1','C1','D1'],correct:i%4,exp:'e',fid:'L7-1'}))"
with sync_playwright() as p:
    b=p.chromium.launch(); R=Run(b,base); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(2500); pg.keyboard.press('Escape')
    pg.evaluate(f"QUIZ.startWith({QS},'exam','Unselect test',{{}})"); pg.wait_for_timeout(1200)
    check('X1 exam started in exam mode', pg.evaluate("S.quiz&&S.quiz.mode")=='exam')
    for qi in [0,3,5]:
        pg.evaluate(f"QUIZ.exAnswer({qi},1)")
    check('X2 three answers selected', pg.evaluate("S.quiz.ans.filter(a=>a!==null&&a!==undefined).length")==3)
    # click the same option again -> unselect (any question: first, middle, last)
    for qi in [0,3,5]:
        pg.evaluate(f"document.querySelector('#eqc-{qi} .eo.sel')&&document.querySelector('#eqc-{qi} .eo.sel').click()")
    pg.wait_for_timeout(200)
    check('X3 clicking the chosen option again unselects it (first, middle, last question)', pg.evaluate("S.quiz.ans.filter(a=>a!==null&&a!==undefined).length")==0, pg.evaluate("JSON.stringify(S.quiz.ans)"))
    pg.evaluate("QUIZ.exAnswer(2,3)"); pg.wait_for_timeout(100)
    vis=pg.evaluate("!document.getElementById('ex-clear-2').hidden")
    pg.evaluate("document.getElementById('ex-clear-2').click()"); pg.wait_for_timeout(150)
    check('X4 Clear button appears on an answered question and clears it', vis and pg.evaluate("S.quiz.ans[2]===null"))
    check('X5 progress counter follows (0/6 answered)', pg.evaluate("document.getElementById('ex-ctr').textContent")=='0/6', pg.evaluate("document.getElementById('ex-ctr').textContent"))
    pg.evaluate("QUIZ.exAnswer(1,(S.quiz.qs[1].correct+1)%4)"); pg.evaluate("QUIZ.exAnswer(1,(S.quiz.qs[1].correct+2)%4)"); pg.wait_for_timeout(100)
    check('X6 changing an answer to a different option still works', pg.evaluate("S.quiz.ans[1]")==pg.evaluate("(S.quiz.qs[1].correct+2)%4"), pg.evaluate("S.quiz.ans[1]"))
    # unselected + answered counts at submit: Q1 answered (wrong, correct=1), others skipped
    pg.evaluate("QUIZ.exAnswer(0,0)"); pg.evaluate("QUIZ.exAnswer(0,0)")   # select then unselect Q1 again
    pg.evaluate("QUIZ.exAnswer(4, S.quiz.qs[4].correct)")                  # Q5: the real correct option (options are shuffled)
    pg.wait_for_timeout(150)
    pg.evaluate("void QUIZ.submitExam()"); pg.wait_for_timeout(500)
    check('X7a submitting with blanks asks first', pg.evaluate("!!document.getElementById('ask-yes')"))
    pg.evaluate("document.getElementById('ask-yes').click()"); pg.wait_for_timeout(1500)
    last=pg.evaluate("S.prog.sessions[0]&&{t:S.prog.sessions[0].total,c:S.prog.sessions[0].correct,w:S.prog.sessions[0].wrong,s:S.prog.sessions[0].skipped}")
    check('X7b submitted exam scores only what is still selected (unselected = skipped)', last and last['c']==1 and last['w']==1 and last['s']==4, last)
    check('X8 no JS errors', not R.errors, R.errors[:2]); R.close(); b.close()
k=sum(res); print(f'SUMMARY {k} / {len(res)} passed'); sys.exit(0 if k==len(res) else 1)
