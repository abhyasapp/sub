import os,sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from harness import *
srv,base=serve()
theme=sys.argv[1] if len(sys.argv)>1 else 'light'
width=int(sys.argv[2]) if len(sys.argv)>2 else 390
tot_err=0; tot_ax=0; tot_ov=0
with sync_playwright() as p:
    b=p.chromium.launch(); R=Run(b,base,width=width,height=844 if width<700 else 800,theme=theme)
    pg=R.pg; pg.goto(base+'/user.html'); pg.wait_for_timeout(3500); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)   # dismiss the welcome dialog so it cannot mask page-level issues
    views=pg.evaluate("[...document.querySelectorAll('.view')].map(v=>v.id.replace('view-',''))")
    print(f'--- {theme} @{width}px  boot errors:',R.errors)
    tot_err+=len(R.errors)
    for v in views:
        R.errors.clear()
        pg.evaluate(f"UI.go('{v}')"); pg.wait_for_timeout(700)
        on=pg.evaluate(f"document.getElementById('view-{v}').classList.contains('on')")
        ov=pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        ax=R.axe()
        flag='OK ' if on and not R.errors and not ax and ov<=0 else 'BAD'
        print(f'{flag} {v:10s} shown={on} errors={len(R.errors)} axe={len(ax)} overflowPx={ov}')
        for e in R.errors[:3]: print('     ERR',e)
        for a in ax[:3]:
            print('     AXE',a['id'],len(a['nodes']),a['nodes'][0]['target'][0][:70],'|',(a['nodes'][0].get('any') or a['nodes'][0].get('all') or a['nodes'][0].get('none'))[0]['message'][:90])
        tot_err+=len(R.errors); tot_ax+=len(ax); tot_ov+= 1 if ov>0 else 0
    print('TOTAL errors',tot_err,'axe',tot_ax,'overflowViews',tot_ov,'| failed requests:',R.failed[:3])
    b.close()
