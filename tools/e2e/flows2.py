import os,sys,json,re; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve()
res=[]
def check(name,ok,detail=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+name+(' | '+str(detail)[:120] if detail else ''))
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- landing page, signed out
    R=Run(b,base,session=False); pg=R.pg
    pg.goto(base+'/index.html'); pg.wait_for_timeout(2000)
    check('landing loads with no errors', not R.errors, R.errors[:2])
    check('landing shows sign-in form', pg.locator('input[type=password]').first.is_visible())
    # empty submit -> validation, no network login
    n0=len(R.actions)
    pg.get_by_role('button',name='Sign in').last.click(); pg.wait_for_timeout(700)
    txt=pg.evaluate("document.body.innerText")
    check('empty sign-in is rejected client-side (no backend call)', len(R.actions)==n0, R.actions[n0:])
    # switch to Create account tab
    pg.get_by_role('tab',name='Create account').click() if pg.get_by_role('tab',name='Create account').count() else pg.get_by_text('Create account').first.click()
    pg.wait_for_timeout(500)
    inputs=pg.evaluate("[...document.querySelectorAll('input')].filter(i=>i.offsetParent).map(i=>i.type+':'+(i.name||i.id||i.placeholder).slice(0,18))")
    check('register form renders fields', len(inputs)>=4, inputs)
    # try-a-question widget
    pg.get_by_text('Sign in',exact=True).first.click(); pg.wait_for_timeout(300)
    opts=pg.locator('text=M20').first
    try:
        opts.scroll_into_view_if_needed(); opts.click(timeout=2000); pg.wait_for_timeout(500)
        t=pg.evaluate("document.body.innerText")
        check('try-a-question gives feedback on tap', any(w in t for w in ('Correct','correct','IS 456','Right','Not quite','Incorrect')), '')
    except Exception as e: check('try-a-question interactive', False, str(e)[:80])
    check('no console/page errors in landing flows', not R.errors, R.errors[:3]); R.close()

    # ---------- sign-in success redirects into the app
    R=Run(b,base,session=False); pg=R.pg
    pg.goto(base+'/index.html'); pg.wait_for_timeout(1500)
    pg.fill('input[type=password]','secret123')
    first=pg.locator('input[type=text], input:not([type])').first
    first.fill('demo'); pg.get_by_role('button',name='Sign in').last.click(); pg.wait_for_timeout(3000)
    check('valid sign-in reaches the student app', 'user.html' in pg.url or pg.evaluate("!!localStorage.getItem('abhyas_session')"), pg.url[-20:])
    check('login hit the backend', any(a.lower()=='login' for a in R.actions), sorted(set(R.actions)))
    R.close()

    # ---------- admin page smoke (not signed in as admin)
    R=Run(b,base,session=False); pg=R.pg
    pg.goto(base+'/admin.html'); pg.wait_for_timeout(2500)
    check('admin.html loads without JS errors when signed out', not any(k=='pageerror' for k,_ in R.errors), R.errors[:2]); R.close()

    # ---------- legal pages + sitemap/robots
    R=Run(b,base,session=False); pg=R.pg
    for f in ('privacy.html','terms.html'):
        r=pg.goto(base+'/'+f); check(f+' serves 200', r.status==200)
    R.close()

    # ---------- manifest + icons
    R=Run(b,base,session=False); pg=R.pg; pg.goto(base+'/index.html')
    m=pg.evaluate("fetch('manifest.json').then(r=>r.json())")
    ok_icons=all(pg.evaluate(f"fetch('{i['src']}').then(r=>r.status)")==200 for i in m['icons'])
    check('manifest valid: name/start_url/display/icons', all(k in m for k in('name','short_name','start_url','display','icons')) and m['display']=='standalone' and ok_icons, [i['sizes'] for i in m['icons']])
    check('manifest has a 512px icon and 192px icon', {'192x192','512x512'} <= {i['sizes'] for i in m['icons']})
    check('page links manifest + theme-color', pg.evaluate("!!document.querySelector('link[rel=manifest]') && !!document.querySelector('meta[name=theme-color]')"))
    R.close()

    # ---------- OFFLINE through the real service worker
    seed="localStorage.setItem('abhyas_chapters_cache_v2',JSON.stringify({source:%s,savedAt:Date.now(),fails:0}));" % json.dumps(STUB)
    R=Run(b,base,sw='allow'); R.ctx.add_init_script(seed); pg=R.pg
    pg.goto(base+'/user.html'); pg.wait_for_timeout(3500); pg.keyboard.press('Escape')
    pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller || true")
    reg=pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r&&!!(r.active||r.installing||r.waiting))")
    check('service worker registers', reg)
    pg.wait_for_timeout(6000)  # let precache finish
    cached=pg.evaluate("caches.keys().then(async ks=>{let n=0;for(const k of ks){n+=(await (await caches.open(k)).keys()).length}return n})")
    check('app shell precached', cached>20, f'{cached} entries')
    R.ctx.set_offline(True)
    R.errors.clear()
    pg.reload(); pg.wait_for_timeout(4000)
    check('OFFLINE: app reloads and shows signed-in app', pg.evaluate("document.getElementById('app')&&document.getElementById('app').classList.contains('on')"), pg.url[-15:])
    pg.evaluate("UI.go('progress')"); pg.wait_for_timeout(600)
    check('OFFLINE: can navigate screens', pg.evaluate("document.getElementById('view-progress').classList.contains('on')"))
    check('OFFLINE: no uncaught JS errors', not any(k=='pageerror' for k,_ in R.errors), [e for e in R.errors if e[0]=='pageerror'][:2])
    R.close()
    b.close()
print('SUMMARY',sum(res),'/',len(res),'passed')
