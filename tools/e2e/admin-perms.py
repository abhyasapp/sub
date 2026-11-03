"""Admin permissions: what each kind of admin can see / reach. Run: python3 tools/e2e/admin-perms.py"""
import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve(); results=[]
def check(name,ok,info=''):
    results.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+name+(' | '+str(info) if info!='' else ''))

SESSION = "localStorage.setItem('abhyas_admin', JSON.stringify({user:'sub1',token:'tok',expires:Date.now()+3600000,mustChangePassword:false}));"
def boot(b, perms_resp, admins_resp=None, width=1280):
    R=Run(b,base,width=width,height=800,session=False,init=SESSION); pg=R.pg
    def h(r):
        u=r.request.url
        if not ('supabase.co' in u or 'script.google' in u): return r.fallback()
        try: body=json.loads(r.request.post_data or '{}')
        except Exception:
            qs=u.split('?',1)[-1]; body=dict(p.split('=',1) for p in qs.split('&') if '=' in p)
        a=body.get('action') or '?'
        if a=='adminGetPermissions': out=perms_resp
        elif a=='adminListAdmins': out=admins_resp or {'success':False,'error':'Not allowed'}
        else: out={'success':True,'users':[{'username':'stu1','name':'Stu One','email':'s@x.np','status':'active'}],'payments':[],'logs':[],'sets':[],'reports':[],'settings':{},'stats':{}}
        r.fulfill(status=200,content_type='application/json',body=json.dumps(out))
    R.ctx.route('**/*',h)
    pg.goto(base+'/admin.html'); pg.wait_for_timeout(2500)
    return R,pg
def visible_nav(pg): return pg.evaluate("[...document.querySelectorAll('.rail-item[id^=\"nav-\"]')].filter(e=>!e.hidden&&e.offsetParent!==null).map(e=>e.id.replace('nav-',''))")
def visible_groups(pg): return pg.evaluate("[...document.querySelectorAll('.rail-group')].filter(e=>!e.hidden&&e.offsetParent!==null).map(e=>e.textContent.trim())")

with sync_playwright() as p:
    b=p.chromium.launch()
    # 1. restricted sub-admin: Insights + Students only
    R,pg=boot(b,{'success':True,'role':'admin','features':{'dashboard':True,'users_view':True}})
    nav=visible_nav(pg)
    check('A1 restricted admin sees only Today, Insights, Students in the sidebar', sorted(nav)==['dashboard','today','users'], nav)
    check('A2 headings of fully hidden groups are hidden (only Overview + People remain)', visible_groups(pg)==['Overview','People'], visible_groups(pg))
    check('A3 lands on an allowed section', pg.evaluate("UI.current")=='today', pg.evaluate("UI.current"))
    pg.evaluate("UI.nav('payments')"); pg.wait_for_timeout(200)
    check('A4 router still refuses a forbidden section', pg.evaluate("UI.current")!='payments', pg.evaluate("UI.current"))
    pg.evaluate("PALETTE.open && PALETTE.open()"); pg.wait_for_timeout(300)
    titles=pg.evaluate("PALETTE._items.map(i=>i.group+':'+i.title)")
    check('A5 palette hides Payments/Settings/Admins/export commands', not any(t in titles for t in ['Go to:Payments','Go to:Settings','Go to:Admins','Do:Export students as CSV','Do:Export payments as CSV']), [t for t in titles if t.startswith('Go to') or 'Export' in t])
    check('A6 palette still lists students this admin may view', any(t.startswith('Students:') for t in titles))
    check('A7 Settings menu item + payments metric hidden', pg.evaluate("[...document.querySelectorAll('[data-perm=\"settings_view\"],[data-perm=\"payments_view\"]')].every(e=>e.hidden)"))
    R.close()
    # 2. no 'dashboard' permission: must land on the first allowed section, not a blank page
    R,pg=boot(b,{'success':True,'role':'admin','features':{'payments_view':True}})
    check('B1 without Today access, lands on Payments', pg.evaluate("UI.current")=='payments', pg.evaluate("UI.current"))
    R.close()
    # 3. owner sees everything
    R,pg=boot(b,{'success':True,'role':'owner','features':{}})
    allv=pg.evaluate("ADMIN_NAV.ALL.map(i=>i.view)")
    check('C1 owner sees every section', sorted(visible_nav(pg))==sorted(allv), len(visible_nav(pg)))
    R.close()
    # 4. permissions request fails (server error) -> fail CLOSED
    R,pg=boot(b,{'success':False,'error':'boom'})
    check('D1 failed permission load shows nothing privileged', visible_nav(pg)==[], visible_nav(pg))
    check('D2 can() is false when permissions unknown', pg.evaluate("ADMIN.can('exports')")==False)
    check('D3 user is told why', 'permissions' in pg.inner_text('body').lower())
    R.close()
    # 5. permissions fail but server confirms owner through adminListAdmins -> recovered
    R,pg=boot(b,{'success':False},{'success':True,'admins':[],'labels':{},'isOwner':True})
    check('E1 owner recovered via adminListAdmins when permission call fails', len(visible_nav(pg))==len(allv), len(visible_nav(pg)))
    R.close(); b.close()
n=sum(results); print(f'SUMMARY {n} / {len(results)} passed'); sys.exit(0 if n==len(results) else 1)
