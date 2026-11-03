"""Sprint screen is fully usable in Nepali and unchanged in English. Run: python3 tools/e2e/sprint-i18n.py"""
import os,sys,re; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i) if i!='' else ''))
with sync_playwright() as p:
    b=p.chromium.launch()
    for lang in ['en','ne']:
        R=Run(b,base,init="localStorage.setItem('abhyas_lang','%s');"%lang); pg=R.pg
        pg.goto(base+'/user.html'); pg.wait_for_timeout(3000); pg.keyboard.press('Escape')
        pg.evaluate("UI.go('sprint')"); pg.wait_for_timeout(1200)
        txt=pg.evaluate("document.getElementById('view-sprint').innerText")
        deva=len(re.findall(r'[\u0900-\u097F]',txt))
        if lang=='en':
            check('E1 English screen has no Devanagari', deva==0, deva)
            check('E2 English wording unchanged', 'resets at midnight' in txt.lower() and 'syllabus' in txt.lower())
        else:
            check('N1 Nepali screen shows Nepali text', deva>40, deva)
            check('N2 "Resets at midnight" translated', 'मध्यरातमा रिसेट हुन्छ' in txt)
            pg.evaluate("toast(I18N.t('Pick a date first.'))"); pg.wait_for_timeout(300)
            check('N3 toast text translated', 'पहिले मिति छान्नुहोस्' in pg.evaluate("document.body.innerText"))
        check(f'{lang.upper()}9 no JS errors', not R.errors, R.errors[:2]); R.close()
    b.close()
n=sum(res); print(f'SUMMARY {n} / {len(res)} passed'); sys.exit(0 if n==len(res) else 1)
