"""Sprint v2 end-to-end checks: the plan on screen, a real session feeding the log, launchers,
behind/compressed/mock states, syllabus counting, settings, reports, copy, sync payloads, accessibility."""
import os, sys, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import *

srv, base = serve()
res = []
def check(name, ok, detail=''):
    res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + name + ((' | ' + str(detail)[:140]) if detail != '' else ''))

TODAY = datetime.date.today()
iso = lambda d: d.isoformat()
ago = lambda n: iso(TODAY - datetime.timedelta(days=n))
ahead = lambda n: iso(TODAY + datetime.timedelta(days=n))

def start_init(days_ago):
    return "localStorage.setItem('abhyas_sprint_start', '%s');" % ago(days_ago)

def covered_all_init(days_ago):
    cov = {fid: {'p': '1' * n, 'a': n, 'c': n, 't': 1} for fid, n in FCOUNT.items()}
    return start_init(days_ago) + "localStorage.setItem('abhyas_cov', %s);" % json.dumps(json.dumps(cov))

def boot(b, **kw):
    R = Run(b, base, **kw)
    R.pg.goto(base + '/user.html'); R.pg.wait_for_timeout(3200); R.pg.keyboard.press('Escape'); R.pg.wait_for_timeout(250)
    R.errors.clear()
    return R

def open_sprint(R):
    R.pg.evaluate("UI.go('sprint')"); R.pg.wait_for_timeout(700)

def plan(R):  return R.pg.evaluate("(()=>{const p=SPRINT_PAGE.plan();return {quota:p.quotaToday,left:p.todayRemaining,remaining:p.remaining,total:p.totalAll,status:p.status,phase:p.phase,day:p.dayNum,N:p.N,learnEnd:p.learnEnd,exam:p.exam,perDay:p.requiredPerDay,behind:p.behindBy,compressed:p.compressed,sched:p.schedule.map(d=>({iso:d.iso,n:d.slices.reduce((a,s)=>a+s.count,0)})),slices:p.todaySlices.map(s=>({fid:s.fid,count:s.count}))}})()")
def logday(R, d=None):
    d = d or iso(TODAY)
    return R.pg.evaluate("(d)=>{const r=SPRINT_LOG.days()[d];return r?JSON.parse(JSON.stringify(r)):null}", d)

def play(R, answer_idx, finish=True):
    """Answer every question in the running flashcard session, then Finish. Returns number of questions."""
    pg = R.pg
    pg.wait_for_selector('#quiz-wrap .eo', timeout=8000)
    total = pg.evaluate("S.quiz.qs.length")
    for i in range(total):
        pg.locator('#quiz-wrap .eo').nth(answer_idx).click(timeout=4000); pg.wait_for_timeout(120)
        if i < total - 1: pg.locator('#fc-next').click(timeout=4000); pg.wait_for_timeout(120)
    if finish:
        pg.get_by_role('button', name='Finish').first.click(timeout=4000); pg.wait_for_timeout(1500)
    return total

def back_to_sprint(R):
    R.pg.evaluate("UI.go('sprint')"); R.pg.wait_for_timeout(900)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ───────────────────────── A. a fresh plan, on screen ─────────────────────────
    R = boot(b); pg = R.pg; open_sprint(R)
    P0 = plan(R)
    check('A1 header: Learn phase, Day 1 of 60', pg.inner_text('#sprint-phase-label') == 'Learn phase' and pg.inner_text('#sprint-day-meta') == 'Day 1 of 60')
    check('A2 syllabus size counted: 6 sets x 30 = 180 questions', P0['total'] == 180 and P0['remaining'] == 180, P0['total'])
    check("A3 today's quota is an even share of the Learn phase (5-6 of 180 over 35 days)", P0['quota'] in (5, 6), P0['quota'])
    starts = pg.locator('#sprint-today-list [data-sprint="new"]')
    check("A4 today's list names real chapters with Start buttons", starts.count() >= 1, starts.count())
    check("A5 the buttons' counts add up to today's quota", sum(int(starts.nth(i).get_attribute('data-count')) for i in range(starts.count())) == P0['quota'])
    check('A6 whole syllabus is scheduled on or before the last Learn day', sum(d['n'] for d in P0['sched']) == 180 and all(d['iso'] <= P0['learnEnd'] for d in P0['sched']))
    check('A7 coverage card starts at 0% with Level 7, GK and accuracy-goal bars', '0%' in pg.inner_text('#sprint-cov-pct') and pg.locator('#sprint-cov-levels .cov-lv').count() == 3)
    check("A8 'Coming up' lists the next study days", pg.locator('#sprint-upcoming .up-row').count() >= 3)
    pg.locator('#view-sprint details.cov-chapters > summary').click(); pg.wait_for_timeout(200)
    check('A9 chapters list has all 6 chapters, each with a schedule date', pg.locator('#sprint-chapters .chap-row2').count() == 6 and 'Scheduled' in pg.inner_text('#sprint-chapters'))
    pg.locator('#view-sprint details.cov-chapters > summary').click()
    check('A10 daily report starts gently ("Not started yet")', 'Not started yet' in pg.inner_text('#sprint-report-today'))
    check("A11 Home strip shows the day and today's new count", 'Day 1' in pg.inner_text('#sprint-card') and ('%d new' % P0['quota']) in pg.inner_text('#sprint-card'))
    check('A12 no JS errors rendering the sprint', not [e for e in R.errors if e[0] == 'pageerror'], R.errors[:2])

    # ───────────────────────── B. a real session feeds plan, coverage and log ─────────────────────────
    first = starts.first; count = int(first.get_attribute('data-count')); fid = first.get_attribute('data-fid')
    first.click(); pg.wait_for_timeout(2500)
    n = play(R, 1)                                         # option B is correct in the stub
    check('B1 the quiz had exactly the planned number of questions', n == count, f'{n} vs {count}')
    d = logday(R)
    check('B2 log recorded the questions, accuracy and a session', d and d['q'] == count and d['c'] == count and d['ses'] == 1, d and {k: d[k] for k in ('q', 'c', 'ses')})
    check('B3 log counted them as NEW questions, tagged as a sprint "new" session', d and d['newSeen'] == count and d['kinds']['new'] == count, d and d['kinds'])
    check("B4 the day's target was frozen when first computed", d and d['planned']['new'] == P0['quota'], d and d['planned'])
    pg.evaluate("UI.go('home')"); pg.wait_for_timeout(300); back_to_sprint(R)
    tile = pg.inner_text('.target[data-target="new"]')
    check('B5 New tile shows progress against the plan', f'{count}' in tile and f"/ {P0['quota']}" in tile, tile.replace('\n', ' '))
    check('B6 coverage card moved off 0%', f'{count} of 180' in pg.inner_text('#sprint-cov-hint'), pg.inner_text('#sprint-cov-hint'))
    P1 = plan(R)
    check("B7 today's target did NOT shrink while working through it", P1['quota'] == P0['quota'], f"{P0['quota']} -> {P1['quota']}")
    check('B8 remaining fell by exactly what was covered', P1['remaining'] == 180 - count)
    rt = pg.inner_text('#sprint-report-today')
    check('B9 live report: perfect accuracy and the number of questions', '100% correct' in rt and f'{count} question' in rt, rt.replace('\n', ' ')[:90])
    check('B10 time target uses real minutes studied (was always 0 before)', pg.evaluate("SPRINT_PAGE.targets().time.done") >= 0 and 'm' in pg.inner_text('.target[data-target="time"]'))

    # ───────────────────────── C. mistakes -> review + drill launchers ─────────────────────────
    other = [s for s in P0['slices'] if s['fid'] != fid] or P0['slices']
    pg.evaluate("(a)=>SPRINT_PAGE.run.startNew(a[0],a[1])", [P0['slices'][0]['fid'], 5]); pg.wait_for_timeout(2500)
    if pg.locator('#quiz-wrap .eo').count() == 0:
        pg.evaluate("(a)=>SPRINT_PAGE.run.startNew('L7-2',5)"); pg.wait_for_timeout(2500)
    play(R, 0)                                             # option A is WRONG in the stub: builds the wrong bank
    wrong = pg.evaluate("S.wr.length")
    back_to_sprint(R)
    check('C1 wrong answers fill the wrong bank', wrong >= 1, wrong)
    check('C2 a Review row appears with the real due count', pg.locator('#sprint-today-list [data-sprint="review"]').count() == 1 and pg.evaluate("SPRINT_PAGE.targets().due") == wrong)
    check('C3 a Drill row appears (it used to need chapters ticked elsewhere)', pg.locator('#sprint-today-list [data-sprint="drill"]').count() == 1)
    pg.locator('#sprint-today-list [data-sprint="review"]').click(); pg.wait_for_timeout(1800)
    started = pg.evaluate("!!(S.quiz && S.quiz.active) && S.quiz.qs.length")
    check('C4 Review starts a session from the due wrong questions', started and started <= 30, started)
    play(R, 1)
    check('C5 that session was logged as review', (logday(R)['kinds'].get('review') or 0) >= 1, logday(R)['kinds'])
    back_to_sprint(R)
    pg.locator('#sprint-today-list [data-sprint="drill"]').click(); pg.wait_for_timeout(2000)
    ok = pg.evaluate("!!(S.quiz && S.quiz.active) && S.quiz.qs.length")
    check('C6 Drill starts a session of missed questions', ok and ok >= 1, ok)
    play(R, 1)
    check('C7 that session was logged as drill', (logday(R)['kinds'].get('drill') or 0) >= 1, logday(R)['kinds'])
    back_to_sprint(R)

    # ───────────────────────── M. axe on the busy sprint screen, light + dark ─────────────────────────
    pg.locator('.rep-head').first.click() if pg.locator('.rep-head').count() else None
    pg.locator('#view-sprint details.cov-chapters > summary').click(); pg.wait_for_timeout(250)
    ax = R.axe()
    check('M1 sprint screen (with chapters open, mid-session data): 0 accessibility violations', not ax, [(a['id'], a['nodes'][0]['target'][0][:50]) for a in ax[:3]])
    ov = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check('M2 no sideways overflow at 390px', ov <= 0, ov)
    pg.screenshot(path='/tmp/sprint_busy.png', full_page=True)
    R.close()

    # ───────────────────────── D. mock phase, everything covered ─────────────────────────
    R = boot(b, init=covered_all_init(55)); pg = R.pg; open_sprint(R); P = plan(R)
    check('D1 day 56 is the Mock phase and the syllabus is complete', P['phase'] == 'Mock' and P['status'] == 'complete' and P['remaining'] == 0, (P['phase'], P['status']))
    check('D2 a timed mock row is offered (and no pointless "new" rows)', pg.locator('#sprint-today-list [data-sprint="mock"]').count() == 1 and pg.locator('#sprint-today-list [data-sprint="new"]').count() == 0)
    check("D3 covered but no accuracy data yet: pace line asks for 85% accuracy, not 'Syllabus complete'", 'raise accuracy to 85%' in pg.inner_text('#sprint-pace-verdict') and 'Syllabus complete' not in pg.inner_text('#sprint-pace-verdict'), pg.inner_text('#sprint-pace-verdict'))
    pg.locator('#sprint-today-list [data-sprint="mock"]').click(); pg.wait_for_timeout(3500)
    info = pg.evaluate("({m:S.quiz&&S.quiz.mode,n:S.quiz&&S.quiz.qs&&S.quiz.qs.length,a:S.quiz&&S.quiz.active})")
    check('D4 the mock is a 50-question timed EXAM', info['m'] == 'exam' and info['n'] == 50, info)
    check('D5 phases card reflects Mock as current', 'active' in (pg.get_attribute('#sprint-phase-mock', 'class') or ''))
    R.close()

    # ───────────────────────── E. behind schedule: honest, with the catch-up rate ─────────────────────────
    R = boot(b, init=start_init(12)); pg = R.pg; open_sprint(R); P = plan(R)
    pace = pg.inner_text('#sprint-pace-verdict')
    check('E1 12 idle days: flagged as behind', P['status'] == 'behind' and 'Behind schedule' in pace, pace[:80])
    check('E2 it says how far behind and what rate fixes it', str(P['behind']) in pace and str(P['perDay']) in pace, pace)
    fresh = None
    check('E3 today asks for more than a fresh start would', P['quota'] > 6, P['quota'])
    check('E4 still finishes on time (every question scheduled by the end of Learn)', sum(d['n'] for d in P['sched']) == P['remaining'] and all(d['iso'] <= P['learnEnd'] for d in P['sched']))
    R.close()

    # ───────────────────────── F. late: past Learn with questions left ─────────────────────────
    R = boot(b, init=start_init(40)); pg = R.pg; open_sprint(R); P = plan(R)
    check('F1 day 41 with nothing covered: compressed plan, never after exam day', P['compressed'] and P['status'] == 'compressed' and all(d['iso'] < P['exam'] for d in P['sched']), (P['status'], P['phase']))
    check('F2 the screen says the syllabus is still unfinished', 'unfinished' in pg.inner_text('#sprint-pace-verdict'))
    R.close()

    # ───────────────────────── G. syllabus not counted yet ─────────────────────────
    R = boot(b, fcount={}); pg = R.pg; open_sprint(R)
    vis = pg.evaluate("!document.getElementById('sprint-count-banner').hidden")
    check('G1 uncounted syllabus: an honest banner and a "Set up" row', vis and 'not counted yet' in pg.inner_text('#sprint-count-banner') and pg.locator('#sprint-today-list [data-sprint="count"]').count() == 1)
    pg.locator('#sprint-count-banner [data-sprint="count"]').click(); pg.wait_for_timeout(2500)
    cnt = pg.evaluate("Object.keys(S.fcount).length")
    check('G2 "Count now" counts every set and stores the sizes', cnt == 6, cnt)
    check('G3 the banner clears and real chapters appear in today\'s list', pg.evaluate("document.getElementById('sprint-count-banner').hidden") and pg.locator('#sprint-today-list [data-sprint="new"]').count() >= 1)
    check('G4 coverage now knows the real size (180)', plan(R)['total'] == 180)
    R.close()

    # G5: a generated content-index.js makes the plan exact at first launch, with no counting step
    index_js = 'window.CONTENT_INDEX = Object.assign(window.CONTENT_INDEX || {}, ' + json.dumps(FCOUNT) + ');'
    R = boot(b, fcount={}, overrides={'js/data/content-index.js': index_js}); pg = R.pg; open_sprint(R); P = plan(R)
    check('G5 content-index.js: syllabus known at first launch (180 questions), no banner, chapters scheduled',
          P['total'] == 180 and pg.evaluate("document.getElementById('sprint-count-banner').hidden") and pg.locator('#sprint-today-list [data-sprint="new"]').count() >= 1, P['total'])
    R.close()

    # ───────────────────────── H. settings ─────────────────────────
    R = boot(b); pg = R.pg; open_sprint(R)
    pg.fill('#sprint-exam-input', iso(TODAY)); pg.locator('[data-sprint="save-exam"]').click(); pg.wait_for_timeout(400)
    check('H1 an exam date in the past is refused', pg.evaluate("localStorage.getItem('abhyas_exam_date')") in (None, ''))
    pg.fill('#sprint-exam-input', ahead(20)); pg.locator('[data-sprint="save-exam"]').click(); pg.wait_for_timeout(600)
    P = plan(R)
    check("H2 a real exam date is stored in the SAME key Home uses", pg.evaluate("localStorage.getItem('abhyas_exam_date')") == ahead(20))
    check('H3 the plan shrinks to finish the day before the exam (Day 1 of 20)', P['N'] == 20 and 'Day 1 of 20' in pg.inner_text('#sprint-day-meta'), P['N'])
    check('H4 the whole syllabus is still scheduled inside the shorter sprint', sum(d['n'] for d in P['sched']) == 180)
    check('H5 header names the exam date', 'Exam' in pg.inner_text('#sprint-exam-date'))
    pg.fill('#sprint-rest-input', ahead(2)); pg.locator('[data-sprint="add-rest"]').click(); pg.wait_for_timeout(500)
    P = plan(R)
    check('H6 a planned rest day shows as a chip', pg.locator('#sprint-rest-list .rest-chip').count() == 1)
    check('H7 no work is scheduled on the rest day, and nothing is lost', all(d['iso'] != ahead(2) for d in P['sched']) and sum(d['n'] for d in P['sched']) == 180)
    pg.locator('#sprint-rest-list [data-sprint="remove-rest"]').click(); pg.wait_for_timeout(400)
    check('H8 removing the rest day brings the day back', pg.locator('#sprint-rest-list .rest-chip').count() == 0 and any(d['iso'] == ahead(2) for d in plan(R)['sched']))
    pg.evaluate("SPRINT.takeTodayOff()"); pg.wait_for_timeout(500)
    P = plan(R)
    check('H9 taking today off: no new target today, others absorb it', P['quota'] == 0 and 'Rest day' in pg.inner_text('#sprint-today-list') and sum(d['n'] for d in P['sched']) == 180)
    R.close()

    # ───────────────────────── J. reports from a seeded history ─────────────────────────
    def rec(q, c, new, planned, ch):
        return {'ts': 9, 'q': q, 'c': c, 'w': q - c, 'sk': 0, 'sec': q * 55, 'ses': 2, 'newSeen': new, 'kinds': {'new': q, 'review': 0, 'drill': 0, 'mock': 0},
                'mocks': [], 'byCh': ch, 'planned': {'new': planned}}
    hist = {'v': 1, 'base': {'start': ago(6), 'seen': 0}, 'days': {
        ago(6): rec(40, 34, 30, 30, {'Strength of Materials': {'n': 40, 'c': 34}}),
        ago(5): rec(50, 45, 30, 30, {'Concrete Technology': {'n': 50, 'c': 45}}),
        ago(3): rec(30, 12, 12, 30, {'Hydrology': {'n': 30, 'c': 12}}),
        ago(2): rec(60, 50, 30, 30, {'Hydrology': {'n': 20, 'c': 10}, 'Structural Analysis': {'n': 40, 'c': 40}}),
    }}
    init = start_init(6) + "localStorage.setItem('abhyas_sprint_log', %s);" % json.dumps(json.dumps(hist)) + \
           "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:function(t){window.__copied=t;return Promise.resolve();}}});"
    R = boot(b, init=init); pg = R.pg; open_sprint(R)
    rows = pg.locator('#sprint-report-days .rep-day')
    check('J1 daily list shows the last days since the sprint began', rows.count() == 6, rows.count())
    check('J2 a missed day is met with encouragement, never blame', 'No practice' in pg.inner_text('#sprint-report-days') and not any(w in pg.inner_text('#sprint-report-days').lower() for w in ('failed', 'lazy', 'poor')))
    head = pg.locator('#sprint-report-days .rep-head').nth(4)
    head.click(); pg.wait_for_timeout(200)
    body_id = head.get_attribute('aria-controls')
    check('J3 tapping a day opens its remark (aria-expanded + visible)', head.get_attribute('aria-expanded') == 'true' and pg.locator('#' + body_id).is_visible())
    grade = pg.inner_text('.grade-badge')
    check('J4 sprint grade is computed from coverage, accuracy and consistency', grade in ('A+', 'A', 'B', 'C', 'D'), grade)
    check('J5 three sub-scores are shown', pg.locator('#sprint-summary .score-row').count() == 3)
    check('J6 weakest chapter is named from the history (Hydrology)', 'Hydrology' in pg.inner_text('#sprint-summary .board'))
    check('J7 accuracy trend sparkline is drawn with an accessible name', pg.locator('#sprint-summary .spark svg[role="img"]').count() == 1)
    check('J8 a finish-date projection is shown', 'syllabus' in pg.inner_text('.rep-proj').lower())
    pg.locator('[data-sprint="copy-report"]').click(); pg.wait_for_timeout(400)
    copied = pg.evaluate("window.__copied||''")
    check('J9 "Copy report" puts a complete, readable report on the clipboard', 'Abhyas' in copied and 'Grade:' in copied and 'Syllabus covered' in copied and copied.count('\n') < 20, copied[:60].replace('\n', ' | '))
    # sync payload carries the log, and the lean one does not
    full = pg.evaluate("Object.keys(PSYNC._syncPayloadForServer().sprintLog?.days||{}).length")
    lean = pg.evaluate("PSYNC._syncPayloadForServer({noLog:true}).sprintLog===undefined")
    check('J10 cloud payload includes the sprint log; the last-chance (beacon) payload leaves it out', full >= 4 and lean, (full, lean))
    ax = R.axe(); check('J11 report screen: 0 accessibility violations', not ax, [(a['id'], a['nodes'][0]['target'][0][:50]) for a in ax[:3]])
    pg.screenshot(path='/tmp/sprint_report.png', full_page=True)
    R.close()

    # ───────────────────────── K. dark theme + desktop ─────────────────────────
    for theme, w in (('dark', 390), ('light', 1280), ('dark', 1280)):
        R = boot(b, init=init, theme=theme, width=w, height=844 if w < 700 else 900); pg = R.pg; open_sprint(R)
        pg.locator('#view-sprint details.cov-chapters > summary').click(); pg.wait_for_timeout(200)
        ax = R.axe(); ov = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f'K {theme}@{w}: 0 accessibility violations and no overflow', not ax and ov <= 0, [(a['id'], a['nodes'][0]['target'][0][:50]) for a in ax[:3]] or ov)
        if theme == 'dark' and w == 390: pg.screenshot(path='/tmp/sprint_dark.png', full_page=True)
        R.close()
    b.close()
print('SUMMARY', sum(res), '/', len(res), 'passed')
