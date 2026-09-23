#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Abhyas v1.20 patch  -  comprehensive.

Chapters:  chapters-loader.js refreshes in the background on every launch,
           on 'online', on tab-visible, every 15 minutes. Never force-
           reloads a live tab. sw.js header bumped so the SW reinstalls.
Home:      weekly leaderboard, badges strip, streak insurance line.
Quiz:      wrong-first results, marked count, marked -> bookmark,
           weak-chapter picker bias.
Nav:       sidebar filter search.
Backend:   nudgeInactiveUsers() push trigger.

Run from the folder containing version.js, user.html, and gas/.

    python patch_final.py --dry-run
    python patch_final.py --keep
"""
import os
import re
import sys
import shutil
import subprocess
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(HERE, ".patch-backup-1.20")
DRY = "--dry-run" in sys.argv
KEEP = "--keep" in sys.argv or DRY

DATA = r'''
@@@ FILE version.js

@@@ EDIT v-bump
@@@ OLD
const APP_VERSION = '1.19';
@@@ NEW
/* 1.20 - chapters refresh when you're online; weekly leaderboard; badges;
          wrong-first results; streak insurance; sidebar search; push nudge. */
const APP_VERSION = '1.20';
@@@ END


@@@ FILE gas/code.gs

@@@ EDIT gs-version
@@@ OLD
const APP_VERSION = "1.19";
@@@ NEW
const APP_VERSION = "1.20";
@@@ END


@@@ EDIT gs-nudge
@@@ OLD
function getOrCreateFolder_(name) {
@@@ NEW
/* Nudge users who were active 2-7 days ago but have since gone quiet.
   Installed as a daily trigger by setup.gs. Sends at most one nudge per
   user per day. Only fires for accounts on trial or paid access. */
function nudgeInactiveUsers() {
  const users = _cachedSheetData_(USERS_SHEET, getUsersSheet_).data;
  const progress = _cachedSheetData_(PROGRESS_SHEET, getProgressSheet_).data;
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  /* Last-active timestamp per username (from Progress.updatedAt). */
  const lastActive = {};
  for (let i = 1; i < progress.length; i++) {
    const u = String(progress[i][0] || "").toLowerCase().trim();
    if (!u) continue;
    const t = new Date(progress[i][2]).getTime();
    if (!isNaN(t) && (!lastActive[u] || t > lastActive[u])) lastActive[u] = t;
  }

  let sent = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 1; i < users.length; i++) {
    const username = String(users[i][0] || "");
    const status = String(users[i][7] || "");
    if (!username) continue;
    if (status !== "trial" && status !== "active") continue;

    const fallback = new Date(users[i][8]).getTime();   /* createdAt */
    const last = lastActive[username.toLowerCase()] || fallback;
    const daysAgo = (now - last) / DAY;
    if (daysAgo < 2 || daysAgo > 7) continue;

    const sentKey = "nudged_" + username.toLowerCase() + "_" + today;
    if (props.getProperty(sentKey)) continue;

    try {
      const result = sendPushNotification_(username,
        "Your review queue is ready",
        "A few questions are waiting for you. Open Abhyas and take 5 minutes.");
      if (result.success) {
        props.setProperty(sentKey, "1");
        sent++;
      }
    } catch (e) { /* best effort */ }
  }
  console.log("nudgeInactiveUsers: sent " + sent + " nudge(s).");
  return "Sent " + sent + " nudge(s).";
}

function getOrCreateFolder_(name) {
@@@ END


@@@ FILE gas/setup.gs

@@@ EDIT setup-nudge-trigger
@@@ OLD
  /* v1.11: daily housekeeping for Script Properties. */
@@@ NEW
  /* v1.20: daily nudge for inactive students. */
  if (!triggers.some(t => t.getHandlerFunction() === "nudgeInactiveUsers")) {
    ScriptApp.newTrigger("nudgeInactiveUsers").timeBased().everyDays(1).atHour(19).create();
  }
  /* v1.11: daily housekeeping for Script Properties. */
@@@ END


@@@ FILE sw.js

@@@ EDIT sw-header
@@@ OLD
   SW.JS — Abhyas Service Worker  (v1.14)
@@@ NEW
   SW.JS — Abhyas Service Worker  (v1.20)
@@@ END


@@@ FILE chapters-loader.js

@@@ EDIT chl-refresh
@@@ OLD
/* ── 3. Warm path is complete. Background-refresh if stale. ───────── */
const age = Date.now() - (cache.savedAt || 0);
if(age < TTL_MS) return;

fetch(URL + '&_=' + Date.now(), { cache:'no-store' })
  .then(r => r.ok ? r.text() : null)
  .then(src => {
    if(!src) return;
    if(src === cache.source){
      writeCache(cache.source);
      return;
    }
    if(!writeCache(src)) return;
    const lastReload = Number(sessionStorage.getItem('abhyas_chapters_last_reload') || 0);
    if(Date.now() - lastReload > 30000){
      sessionStorage.setItem('abhyas_chapters_last_reload', String(Date.now()));
      location.reload();
    }
  })
  .catch(() => {});
@@@ NEW
/* ── 3. Warm path complete — refresh fresh data in the background ────
   Cache-first makes every cold boot instant. But a stale chapter list is
   worse than a slower one: when you rename a chapter in Drive, students
   should see it the next time they open the app, not 24 hours later. So:
   fetch on every launch, every 'online', every tab-visible, and every 15
   minutes. Never auto-reload — a student might be mid-quiz. Offer a toast. */
let _inFlight = false;

function fetchFresh(reason){
  if(_inFlight) return;
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return;
  _inFlight = true;

  fetch(URL + '&_=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.text() : null)
    .then(src => {
      if(!src) return;
      if(src === cache.source){
        writeCache(src);
        return;
      }
      if(!writeCache(src)) return;
      try{
        window.dispatchEvent(new CustomEvent('abhyas:chapters-updated', {
          detail: { reason: reason || 'background' }
        }));
        if(typeof window.toast === 'function'){
          window.toast('Chapters updated — reload to see the change', 8000);
        }
      }catch(e){}
    })
    .catch(() => {})
    .finally(() => { _inFlight = false; });
}

setTimeout(() => fetchFresh('boot'), 2000);
window.addEventListener('online', () => fetchFresh('online'));
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') fetchFresh('visible');
});
setInterval(() => fetchFresh('interval'), 15 * 60 * 1000);
@@@ END


@@@ FILE user.html

@@@ EDIT usr-board-slot
@@@ OLD
        <div class="g2-grid">
          <div class="card">
            <div class="card-hd"><h3><i class="ph ph-trend-up"></i> Recent sessions</h3></div>
            <div id="recent-sessions"></div>
          </div>
@@@ NEW
        <div id="weekly-board-slot"></div>
        <div id="badges-strip"></div>

        <div class="g2-grid">
          <div class="card">
            <div class="card-hd"><h3><i class="ph ph-trend-up"></i> Recent sessions</h3></div>
            <div id="recent-sessions"></div>
          </div>
@@@ END


@@@ EDIT usr-insurance-line
@@@ OLD
          <div class="sk-bar" id="sk-bar"></div>
        </section>
@@@ NEW
          <div class="sk-bar" id="sk-bar"></div>
          <p class="t-cap" id="streak-insurance" style="text-align:center;margin-top:var(--sp-2);opacity:.75"></p>
        </section>
@@@ END


@@@ EDIT usr-modules
@@@ OLD
/* ═══════════════════════════════════════════════════════════════════
   READINESS — predicted exam score, right on the Home screen.
   ═══════════════════════════════════════════════════════════════════ */
@@@ NEW
/* ═══════════════════════════════════════════════════════════════════
   WEEKLY_BOARD — leaderboard for the most recently closed weekly test.
   Uses getWeeklyStanding, which already exists on the backend.
   ═══════════════════════════════════════════════════════════════════ */
window.WEEKLY_BOARD = {
  _cache: {},
  async _fetch(id){
    if(this._cache[id] !== undefined) return this._cache[id];
    if(!S.online || S.forcedOffline || !S.user || !S.user.token){
      this._cache[id] = null;
      return null;
    }
    try{
      const r = await netFetch(APPS, {
        method:'POST', headers:{'Content-Type':'text/plain'},
        body: JSON.stringify({ action:'getWeeklyStanding',
          username:S.user.username, token:S.user.token, weeklyId:id })
      }, 15000);
      const res = await r.json();
      const val = (res && res.success && res.ready && res.attempted) ? res : null;
      this._cache[id] = val;
      return val;
    }catch(e){ this._cache[id] = null; return null; }
  },
  async render(){
    const slot = $('weekly-board-slot');
    if(!slot) return;
    slot.innerHTML = '';
    if(typeof WEEKLY === 'undefined') return;

    const sets = WEEKLY.sets || [];
    const attempts = WEEKLY.attempts || {};
    const closed = sets.filter(s => s.released && !WEEKLY.examOpen(s) && attempts[s.id]);
    if(!closed.length) return;

    closed.sort((a,b) =>
      (attempts[b.id].submittedAt || 0) - (attempts[a.id].submittedAt || 0));
    const s = closed[0];
    const a = attempts[s.id];
    const st = a.standing || await this._fetch(s.id);
    if(!st || !st.rank) return;

    const pct = st.percentile || 0;
    const icon = pct >= 90 ? 'ph-trophy' : pct >= 75 ? 'ph-target' : pct >= 50 ? 'ph-thumbs-up' : 'ph-trend-up';
    const topPct = Math.max(1, 100 - pct);
    const beat = Math.max(0, st.total - st.rank);

    slot.innerHTML =
      '<section class="card" style="border-color:var(--accent-line)">' +
        '<div class="card-hd"><h3><i class="ph ' + icon + '"></i> Weekly leaderboard</h3>' +
          '<span class="ctag ta">' + esc(s.title) + '</span></div>' +
        '<div class="stats-row" style="margin-bottom:var(--sp-3)">' +
          '<div class="scard"><div class="sv ta2">' + st.rank + '</div><div class="stat-lbl">Your rank</div></div>' +
          '<div class="scard"><div class="sv">' + st.total + '</div><div class="stat-lbl">Attempts</div></div>' +
          '<div class="scard"><div class="sv tcy">' + (a.pct || 0) + '%</div><div class="stat-lbl">Your score</div></div>' +
          '<div class="scard"><div class="sv">' + (st.avgPct || 0) + '%</div><div class="stat-lbl">Average</div></div>' +
        '</div>' +
        '<p class="t-foot">Top ' + topPct + '% of students. You beat ' + beat + ' of them.</p>' +
      '</section>';
  }
};

/* ═══════════════════════════════════════════════════════════════════
   STREAK_INSURANCE — surface the silent skip.
   ═══════════════════════════════════════════════════════════════════ */
window.STREAK_INSURANCE = {
  paint(){
    const el = $('streak-insurance');
    if(!el) return;
    try{
      const days = (S.stk && S.stk.days) || [];
      if(days.length < 3){ el.textContent = ''; return; }
      const set = new Set(days);
      const pad = n => String(n).padStart(2, '0');
      let misses = 0;
      for(let i = 1; i <= 7; i++){
        const d = new Date(); d.setDate(d.getDate() - i);
        const k = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
        if(!set.has(k)) misses++;
      }
      if(misses === 0) el.textContent = '1 skipped day available this week';
      else if(misses === 1) el.textContent = 'Streak insurance used this week';
      else el.textContent = '';
    }catch(e){ el.textContent = ''; }
  }
};

/* ═══════════════════════════════════════════════════════════════════
   BADGES_UI — lightweight achievements strip on Home.
   ═══════════════════════════════════════════════════════════════════ */
window.BADGES_UI = {
  DEFS: [
    { id:'first_100',   icon:'ph-seedling',  name:'First 100',  need:s => (s.prog.total||0) >= 100 },
    { id:'half_500',    icon:'ph-books',     name:'500 answered', need:s => (s.prog.total||0) >= 500 },
    { id:'streak_7',    icon:'ph-fire',      name:'7-day streak', need:() => STREAK.currentStreak() >= 7 },
    { id:'streak_30',   icon:'ph-mountains', name:'30-day streak', need:() => STREAK.currentStreak() >= 30 },
    { id:'perfect_exam',icon:'ph-medal',     name:'Perfect paper', need:s => (s.prog.sessions||[]).some(x => x.mode==='exam' && x.pct===100) },
    { id:'bookmark_50', icon:'ph-star',      name:'50 saved',     need:s => (s.bk||[]).length >= 50 },
    { id:'due_clear',   icon:'ph-target',    name:'Caught up',    need:() => S.wr && S.wr.length > 20 && REV.dueCount() === 0 }
  ],
  render(){
    const slot = $('badges-strip');
    if(!slot) return;
    if(!S.prog.badges) S.prog.badges = {};
    let changed = false;
    this.DEFS.forEach(d => {
      try{
        if(!S.prog.badges[d.id] && d.need(S)){
          S.prog.badges[d.id] = new Date().toISOString().slice(0,10);
          changed = true;
        }
      }catch(e){}
    });
    if(changed) _save(LS.PROG, S.prog);
    const earned = this.DEFS.filter(d => S.prog.badges[d.id]).length;
    if(!earned && this.DEFS.length === 0){ slot.innerHTML = ''; return; }
    slot.innerHTML =
      '<div class="card"><div class="card-hd"><h3><i class="ph ph-medal"></i> Achievements</h3>' +
        '<span class="t-cap">' + earned + ' / ' + this.DEFS.length + '</span></div>' +
        '<div style="display:flex;gap:var(--sp-3);overflow-x:auto;padding-bottom:var(--sp-2)">' +
          this.DEFS.map(d => {
            const got = !!S.prog.badges[d.id];
            return '<div style="flex-shrink:0;width:82px;text-align:center;opacity:' + (got ? 1 : 0.32) + '">' +
              '<div style="font-size:1.5rem;color:' + (got ? 'var(--accent)' : 'var(--ink-3)') + '">' +
                '<i class="ph ' + d.icon + '"></i></div>' +
              '<div class="t-cap" style="margin-top:2px;line-height:1.25">' + esc(d.name) + '</div>' +
            '</div>';
          }).join('') +
        '</div></div>';
  }
};

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR_SEARCH — filter the sidebar items with a small input.
   ═══════════════════════════════════════════════════════════════════ */
window.SIDEBAR_SEARCH = {
  init(){
    const sb = document.getElementById('sb');
    if(!sb || document.getElementById('sb-filter')) return;
    const input = document.createElement('input');
    input.id = 'sb-filter';
    input.type = 'search';
    input.className = 'input';
    input.placeholder = 'Find a screen…';
    input.style.cssText = 'margin:0 var(--sp-2) var(--sp-3);min-height:32px;font-size:var(--fs-foot)';
    input.addEventListener('input', () => SIDEBAR_SEARCH.filter(input.value));
    const anchor = sb.querySelector('#sb-admin-promo') || sb.querySelector('.sb-you');
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(input, anchor.nextSibling);
    else sb.insertBefore(input, sb.firstChild);
  },
  filter(q){
    const term = String(q || '').toLowerCase().trim();
    document.querySelectorAll('#sb .sb-item').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = (!term || text.indexOf(term) !== -1) ? '' : 'none';
    });
    document.querySelectorAll('#sb .sb-sec').forEach(sec => {
      const items = sec.querySelectorAll('.sb-item');
      const any = Array.from(items).some(i => i.style.display !== 'none');
      sec.style.display = any ? '' : 'none';
    });
  }
};

/* ═══════════════════════════════════════════════════════════════════
   READINESS — predicted exam score, right on the Home screen.
   ═══════════════════════════════════════════════════════════════════ */
@@@ END


@@@ EDIT usr-home-wire
@@@ OLD
function _renderHomeExtras(){
  try { if (typeof RECOVERY !== 'undefined') RECOVERY.render(); } catch(e){}
  try { if (typeof MISCONCEPTIONS !== 'undefined') MISCONCEPTIONS.render(); } catch(e){}
  try { if (typeof TODAY_PLAN !== 'undefined') TODAY_PLAN.render(); } catch(e){}
  try { if (typeof TODAY_PLAN !== 'undefined') TODAY_PLAN._renderResume(); } catch(e){}
  try { if (typeof READINESS !== 'undefined') READINESS.render(); } catch(e){}
  try { if (typeof CHAP_VERDICTS !== 'undefined') CHAP_VERDICTS.render(); } catch(e){}
  try { if (typeof PACE !== 'undefined') PACE.render(); } catch(e){}
}
@@@ NEW
function _renderHomeExtras(){
  try { if (typeof RECOVERY !== 'undefined') RECOVERY.render(); } catch(e){}
  try { if (typeof MISCONCEPTIONS !== 'undefined') MISCONCEPTIONS.render(); } catch(e){}
  try { if (typeof TODAY_PLAN !== 'undefined') TODAY_PLAN.render(); } catch(e){}
  try { if (typeof TODAY_PLAN !== 'undefined') TODAY_PLAN._renderResume(); } catch(e){}
  try { if (typeof READINESS !== 'undefined') READINESS.render(); } catch(e){}
  try { if (typeof CHAP_VERDICTS !== 'undefined') CHAP_VERDICTS.render(); } catch(e){}
  try { if (typeof PACE !== 'undefined') PACE.render(); } catch(e){}
  try { if (typeof STREAK_INSURANCE !== 'undefined') STREAK_INSURANCE.paint(); } catch(e){}
  try { if (typeof BADGES_UI !== 'undefined') BADGES_UI.render(); } catch(e){}
  try { if (typeof WEEKLY_BOARD !== 'undefined') WEEKLY_BOARD.render(); } catch(e){}
}
@@@ END


@@@ EDIT usr-results-hook
@@@ OLD
  const _rf = QUIZ._renderFlashcard.bind(QUIZ);
@@@ NEW
  /* Results screen: sort wrong-first, surface marked count, and persist
     marked questions as 'Need Check' bookmarks so they come back later. */
  const _origShowResults = QUIZ._showResults.bind(QUIZ);
  QUIZ._showResults = function(){
    _origShowResults();
    try {
      const stats = document.getElementById('res-stats');

      /* Auto-bookmark marked questions with the 'Need Check' tag. */
      const marked = (S.quiz && S.quiz.marked) ? S.quiz.marked : new Set();
      if(marked.size && S.quiz && S.quiz.qs){
        let added = 0;
        marked.forEach(idx => {
          const q = S.quiz.qs[idx];
          if(!q || !q.uid) return;
          const existing = (S.bk || []).find(b => b.uid === q.uid);
          if(!existing){
            S.bk.push(Object.assign({}, q, { tag: 'Need Check' }));
            added++;
          } else if(!existing.tag){
            existing.tag = 'Need Check';
            added++;
          }
        });
        if(added){
          _save(LS.BK, S.bk);
          try { if(typeof HOME !== 'undefined' && HOME.updateBadges) HOME.updateBadges(); } catch(e){}
        }
      }

      if(stats && !stats.parentElement.querySelector('.marked-line') && marked.size > 0){
        const p = document.createElement('p');
        p.className = 'marked-line t-foot';
        p.style.cssText = 'text-align:center;color:var(--warning);margin-top:.4rem';
        p.innerHTML = '<i class="ph ph-flag"></i> You marked ' + marked.size +
          ' question' + (marked.size === 1 ? '' : 's') + ' for review';
        stats.parentElement.insertBefore(p, stats.nextSibling);
      }

      /* Reorder the review list: wrong first, then skipped, then correct. */
      const box = document.getElementById('res-review');
      if(box && S.quiz && S.quiz.qs){
        const cards = Array.from(box.children);
        if(cards.length === S.quiz.qs.length){
          const pairs = cards.map((c, i) => {
            const a = S.quiz.ans[i];
            const ok = isOk(a, S.quiz.qs[i].correct);
            const rank = (a === null) ? 1 : (ok ? 3 : 0);
            return { c: c, rank: rank, i: i };
          });
          pairs.sort((x, y) => x.rank - y.rank || x.i - y.i);
          pairs.forEach(p => box.appendChild(p.c));
        }
      }
    } catch (e) { /* cosmetic — never break results over it */ }
  };

  const _rf = QUIZ._renderFlashcard.bind(QUIZ);
@@@ END




@@@ EDIT usr-init-hooks
@@@ OLD
    setTimeout(() => {
      if (typeof APP_SWITCH !== 'undefined') APP_SWITCH.refresh();
      else { try { _setAdminVisible(!!(S.user && S.user.adminCapable)); } catch(e){} }
      _refreshHints();
      if (typeof MY_SUBJ !== 'undefined') MY_SUBJ.load(true);
    }, 300);
@@@ NEW
    setTimeout(() => {
      if (typeof APP_SWITCH !== 'undefined') APP_SWITCH.refresh();
      else { try { _setAdminVisible(!!(S.user && S.user.adminCapable)); } catch(e){} }
      _refreshHints();
      if (typeof MY_SUBJ !== 'undefined') MY_SUBJ.load(true);
      if (typeof SIDEBAR_SEARCH !== 'undefined') SIDEBAR_SEARCH.init();
      if (typeof BADGES_UI !== 'undefined') BADGES_UI.render();
    }, 300);
@@@ END




'''


def say(msg=""): print(msg)
def die(msg):
    say("\n[STOPPED] " + msg); say("Nothing was changed."); sys.exit(1)


def parse_data(raw):
    ops = []; cur = None; section = None; buf = []; cur_file = None
    def flush():
        nonlocal buf
        if cur is not None and section is not None:
            cur[section] = "\n".join(buf)
        buf = []
    for line in raw.split("\n"):
        if line.startswith("@@@ "):
            fields = line[4:].split()
            tag = fields[0]
            if tag == "FILE":
                cur_file = fields[1]
            elif tag == "EDIT":
                flush()
                cur = {"kind": "edit", "file": cur_file, "id": fields[1],
                       "count": 1, "old": "", "new": ""}
                for f in fields[2:]:
                    if f.startswith("count="):
                        cur["count"] = int(f.split("=", 1)[1])
                section = None
            elif tag == "OLD": flush(); section = "old"
            elif tag == "NEW": flush(); section = "new"
            elif tag == "END":
                flush()
                if cur is not None: ops.append(cur)
                cur = None; section = None
        elif section is not None:
            buf.append(line)
    return ops


def read_text(rel):
    with open(os.path.join(HERE, rel), "rb") as fh:
        s = fh.read().decode("utf-8")
    return s.replace("\r\n", "\n"), ("\r\n" in s)


def have_node(): return shutil.which("node") is not None


def node_bad(code):
    fd, name = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh: fh.write(code)
        r = subprocess.run(["node", "--check", name],
                           capture_output=True, text=True, timeout=60)
        return r.returncode != 0
    finally:
        try: os.unlink(name)
        except OSError: pass


SCRIPT_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S | re.I)


def inline_scripts(html):
    out = []
    for m in SCRIPT_RE.finditer(html):
        attrs, body = m.group(1), m.group(2)
        if re.search(r"\bsrc\s*=", attrs) or re.search(r"application/ld\+json", attrs, re.I):
            continue
        if body.strip(): out.append(body)
    return out


def count_bad(rel, text):
    if rel.endswith(".js") or rel.endswith(".gs"):
        return 1 if node_bad(text) else 0
    if rel.endswith(".html"):
        return sum(1 for b in inline_scripts(text) if node_bad(b))
    return 0


def main():
    must_have = ["version.js", "user.html", "app.js",
                 "chapters-loader.js", "sw.js",
                 os.path.join("gas", "code.gs"),
                 os.path.join("gas", "setup.gs")]
    for m in must_have:
        if not os.path.exists(os.path.join(HERE, m)):
            die("Cannot find %s next to patch_final.py." % m)

    ver = read_text("version.js")[0]
    if "APP_VERSION = '1.19'" not in ver and "APP_VERSION = '1.20'" not in ver:
        die("Expected version.js to be 1.19 or 1.20. Found something else.")

    ops = parse_data(DATA)
    state = {}; log = []; errors = []

    def get(rel):
        if rel not in state:
            if os.path.exists(os.path.join(HERE, rel)):
                t, crlf = read_text(rel)
                state[rel] = {"text": t, "crlf": crlf, "orig": t, "exists": True}
            else:
                state[rel] = {"text": "", "crlf": False, "orig": None, "exists": False}
        return state[rel]

    for op in ops:
        kind, rel = op["kind"], op["file"]
        if kind == "edit":
            if not os.path.exists(os.path.join(HERE, rel)):
                errors.append("%s: file not found (%s)" % (rel, op["id"])); continue
            st = get(rel)
            text, old, new = st["text"], op["old"], op["new"]
            contains = old in new
            applied = (new in text) if contains else ((old not in text) and (new in text))
            if applied:
                log.append("  [skip] %-24s %s (already applied)" % (op["id"], rel)); continue
            found = text.count(old)
            if found != op["count"]:
                errors.append("%s [%s]: expected %d match(es), found %d"
                              % (rel, op["id"], op["count"], found)); continue
            st["text"] = text.replace(old, new)
            log.append("  [ ok ] %-24s %s" % (op["id"], rel))

    say("Abhyas v1.20 patch (comprehensive)")
    say("=" * 60)
    for l in log: say(l)

    if errors:
        say("\nThese edits do not match your current files:")
        for e in errors: say("  - " + e)
        say("\nSend me the file(s) named above and I will regenerate the patch.")
        die("Aborted before writing anything.")

    changed = [rel for rel, s in state.items() if s["text"] != s["orig"]]

    if have_node():
        say("\nSyntax-checking patched files with Node ...")
        bad = []
        for rel in changed:
            if rel.endswith((".js", ".gs", ".html")):
                nb = count_bad(rel, state[rel]["text"])
                ob = count_bad(rel, state[rel]["orig"]) if state[rel]["orig"] is not None else 0
                if nb > ob: bad.append(rel)
        if bad: die("JavaScript syntax error in: " + ", ".join(bad))
        say("  all good.")
    else:
        say("\n(Node.js not found, syntax check skipped.)")

    if not changed:
        say("\nNothing to change: everything is already applied.")
    elif DRY:
        say("\n[dry run] Would change %d file(s): %s" % (len(changed), ", ".join(sorted(changed))))
        say("Nothing was written and patch_final.py was kept.")
        return
    else:
        for rel in sorted(changed):
            s = state[rel]; path = os.path.join(HERE, rel)
            if s["exists"]:
                bpath = os.path.join(BACKUP, rel)
                if not os.path.exists(bpath):
                    os.makedirs(os.path.dirname(bpath), exist_ok=True)
                    shutil.copy2(path, bpath)
            os.makedirs(os.path.dirname(path) or HERE, exist_ok=True)
            out = s["text"].replace("\n", "\r\n") if s["crlf"] else s["text"]
            with open(path, "wb") as fh: fh.write(out.encode("utf-8"))
        say("\nUpdated %d file(s). Backups in .patch-backup-1.20/" % len(changed))

    say("\nNEXT STEPS")
    say("  1. Deploy gas/code.gs and gas/setup.gs to Apps Script.")
    say("     Paste each over the existing file, then")
    say("     Deploy -> Manage deployments -> Edit -> New version -> Deploy.")
    say("  2. In Apps Script, run setup() once so the nudge trigger installs.")
    say("  3. Hard-reload the site so the v1.20 service worker installs.")
    say("  4. Verify:")
    say("     - Home shows Achievements strip + streak-insurance line")
    say("     - Sidebar has a filter input near the top")
    say("     - Chapters screen (offline) shows 'X of Y sets on this device'")
    say("     - After a weekly test, Home shows the leaderboard card")
    say("     - Results screen: wrong questions first, marked count on top")
    say("  5. Delete .patch-backup-1.20 when happy.")

    if not KEEP:
        try:
            os.remove(os.path.abspath(__file__))
            say("\npatch_final.py has deleted itself.")
        except OSError as ex:
            say("\nCould not delete patch_final.py (%s). Delete it by hand." % ex)


if __name__ == "__main__":
    main()