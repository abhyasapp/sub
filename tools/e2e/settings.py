"""Data & backup > Display and accessibility, Storage. Run: python3 tools/e2e/settings.py
These two cards used to open to nothing (empty containers, no code behind them)."""
import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); res=[]
def check(n,ok,i=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n+(' | '+str(i) if i!='' else ''))
SKIP="localStorage.setItem('abhyas_tutorial_seen',JSON.stringify({demo:true}));"
def opened(pg):
    pg.goto(base+'/user.html'); pg.wait_for_timeout(1800); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)   # welcome tour
    pg.evaluate("UI.go('data')"); pg.wait_for_timeout(600)
    pg.evaluate("document.querySelectorAll('#view-data details.grp').forEach(d=>d.open=true)"); pg.wait_for_timeout(500)
def text(pg,sel): return pg.evaluate("(s)=>(document.querySelector(s)||{innerText:''}).innerText",sel)
with sync_playwright() as p:
    b=p.chromium.launch()
    R=Run(b,base,width=1280,height=900,init=SKIP); pg=R.pg; opened(pg)
    d=text(pg,'#display-card-body'); s=text(pg,'#storage-card-body')
    check('D1 Display card has content (was empty)', len(d.strip())>40, d[:60].replace('\n',' | '))
    for w in ['Theme','Text size','Language','Reduce motion','Focus mode']: check('D2 Display shows "%s"'%w, w in d)
    check('S1 Storage card has content (was stuck on "Checking…")', 'Checking' not in s and len(s.strip())>40, s[:60].replace('\n',' | '))
    for w in ['Progress, notes and settings','Downloaded question sets','Download backup','Remove downloaded sets']: check('S2 Storage shows "%s"'%w, w in s)
    check('S3 storage meter has a numeric value', pg.evaluate("(()=>{const m=document.querySelector('#storage-card-body [role=progressbar]');return !!m && m.getAttribute('aria-valuenow')!==null})()"))
    # theme
    pg.click("#display-card-body button:has-text('Dark')"); pg.wait_for_timeout(300)
    check('T1 Dark applies and is stored', pg.evaluate("document.documentElement.classList.contains('dark') && JSON.parse(localStorage.getItem('abhyas_theme'))==='dark'"))
    check('T2 pressed state follows the choice', pg.evaluate("[...document.querySelectorAll('#display-card-body [aria-label=Theme] button[aria-pressed=true]')].map(b=>b.textContent.trim()).join()")=='Dark')
    pg.click("#display-card-body button:has-text('Automatic')"); pg.wait_for_timeout(300)
    check('T3 Automatic clears the stored choice', pg.evaluate("localStorage.getItem('abhyas_theme')===null"))
    pg.click("#display-card-body button:has-text('Light')"); pg.wait_for_timeout(300)
    check('T4 Light applies', pg.evaluate("!document.documentElement.classList.contains('dark')"))
    # text size
    pg.click("#display-card-body button:has-text('Large'):not(:has-text('Extra'))"); pg.wait_for_timeout(300)
    check('F1 Large text size applied and stored', pg.evaluate("document.documentElement.style.fontSize==='112%' && JSON.parse(localStorage.getItem('abhyas_fs'))===112"), pg.evaluate("document.documentElement.style.fontSize"))
    pg.click("#display-card-body button:has-text('Normal')"); pg.wait_for_timeout(300)
    check('F2 Normal restores default', pg.evaluate("document.documentElement.style.fontSize===''"))
    # reduce motion + focus mode
    pg.click("#display-card-body [aria-label='Reduce motion']"); pg.wait_for_timeout(250)
    check('M1 Reduce motion on', pg.evaluate("document.documentElement.classList.contains('reduce-motion') && localStorage.getItem('abhyas_reduce_motion')==='1'"))
    check('M2 switch reports its state', pg.evaluate("document.querySelector(\"#display-card-body [aria-label='Reduce motion']\").getAttribute('aria-checked')")=='true')
    pg.click("#display-card-body [aria-label='Focus mode']"); pg.wait_for_timeout(300)
    check('M3 Focus mode on', pg.evaluate("document.documentElement.classList.contains('focus-mode')"))
    pg.click("#display-card-body [aria-label='Focus mode']"); pg.wait_for_timeout(300)
    # language
    pg.click("#display-card-body button[lang=ne]"); pg.wait_for_timeout(500)
    d2=text(pg,'#display-card-body')
    check('L1 switching to Nepali translates the card itself', 'थिम' in d2 and 'भाषा' in d2, d2[:50].replace('\n',' | '))
    pg.click("#display-card-body button[lang=en]"); pg.wait_for_timeout(400)
    check('L2 and back to English', 'Theme' in text(pg,'#display-card-body'))
    # persistence across reload
    pg.evaluate("SETTINGS.textSize('125'); if(localStorage.getItem('abhyas_reduce_motion')!=='1') SETTINGS.toggleMotion();"); pg.reload(); pg.wait_for_timeout(1500)
    check('P1 text size and motion choice survive a reload', pg.evaluate("document.documentElement.style.fontSize==='125%' && document.documentElement.classList.contains('reduce-motion')"))
    pg.evaluate("SETTINGS.textSize('100'); if(localStorage.getItem('abhyas_reduce_motion')==='1') SETTINGS.toggleMotion();")
    # storage warning and nothing-deleted promise
    pg.evaluate("UI.go('data'); document.querySelectorAll('#view-data details.grp').forEach(d=>d.open=true)"); pg.wait_for_timeout(400)
    pg.evaluate("localStorage.setItem('zz_filler','x'.repeat(Math.floor(STORE_GUARD.LIMIT*0.85/2))); SETTINGS.renderStorage()"); pg.wait_for_timeout(700)
    s2=text(pg,'#storage-card-body')
    check('S4 near-full shows the warning and the no-auto-delete promise', 'Nothing is ever deleted automatically' in s2, s2[:90].replace('\n',' | '))
    check('S5 meter switches to the warning style', pg.evaluate("!!document.querySelector('#storage-card-body .meter.warn')"))
    pg.evaluate("localStorage.removeItem('zz_filler'); SETTINGS.renderStorage()"); pg.wait_for_timeout(400)
    # remove downloads: disabled with nothing saved; confirm dialog when there is something
    pg.evaluate("QDB.clear()"); pg.evaluate("SETTINGS.renderStorage()"); pg.wait_for_timeout(500)
    check('R1 remove-downloads is disabled when nothing is saved', pg.evaluate("document.querySelector(\"#storage-card-body [data-on-click='SETTINGS.removeDownloads()']\").disabled"))
    pg.evaluate("QDB.set(ChapterData.allFileRefs()[0].key,[{q:'x'}])"); pg.evaluate("SETTINGS.renderStorage()"); pg.wait_for_timeout(500)
    check('R2 counts exactly the saved set (1 of N, never more than N)', '1 of 6 sets' in text(pg,'#storage-card-body'), text(pg,'#storage-card-body')[:140].replace('\n',' | '))
    pg.evaluate("QDB.set('studydoc:extra',[{q:'x'}])"); pg.evaluate("SETTINGS.renderStorage()"); pg.wait_for_timeout(400)
    check('R2b other cached files do not inflate the question-set count', '1 of 6 sets' in text(pg,'#storage-card-body'))
    pg.click("#storage-card-body [data-on-click='SETTINGS.removeDownloads()']"); pg.wait_for_timeout(500)
    check('R3 asks before removing anything', pg.evaluate("(document.body.innerText||'').includes('Remove all downloads?')"))
    keys=pg.evaluate("QDB.keys().then(k=>k.length)"); check('R4 nothing removed until confirmed', keys>=1, keys)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # accessibility + errors, light and dark
    for theme in ['light','dark']:
        pg.evaluate("SETTINGS.theme('%s')"%theme); pg.wait_for_timeout(300)
        v=[x for x in R.axe() if x['id'] in ('color-contrast','button-name','aria-valid-attr-value','label','aria-allowed-attr','aria-required-attr','nested-interactive','label-content-name-mismatch')]
        check('A1 axe clean on Data & backup (%s)'%theme, not v, [(x['id'],x['nodes'][0]['target']) for x in v][:3])
    check('E1 no JS errors', not R.errors, R.errors[:3])
    pg.evaluate("SETTINGS.theme('light')"); pg.screenshot(path='/tmp/settings_after_light.png',full_page=True)
    b.close()
    # phone width + Nepali, no horizontal overflow
    b=p.chromium.launch(); R=Run(b,base,width=360,height=800,init=SKIP+"localStorage.setItem('abhyas_lang',JSON.stringify('ne'));"); pg=R.pg; opened(pg)
    ov=pg.evaluate("document.documentElement.scrollWidth-innerWidth"); check('O1 no horizontal overflow at 360px in Nepali', ov<=0, ov)
    check('E2 no JS errors on phone', not R.errors, R.errors[:3])
    pg.screenshot(path='/tmp/settings_after_phone.png',full_page=True)
    b.close()
n=sum(res); print(f'SUMMARY {n} / {len(res)} passed'); sys.exit(0 if n==len(res) else 1)
