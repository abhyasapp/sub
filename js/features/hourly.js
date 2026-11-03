// js/features/hourly.js — hourly written question + hourly sprint.

window.HOURLY = {
  LS_LV:    'abhyas_hourly_lv',
  LS_SUBJ:  'abhyas_hourly_subj_v1',
  LS_OBJ:   'abhyas_hourly_obj_v1',

  OBJ_COUNT:    50,
  OBJ_SECONDS:  60 * 60,
  SUBJ_SECONDS: 60 * 60,

  LEVEL_NAME: {
    level7: 'L7 Civil Engineering',
    level5: 'L5 Diploma',
    gk:     'General Knowledge'
  },

  _bank: null, _bankLoading: false,
  _clockTick: null, _subjTick: null,
  _pendingFile: null, _pick: null,

  // ── level ────────────────────────────────────────────────────────────
  get level(){
    try {
      const v = localStorage.getItem(this.LS_LV);
      return (v === 'level5' || v === 'gk') ? v : 'level7';
    } catch(e){ return 'level7'; }
  },
  setLevel(lv){
    if (lv !== 'level7' && lv !== 'level5' && lv !== 'gk') return;
    try { localStorage.setItem(this.LS_LV, lv); } catch(e){}
    this._pick = null;
    this.render();
  },

  // ── time ─────────────────────────────────────────────────────────────
  _hourKey(){
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth()+1) + p(d.getDate()) + p(d.getHours());
  },
  _msToNextHour(){
    const d = new Date();
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()+1, 0, 0, 0);
    return n.getTime() - d.getTime();
  },
  _nextHourLabel(){
    const d = new Date();
    const n = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()+1, 0, 0, 0);
    return n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  },

  // ── deterministic shuffle ────────────────────────────────────────────
  _hash(str){
    let h = 2166136261;
    for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  },
  _rng(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  _shuffle(arr, seed){
    const r = this._rng(seed), a = arr.slice();
    for (let i = a.length - 1; i > 0; i--){
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // ── storage ──────────────────────────────────────────────────────────
  _getSubj(){ try { const r = localStorage.getItem(this.LS_SUBJ); return r ? JSON.parse(r) : null; } catch(e){ return null; } },
  _setSubj(s){ try { s ? localStorage.setItem(this.LS_SUBJ, JSON.stringify(s)) : localStorage.removeItem(this.LS_SUBJ); } catch(e){} },
  _getObj(){ try { const r = localStorage.getItem(this.LS_OBJ); return r ? JSON.parse(r) : null; } catch(e){ return null; } },
  _setObj(s){ try { s ? localStorage.setItem(this.LS_OBJ, JSON.stringify(s)) : localStorage.removeItem(this.LS_OBJ); } catch(e){} },

  // ── written bank ─────────────────────────────────────────────────────
  async _ensureBank(){
    if (this._bank) return this._bank;
    if (this._bankLoading){
      while (this._bankLoading) await new Promise(r => setTimeout(r, 120));
      return this._bank;
    }
    this._bankLoading = true;
    try {
      /* subj-bank.js already handles both backends correctly (POST for
         Supabase, GET for GAS) and caches per-file. Reuse it rather than
         duplicating the fetch logic here. */
      if (typeof loadBank === 'function') await loadBank();
      if (typeof _allQuestions === 'function') {
        this._bank = _allQuestions();
      } else {
        this._bank = [];
      }
    } catch(e){
      this._bank = [];
    }
    this._bankLoading = false;
    return this._bank;
  },
  _extract(raw, ref){
    const out = [];
    const push = (q, si, qi) => {
      if (!q || !q.q) return;
      out.push({
        id: q.id || (ref.fileId + '_' + si + '_' + qi),
        chapterId: ref.chapterId,
        topic: String(q.topic || q.chapter || '').trim(),
        q: String(q.q).trim(),
        marks: this._parseMarks(q.marks)
      });
    };
    if (raw && Array.isArray(raw.sections)){
      raw.sections.forEach((sec, si) => {
        const topic = String(sec.section || '').trim();
        (sec.questions || []).forEach((q, qi) => { if (q) q.topic = q.topic || topic; push(q, si, qi); });
      });
    } else if (Array.isArray(raw)){
      raw.forEach((q, qi) => push(q, 0, qi));
    }
    return out;
  },
  _parseMarks(raw){
    if (typeof raw === 'number') return (raw === 5 || raw === 10) ? raw : 10;
    const s = String(raw || '').trim();
    if (!s) return 10;
    const eq = s.lastIndexOf('=');
    if (eq > -1){
      const m = s.slice(eq+1).match(/\d+(?:\.\d+)?/);
      if (m){ const n = Math.round(parseFloat(m[0])); return (n===5||n===10)?n:10; }
    }
    if (s.includes('+')){
      const p = s.split('+').map(parseFloat).filter(isFinite);
      if (p.length){ const n = Math.round(p.reduce((a,b)=>a+b,0)); return (n===5||n===10)?n:10; }
    }
    const m = s.match(/\d+/); if (!m) return 10;
    const n = parseInt(m[0],10); return (n===5||n===10)?n:10;
  },

  // ── mount / unmount ──────────────────────────────────────────────────
  mount(){ this.render(); this._startTicks(); },
  unmount(){ this._stopTicks(); },
  _startTicks(){
    this._stopTicks();
    this._clockTick = setInterval(() => {
      this._paintClock();
      this._refreshBadge();
    }, 1000);
    this._subjTick = setInterval(() => this._tickSubj(), 1000);
  },
  _stopTicks(){
    if (this._clockTick){ clearInterval(this._clockTick); this._clockTick = null; }
    if (this._subjTick){  clearInterval(this._subjTick);  this._subjTick  = null; }
  },
  _paintClock(){
    const el = document.getElementById('hourly-clock');
    if (!el) return;
    el.textContent = formatTime(Math.floor(this._msToNextHour() / 1000)) + ' to next hour';
  },

  async render(){
    ['level7','level5','gk'].forEach(lv => {
      const b = document.getElementById('hourly-lv-' + lv);
      if (b) b.classList.toggle('active', lv === this.level);
    });
    this._paintClock();
    await Promise.all([this._renderSubj(), this._renderObj()]);
    this._refreshBadge();
  },

  // ── written ──────────────────────────────────────────────────────────
  async _renderSubj(){
    const box     = document.getElementById('hourly-subj-body');
    const marksEl = document.getElementById('hourly-subj-marks');
    if (!box) return;

    const cur0 = this._getSubj();
    if (cur0 && !cur0.submitted && cur0.endsAt && Date.now() >= cur0.endsAt){
      this._setSubj(null);
      this._pendingFile = null;
    }
    const st = this._getSubj();

    if (st && st.submitted){
      if (marksEl) marksEl.textContent = st.marks + ' marks';
      box.innerHTML =
        '<div class="qotd-done">' +
          '<span class="big"><i class="ph ph-check-circle" style="color:var(--grn)"></i></span>' +
          '<h3>Submitted for review</h3>' +
          '<p>Your answer was sent to admin at ' + new Date(st.submittedAt).toLocaleTimeString() + '.</p>' +
          '<p style="margin-top:.5rem">A fresh question is served at the top of the next hour.</p>' +
        '</div>';
      return;
    }

    if (st){
      if (marksEl) marksEl.textContent = st.marks + ' marks';
      const chapName = this._chapterLabel(st.chapter);
      box.innerHTML =
        '<div class="qotd-meta">' + esc(chapName) + (st.topic ? ' · ' + esc(st.topic) : '') + '</div>' +
        '<div class="qotd-q" style="margin-top:var(--sp-2)">' + esc(st.q) + '</div>' +
        '<div class="qotd-timer" id="hourly-subj-tmr">—</div>' +
        '<div class="qotd-timer-lbl">Time left to finish and upload</div>' +
        '<div class="qotd-phase-bar"><div class="qotd-phase-fill" id="hourly-subj-bar" style="width:100%"></div></div>' +
        (this._pendingFile
          ? '<div class="qotd-file-chip"><i class="ph ph-file-pdf" style="color:var(--grn);font-size:1.1rem"></i>' +
              '<span class="fn">' + esc(this._pendingFile.filename) + '</span>' +
              '<span style="font-size:.66rem;color:var(--t3)">' + Math.round(this._pendingFile.size/1024) + ' KB</span>' +
              '<button type="button" aria-label="Remove file" data-on-click="HOURLY.clearFile()"><i class="ph ph-x"></i></button></div>'
          : '') +
        '<label class="qotd-drop" for="hourly-subj-file" style="margin-top:var(--sp-3)">' +
          '<input type="file" id="hourly-subj-file" accept="application/pdf,.pdf,image/*" multiple data-on-change="HOURLY.onFile(this)">' +
          '<span class="ii"><i class="ph ph-file-pdf"></i></span>' +
          '<span class="dn">Choose photos or a PDF of your answer</span>' +
          '<span class="ds">All page photos at once, or one PDF · under 8 MB</span>' +
        '</label>' +
        '<button class="btn btn-solid btn-lg btn-blk" id="hourly-subj-submit" style="margin-top:var(--sp-3)"' +
          (this._pendingFile ? '' : ' disabled') +
          ' data-on-click="HOURLY.submitSubj()"><i class="ph ph-paper-plane-tilt"></i> Submit for review</button>' +
        '<button class="btn btn-quiet btn-blk mt2" data-on-click="HOURLY.abandonSubj()">Give up this hour\'s attempt</button>';
      this._tickSubj();
      return;
    }

    if (marksEl) marksEl.textContent = '—';
    const bank = await this._ensureBank();
    if (!bank.length){
      box.innerHTML =
        '<div class="empty" style="padding:var(--sp-6) 0">' +
          '<div class="empty-i"><i class="ph ph-cloud-slash"></i></div>' +
          '<p>Written bank not available</p>' +
          '<p>Connect to the internet once so this device can save the questions.</p>' +
          '<div class="bg" style="justify-content:center;margin-top:var(--sp-3)">' +
            '<button class="btn btn-a" data-on-click="HOURLY.render()"><i class="ph ph-arrow-clockwise"></i> Try again</button>' +
          '</div>' +
        '</div>';
      return;
    }
    const seed = this._hash('subj|' + this._hourKey() + '|' + this.level);
    const q = bank[seed % bank.length];
    this._pick = q;
    if (marksEl) marksEl.textContent = q.marks + ' marks';

    const chapName = this._chapterLabel(q.chapterId);
    box.innerHTML =
      '<div class="qotd-meta">' + esc(chapName) + (q.topic ? ' · ' + esc(q.topic) : '') + '</div>' +
      '<div class="qotd-q" style="margin-top:var(--sp-2)">' + esc(q.q) + '</div>' +
      '<div class="t-foot" style="text-align:center;margin-bottom:var(--sp-3)">' +
        'You get <b>' + Math.round(this.SUBJ_SECONDS/60) + ' minutes</b> from the moment you tap Start to write and upload. ' +
        'This question changes at <b>' + esc(this._nextHourLabel()) + '</b>.' +
      '</div>' +
      '<button class="btn btn-solid btn-lg btn-blk" data-on-click="HOURLY.startSubj()">' +
        '<i class="ph ph-play"></i> Start ' + q.marks + '-mark question' +
      '</button>' +
      '<p class="t-cap text-center" style="margin-top:var(--sp-2)">Written bank is the Loksewa L7 Civil set.</p>';
  },

  _chapterLabel(chId){
    try {
      const c = (window.SUBJECTIVE_CHAPTERS || []).find(x => x.id === chId);
      return c ? ((c.icon ? c.icon + ' ' : '') + c.name) : (chId || 'Written');
    } catch(e){ return chId || 'Written'; }
  },

  _tickSubj(){
    const st = this._getSubj();
    if (!st || st.submitted || !st.endsAt) return;
    const el = document.getElementById('hourly-subj-tmr');
    if (!el) return;
    const left = Math.max(0, Math.round((st.endsAt - Date.now()) / 1000));
    el.textContent = formatTime(left);
    el.classList.toggle('urgent', left < 120);
    const bar = document.getElementById('hourly-subj-bar');
    if (bar) bar.style.width = ((left / this.SUBJ_SECONDS) * 100) + '%';
    if (left <= 0) this.render();
  },

  startSubj(){
    const q = this._pick;
    if (!q){ toast('Still loading the written bank — try again in a moment.'); return; }
    this._setSubj({
      hourKey:    this._hourKey(),
      level:      this.level,
      questionId: q.id,
      chapter:    q.chapterId,
      topic:      q.topic,
      q:          q.q,
      marks:      q.marks,
      startedAt:  Date.now(),
      endsAt:     Date.now() + this.SUBJ_SECONDS * 1000,
      submitted:  false
    });
    this._pendingFile = null;
    toast('Write on paper, then upload. ' + Math.round(this.SUBJ_SECONDS/60) + ' minutes on the clock.', 4000);
    this.render();
  },

  async abandonSubj(){
    const ok = await ASK.confirm({
      title: 'Give up this hour?',
      body:  'Your in-progress attempt will be cleared. The next question is served at the top of the hour.',
      ok:    'Give up', danger: true
    });
    if (!ok) return;
    this._setSubj(null);
    this._pendingFile = null;
    this.render();
  },

  async onFile(input){
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (files.some(f => /^image\//i.test(f.type || ''))) toast('Preparing your PDF…', 2500);
    try {
      this._pendingFile = await this._prepareUpload(files);
      this.render();
    } catch(e){
      toast('❌ ' + (e.message || 'Could not read that file'));
      input.value = '';
    }
  },
  clearFile(){ this._pendingFile = null; this.render(); },

  async submitSubj(){
    const st = this._getSubj();
    if (!st || !this._pendingFile) return;

    const btn = document.getElementById('hourly-subj-submit');
    if (btn){ btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Uploading…'; }

    const user = (typeof S !== 'undefined' && S.user) || null;
    if (!user || !user.token){
      toast('Please sign in again.');
      if (btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for review'; }
      return;
    }

    if (typeof S !== 'undefined' && S && (!S.online || S.forcedOffline)){
      if (btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for review'; }
      toast('❌ You are offline. Reconnect to submit.', 5000);
      return;
    }

    try {
      /* submitSubjectiveAnswer is Supabase — _api handles the routing
         correctly (see subjective-api.js). */
      const res = await _api('submitSubjectiveAnswer', {
        kind: 'hourly',
        questionId: st.questionId + '_' + st.hourKey,
        questionText: String(st.q || '').slice(0, 2000),
        chapterId: st.chapter || 'hourly',
        marks: st.marks,
        solveSec: this.SUBJ_SECONDS,
        startedAt: st.startedAt,
        pdfData: this._pendingFile.dataUrl,
        filename: this._pendingFile.filename
      }, 'POST');
      if (!res || !res.success) throw new Error((res && res.error) || 'Submit failed.');
      st.submitted   = true;
      st.submittedAt = Date.now();
      this._setSubj(st);
      this._pendingFile = null;
      toast('✅ Submitted — admin will grade it.');
      this.render();
    } catch(e){
      toast('❌ ' + (e.message || 'Could not submit.'));
      if (btn){ btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit for review'; }
    }
  },

  // ── sprint ───────────────────────────────────────────────────────────
  async _renderObj(){
    const box = document.getElementById('hourly-obj-body');
    if (!box) return;
    const lv   = this.level;
    const key  = this._hourKey() + '|' + lv;
    const st   = this._getObj();
    const mine = (st && st.key === key) ? st : null;
    const lvLabel = this.LEVEL_NAME[lv];

    if (mine && mine.submitted){
      const pct = mine.pct || 0;
      const cls = pct >= 70 ? 'tg' : pct >= 50 ? 'ta' : 'tr';
      box.innerHTML =
        '<div class="t-foot" style="margin-bottom:var(--sp-2)">' + esc(lvLabel) + ' · 50 questions in 60 minutes</div>' +
        '<div class="flex center between g3" style="padding:var(--sp-3) 0;border-top:1px solid var(--sep);border-bottom:1px solid var(--sep)">' +
          '<div><div class="t-cap">Score</div>' +
            '<div class="mono" style="font-size:var(--fs-num-lg);font-weight:700;color:var(--ink)">' +
              (mine.correct || 0) + ' / ' + (mine.total || this.OBJ_COUNT) +
            '</div></div>' +
          '<span class="ctag ' + cls + '" style="font-size:var(--fs-t3);padding:.4rem .7rem">' + pct + '%</span>' +
        '</div>' +
        '<p class="t-cap text-center" style="margin-top:var(--sp-3)">Next sprint in ' + formatTime(Math.floor(this._msToNextHour() / 1000)) + '</p>';
      return;
    }

    if (mine && !mine.submitted){
      box.innerHTML =
        '<div class="banner banner-warning"><i class="ph ph-warning"></i>' +
          '<span>You started this hour\'s sprint but didn\'t finish it. The next hour brings a fresh set.</span>' +
        '</div>' +
        '<p class="t-cap text-center">Next sprint in ' + formatTime(Math.floor(this._msToNextHour() / 1000)) + '</p>';
      return;
    }

    box.innerHTML =
      '<div class="t-foot" style="margin-bottom:var(--sp-3)">' + esc(lvLabel) + ' · 50 questions in 60 minutes</div>' +
      '<div class="t-callout" style="margin-bottom:var(--sp-3)">A timed, graded run through the level you picked. One attempt per hour.</div>' +
      '<button class="btn btn-solid btn-lg btn-blk" data-on-click="HOURLY.startObj()">' +
        '<i class="ph ph-play-circle"></i> Start the 50-question sprint' +
      '</button>' +
      '<p class="t-cap text-center" style="margin-top:var(--sp-2)">Level: ' + esc(lvLabel) + ' · refreshes at ' + esc(this._nextHourLabel()) + '</p>';
  },

  async startObj(){
    const lv = this.level;
    const refs = (typeof ChapterData !== 'undefined' ? ChapterData.allFileRefs() : []).filter(r => r.lv === lv);
    if (!refs.length){ toast('No chapters for this level yet.'); return; }

    let canNet = false;
    try {
      canNet = !!(typeof S !== 'undefined' && S.online && !S.forcedOffline);
      if (!canNet && typeof navigator !== 'undefined') {
        canNet = !!navigator.onLine && !(typeof S !== 'undefined' && S.forcedOffline);
      }
    } catch(e){}

    QUIZ._showLoader('Building this hour\'s sprint…');

    const errors  = [];
    const all     = [];
    const seen    = new Set();
    let cacheHits = 0, netHits = 0, tried = 0;

    try {
      const seed  = this._hash('obj|' + this._hourKey() + '|' + lv);
      const order = this._shuffle(refs, seed);
      const MAX_FILES = Math.min(order.length, 25);

      for (let i = 0; i < MAX_FILES && all.length < 240; i++){
        const ref = order[i];
        tried++;
        const msgEl = document.getElementById('quiz-loader-msg');
        if (msgEl) msgEl.textContent = 'Loading sets (' + tried + '/' + MAX_FILES + ')…';

        let raw = null;
        try {
          if (typeof QDB !== 'undefined' && ref.key){
            const c = await QDB.get(ref.key);
            const valid = c && !(typeof c === 'object' && !Array.isArray(c) && c.success === false);
            if (valid){ raw = c; cacheHits++; }
          }
        } catch(e){}

        if (!raw && canNet){
          try {
            raw = await QUIZ._fetch(ref.fid, ref.key);
            netHits++;
          } catch(err){
            errors.push((ref.subtopic || ref.fid) + ': ' + ((err && err.message) || 'unknown error'));
            continue;
          }
        }

        if (!raw){
          errors.push((ref.subtopic || ref.fid) + ': not saved on this device');
          continue;
        }

        const qs = normQ(raw, ref.fid);
        if (!qs.length){
          errors.push((ref.subtopic || ref.fid) + ': file had no valid questions');
          continue;
        }
        for (const q of qs){
          if (q && q.uid && !seen.has(q.uid)){ seen.add(q.uid); all.push(q); }
        }
      }

      QUIZ._hideLoader();

      if (!all.length){
        let head;
        if (!canNet && !cacheHits){
          head = 'You are offline and none of this level\'s sets are saved on this device yet. Open Chapters once while online to download them.';
        } else if (!canNet){
          head = 'You are offline and nothing usable was in the local cache for this level.';
        } else if (cacheHits > 0){
          head = 'The sets on this device had no valid questions in them.';
        } else {
          head = 'No questions could be loaded from the server for this level.';
        }
        const detail = errors.length ? ' ' + errors.slice(0, 2).join(' · ') : '';
        console.warn('[HOURLY] sprint load failed', {
          level: lv, canNet, cacheHits, netHits, tried, errors
        });
        toast('❌ ' + head + detail, 8000);
        return;
      }

      if (all.length < this.OBJ_COUNT){
        console.info('[HOURLY] sprint has ' + all.length + ' questions (wanted ' + this.OBJ_COUNT + ')');
      }

      const picked = this._shuffle(all, seed ^ 0x9E3779B9).slice(0, Math.min(this.OBJ_COUNT, all.length));
      if (!picked.length){
        toast('Not enough questions at this level for a sprint.');
        return;
      }
      if (picked.length < this.OBJ_COUNT){
        toast('Running a ' + picked.length + '-question sprint — the full 50 aren\'t available at this level.', 5000);
      }

      this._setObj({
        key:       this._hourKey() + '|' + lv,
        level:     lv,
        startedAt: Date.now(),
        submitted: false
      });

      try {
        QUIZ._doStart(picked, 'exam', '⏱ Hourly sprint · ' + this.LEVEL_NAME[lv], false, {
          hourlySprint: true,
          timeLimitSec: this.OBJ_SECONDS,
          hourlyLevel:  lv
        });
      } catch(startErr){
        this._setObj(null);
        throw startErr;
      }

      const pill = document.getElementById('ex-mode-pill');
      if (pill) pill.textContent = 'Sprint · 60 min';
    } catch(e){
      QUIZ._hideLoader();
      console.error('[HOURLY] sprint start threw', e);
      toast(e && e.message ? e.message : 'Could not start the sprint.');
    }
  },

  _recordObjResult(correct, total, pct){
    const lv  = this.level;
    const key = this._hourKey() + '|' + lv;
    const st  = this._getObj();
    if (!st || st.key !== key) return;
    st.submitted   = true;
    st.submittedAt = Date.now();
    st.correct     = correct;
    st.total       = total;
    st.pct         = pct;
    this._setObj(st);
    if (typeof UI !== 'undefined' && UI.cur === 'hourly') this.render();
    else this._refreshBadge();
  },

  // ── PDF prep ─────────────────────────────────────────────────────────
  _readAsDataUrl(file){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = () => res(r.result);
      r.onerror = () => rej(new Error('Could not read that file.'));
      r.readAsDataURL(file);
    });
  },
  _imageToJpeg(file, maxSide, quality){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth, h = img.naturalHeight;
        const sc = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => b
          ? b.arrayBuffer().then(buf => resolve({ bytes: new Uint8Array(buf), w, h }))
          : reject(new Error('Could not process a photo.')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('One photo could not be opened.')); };
      img.src = url;
    });
  },
  _loadPdfLib(){
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/pdf-lib/pdf-lib.min.js';
      s.onload  = () => window.PDFLib ? res(window.PDFLib) : rej(new Error('PDF tools did not load.'));
      s.onerror = () => rej(new Error('Could not load the PDF tools.'));
      document.head.appendChild(s);
    });
  },
  async _prepareUpload(files){
    const isPdf = f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name);
    const isImg = f => /^image\//i.test(f.type || '');
    if (files.length === 1 && isPdf(files[0])){
      const f = files[0];
      if (f.size > 8 * 1024 * 1024) throw new Error('PDF too large (max 8 MB).');
      return { dataUrl: await this._readAsDataUrl(f), filename: f.name, size: f.size };
    }
    if (!files.every(isImg)) throw new Error('Choose one PDF, or one or more photos.');
    if (files.length > 20)   throw new Error('Up to 20 photos at a time.');
    const lib = await this._loadPdfLib();
    const doc = await lib.PDFDocument.create();
    for (const f of files){
      const j   = await this._imageToJpeg(f, 1800, 0.78);
      const emb = await doc.embedJpg(j.bytes);
      const p   = doc.addPage([j.w, j.h]);
      p.drawImage(emb, { x: 0, y: 0, width: j.w, height: j.h });
    }
    const out = await doc.save();
    if (out.length > 8 * 1024 * 1024) throw new Error('Those photos are too large together.');
    let bin = '';
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return { dataUrl: 'data:application/pdf;base64,' + btoa(bin), filename: 'hourly-' + Date.now() + '.pdf', size: out.length };
  },

  // ── diagnostics / escape hatches ────────────────────────────────────
  async diagnose(){
    const lv = this.level;
    let online = false, forced = false, hasUser = false, hasToken = false, user;
    try {
      online = !!S.online; forced = !!S.forcedOffline;
      user = (S && S.user) || null;
      hasUser  = !!(user && user.username);
      hasToken = !!(user && user.token);
    } catch(e){}

    const refs = (typeof ChapterData !== 'undefined' ? ChapterData.allFileRefs() : []).filter(r => r.lv === lv);

    console.log('── HOURLY diagnose ──');
    console.log('level             :', lv);
    console.log('S.online          :', online);
    console.log('S.forcedOffline   :', forced);
    console.log('navigator.onLine  :', (typeof navigator !== 'undefined' ? navigator.onLine : '?'));
    console.log('user / token      :', hasUser, '/', hasToken);
    console.log('refs for level    :', refs.length);
    if (!refs.length){ console.warn('No refs found for this level.'); return; }

    let keys = new Set();
    try { if (typeof QDB !== 'undefined') keys = new Set(await QDB.keys()); } catch(e){}
    console.log('QDB cached keys   :', keys.size);

    const canNet = online && !forced;
    for (let i = 0; i < Math.min(5, refs.length); i++){
      const ref = refs[i];
      const cached = keys.has(ref.key);
      console.log(`  [${i+1}] key=${ref.key}  fid=${String(ref.fid).slice(0,12)}…  cached=${cached}`);
      if (cached){
        try {
          const c = await QDB.get(ref.key);
          const n = normQ(c, ref.fid).length;
          console.log(`       → ${n} questions in cache`);
        } catch(e){ console.warn('       → cache read failed', e); }
      } else if (canNet){
        try {
          const raw = await QUIZ._fetch(ref.fid, ref.key);
          console.log(`       → network fetch OK, ${normQ(raw, ref.fid).length} questions`);
        } catch(e){
          console.warn('       → network fetch FAILED —', e && e.message);
        }
      } else {
        console.log('       → skipped (offline + not cached)');
      }
    }
    console.log('── end diagnose ──');
    console.log('Tip: run HOURLY.resetHour() if you got stuck mid-attempt.');
  },

  resetHour(){
    this._setObj(null);
    this._setSubj(null);
    this._pendingFile = null;
    this._pick = null;
    try { toast('This hour\'s hourly state has been cleared.'); } catch(e){}
    try { if (typeof UI !== 'undefined' && UI.cur === 'hourly') this.render(); } catch(e){}
  },

  // ── badge + hint ─────────────────────────────────────────────────────
  _refreshBadge(){
    const b = document.getElementById('hourly-badge');
    const h = document.getElementById('hourly-hint');
    const lv = this.level;
    const objSt   = this._getObj();
    const subSt   = this._getSubj();
    const objDone = !!(objSt && objSt.key === (this._hourKey() + '|' + lv) && objSt.submitted);
    const subjDone = !!(subSt && subSt.submitted);
    if (b) b.hidden = objDone && subjDone;
    if (h){
      if (subSt && !subSt.submitted)        h.textContent = 'Written in progress';
      else if (!subjDone && !objDone)       h.textContent = 'New this hour';
      else if (subjDone && objDone)         h.textContent = 'Both done';
      else if (subjDone)                    h.textContent = 'Written done · sprint open';
      else                                  h.textContent = 'Sprint done · written open';
    }
  }
};

setTimeout(() => { try { HOURLY._refreshBadge(); } catch(e){} }, 1500);
setInterval(() => { try { HOURLY._refreshBadge(); } catch(e){} }, 5000);