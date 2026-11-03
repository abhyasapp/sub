// js/features/review.js — bookmarks, flags, wrong bank, spaced repetition.

const REV = {
  _filters: { bk: '', fl: '', wr: '' },
  _FILTERS_KEY: 'abhyas_rev_filters',

  _loadFilters() {
    try {
      const raw = sessionStorage.getItem(this._FILTERS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return;
      ['bk', 'fl', 'wr'].forEach(k => { if (typeof o[k] === 'string') this._filters[k] = o[k]; });
    } catch (e) {}
  },
  _saveFilters() {
    try { sessionStorage.setItem(this._FILTERS_KEY, JSON.stringify(this._filters)); } catch (e) {}
  },

  filterList(kind, term) {
    this._filters[kind] = String(term || '').toLowerCase().trim();
    this._saveFilters();
    this._limit[kind] = this.PAGE;                         // a new search starts from the first page
    clearTimeout(this._ft);                                // re-draw once typing pauses, not on every key
    this._ft = setTimeout(() => {
      if (kind === 'wr' && typeof WRONGBY !== 'undefined' && WRONGBY.render) WRONGBY.render();
      else this.renderList(kind);
    }, 180);
  },
  _matches(q, term) {
    if (!term) return true;
    if (!q) return false;
    return (String(q.q || '').toLowerCase().indexOf(term) !== -1) ||
           (Array.isArray(q.options) && q.options.some(o => String(o).toLowerCase().indexOf(term) !== -1)) ||
           (String(q.explanation || '').toLowerCase().indexOf(term) !== -1) ||
           (String(q.tag || '').toLowerCase().indexOf(term) !== -1);
  },
  _store(kind) { 
    const arr = kind === 'bk' ? S.bk : kind === 'fl' ? S.fl : S.wr;
    return Array.isArray(arr) ? arr : [];
  },
  _lsKey(kind) { return kind === 'bk' ? LS.BK : kind === 'fl' ? LS.FL : LS.WR; },
  _listEl(kind) { return kind === 'bk' ? 'bk-list' : kind === 'fl' ? 'fl-list' : 'wr-list'; },

  _stripHeavy(q) {
    if (!q || !q.img) return q;
    const { img, imgCaption, ...rest } = q;
    return rest;
  },

  toggle(kind, question) {
    if (!question || !question.uid) return false;
    const arr = REV._store(kind);
    const i = arr.findIndex(x => x && x.uid === question.uid);
    if (i > -1) {
      arr.splice(i, 1);
      toast(kind === 'bk' ? '⭐ Removed bookmark' : '🚩 Removed flag');
    } else {
      arr.push(kind === 'bk' ? { ...REV._stripHeavy(question), tag: '' } : REV._stripHeavy(question));
      toast(kind === 'bk' ? '⭐ Bookmarked' : '🚩 Flagged');
    }
    _save(REV._lsKey(kind), arr);
    if (typeof HOME !== 'undefined') HOME.updateBadges();
    return i === -1;
  },
  
  has(kind, uid) { return REV._store(kind).some(x => x && x.uid === uid); },
  getTag(uid) { 
    const item = REV._store('bk').find(x => x && x.uid === uid);
    return item ? (item.tag || '') : ''; 
  },
  
  setTag(uid, tag, questionObj) {
    if (!uid) return;
    let item = REV._store('bk').find(x => x && x.uid === uid);
    if (!item && questionObj) { 
      item = { ...REV._stripHeavy(questionObj), tag: '' }; 
      S.bk.push(item); 
    }
    if (!item) return;
    item.tag = tag;
    _save(LS.BK, S.bk);
    REV.renderList('bk');
    if (typeof HOME !== 'undefined') HOME.updateBadges?.();
  },

  addWrong(question) {
    if (!question || !question.uid) return;
    const existing = REV._store('wr').find(x => x && x.uid === question.uid);
    if (existing) {
      existing._streak = 0;
      existing._nextDue = Date.now();
      _save(LS.WR, S.wr);
      if (typeof HOME !== 'undefined') HOME.updateBadges();
      return;
    }
    S.wr.push({ ...REV._stripHeavy(question), _streak: 0, _nextDue: Date.now(), _addedAt: Date.now() });
    _save(LS.WR, S.wr);
    if (typeof HOME !== 'undefined') HOME.updateBadges();
  },
  
  removeWrong(uid) {
    if (!uid) return;
    const i = S.wr.findIndex(x => x && x.uid === uid);
    if (i > -1) {
      S.wr.splice(i, 1);
      _save(LS.WR, S.wr);
      if (typeof HOME !== 'undefined') HOME.updateBadges();
      if (typeof PROGRESS_RESET !== 'undefined') PROGRESS_RESET.noteRemoved(uid);
    }
  },

  MASTERED_KEY: 'abhyas_wr_mastered',
  _masteredLoad() {
    try { const v = JSON.parse(localStorage.getItem(REV.MASTERED_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  },
  _masteredSave(list) {
    try { localStorage.setItem(REV.MASTERED_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  },
  
  graduate(uid) {
    if (!uid) return false;
    const i = S.wr.findIndex(x => x && x.uid === uid);
    if (i < 0) return false;
    const item = S.wr[i];
    const list = REV._masteredLoad();
    list.unshift({ ...item, _masteredAt: Date.now() });
    if (!REV._masteredSave(list)) {
      toast('Storage is full, so this question stays in your wrong bank. Free up space in Data.');
      return false;
    }
    S.wr.splice(i, 1);
    _save(LS.WR, S.wr);
    if (typeof HOME !== 'undefined') HOME.updateBadges();
    if (typeof PROGRESS_RESET !== 'undefined') PROGRESS_RESET.noteRemoved(uid);
    REV._updateMasteredBtn();
    if (typeof toastUndo === 'function') {
      toastUndo('Mastered: moved out of your wrong bank', () => REV._restoreOne(uid));
    }
    return true;
  },
  
  _restoreOne(uid) {
    if (!uid) return false;
    const list = REV._masteredLoad();
    const j = list.findIndex(x => x && x.uid === uid);
    if (j < 0) return false;
    const item = list[j];
    if (!S.wr.some(x => x && x.uid === uid)) {
      const back = { ...item, _streak: 0, _nextDue: Date.now(), _addedAt: Date.now() };
      delete back._masteredAt;
      S.wr.push(back);
      _save(LS.WR, S.wr);
    }
    list.splice(j, 1);
    REV._masteredSave(list);
    if (typeof HOME !== 'undefined') HOME.updateBadges();
    REV._updateMasteredBtn();
    if (typeof REV.renderList === 'function') REV.renderList('wr');
    if (typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
    return true;
  },
  
  restoreMastered() {
    const uids = REV._masteredLoad().map(x => x && x.uid).filter(Boolean);
    if (!uids.length) { toast('No mastered questions yet'); return; }
    let n = 0;
    uids.forEach(u => { if (REV._restoreOne(u)) n++; });
    toast('Brought back ' + n + ' mastered question' + (n === 1 ? '' : 's') + ' for revision');
  },
  
  _updateMasteredBtn() {
    const b = document.getElementById('wr-mastered-btn');
    if (!b) return;
    const n = REV._masteredLoad().length;
    b.hidden = n === 0;
    b.textContent = 'Bring back mastered (' + n + ')';
  },
  
  trackAnswer(question, isCorrect) {
    if (!question || !question.uid) return;
    if (isCorrect) {
      const item = S.wr.find(x => x && x.uid === question.uid);
      if (!item) return;
      if (item._nextDue && item._nextDue > Date.now()) return;
      const prev = item._streak || 0;
      if (prev >= SR_INTERVALS.length) { REV.graduate(question.uid); return; }
      item._streak = prev + 1;
      item._nextDue = Date.now() + SR_INTERVALS[prev] * 24 * 60 * 60 * 1000;
      _save(LS.WR, S.wr);
      if (typeof HOME !== 'undefined') HOME.updateBadges?.();
    } else {
      REV.addWrong(question);
    }
  },
  
  dueWrong() {
    return REV._store('wr').filter(x => x && !x._withdrawn && ((x._nextDue == null) || x._nextDue <= Date.now()));
  },
  
  dueCount() { return REV.dueWrong().length; },

  /* Long lists are drawn PAGE cards at a time. Drawing 1,500 wrong answers at once
     meant ~39,000 DOM nodes and a multi-second freeze on a mid-range phone. */
  PAGE: 40,
  _limit: { bk: 40, fl: 40, wr: 40 },
  _moreHtml(kind, total, shown) {
    if (shown >= total) return total > REV.PAGE ? '<p class="t-foot" style="text-align:center;margin:var(--sp-3) 0">All ' + total + ' shown</p>' : '';
    const left = total - shown;
    return '<button class="btn btn-quiet btn-blk" type="button" data-rev-more="' + kind + '" data-on-click="REV.more(\'' + kind + '\')">Show ' + Math.min(REV.PAGE, left) + ' more <span class="t-foot">(' + shown + ' of ' + total + ' shown)</span></button>';
  },
  more(kind) {
    const el = document.getElementById(REV._listEl(kind)); if (!el) return;
    let arr = REV._store(kind);
    const filter = REV._filters[kind] || '';
    if (filter) arr = arr.filter(q => REV._matches(q, filter));
    if (kind === 'wr') arr = [...arr].sort((a, b) => (a._nextDue ?? 0) - (b._nextDue ?? 0));
    const from = el.querySelectorAll('.qcard').length;
    const to = Math.min(arr.length, from + REV.PAGE);
    REV._limit[kind] = to;
    const old = el.querySelector('[data-rev-more]'); const note = el.querySelector(':scope > .t-foot'); if (old) old.remove(); if (note) note.remove();
    const chunk = document.createElement('div'); chunk.className = 'rev-chunk';
    chunk.innerHTML = arr.slice(from, to).map((q, j) => REV._cardHtml(kind, q, from + j)).join('');
    el.appendChild(chunk);
    el.insertAdjacentHTML('beforeend', REV._moreHtml(kind, arr.length, to));
    renderMath(chunk);                       // only the new cards, not the whole list
    const nb = el.querySelector('.rev-chunk:last-of-type .qcard'); if (nb && nb.focus) { nb.setAttribute('tabindex', '-1'); nb.focus({ preventScroll: true }); }
  },
  _cardHtml(kind, q, i) {
          if (!q) return '';
          const opts = (Array.isArray(q.options) ? q.options : []).map((o, j) => {
            const c = String(j) === String(q.correct) || j === Number(q.correct);
            return `<div class="eo${c ? ' shc' : ''}">${String.fromCharCode(65 + j)}) ${esc(o)}</div>`;
          }).join('');
          
          const uidJson = JSON.stringify(String(q.uid || ''));
          const kindJson = JSON.stringify(kind);
          
          const tagPicker = kind === 'bk' ? `
            <select class="sel-c" style="margin-top:.4rem;font-size:.7rem;padding:.25rem .4rem;width:auto" data-on-change='REV.setTag(${uidJson}, this.value)'>
              <option value="">🏷 No tag</option>
              ${BK_TAGS.map(t => `<option value="${t}" ${q.tag === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>` : '';
          
          const reasonPicker = kind === 'wr' ? (() => {
            const r = q._reason || (q._misconception ? 'careless' : '');
            return `<select class="sel-c" style="margin-top:.4rem;font-size:.7rem;padding:.25rem .4rem;width:auto" data-on-change='WRONGBY.setReason(${uidJson}, this.value)'>
              <option value="">Why did I miss this?</option>
              <option value="careless" ${r === 'careless' ? 'selected' : ''}>Careless</option>
              <option value="concept"  ${r === 'concept'  ? 'selected' : ''}>Concept gap</option>
            </select>`;
          })() : '';
          
          const notePicker = kind === 'wr' ? (() => {
            const n = (typeof QNOTE !== 'undefined') ? QNOTE.get(q.uid) : String(q._note || '');
            return `<div style="margin-top:.4rem">` +
              `<input class="input" type="text" maxlength="500" ` +
              `placeholder="Your note on this question (optional)" ` +
              `value="${escAttrJs(n)}" ` +
              `data-on-change='WRONGBY.setNote(${uidJson}, this.value)' ` +
              `style="font-size:var(--fs-foot)">` +
            `</div>`;
          })() : '';
          
          let missBadge = '';
          if (kind === 'wr' && typeof WRONGBY !== 'undefined') {
            const mc = WRONGBY.missCount(q.uid);
            if (mc >= 3) missBadge = `<span class="ctag tr" style="margin-left:.3rem" title="You have missed this question ${mc} times"><i class="ph ph-warning"></i> missed ${mc}\u00d7</span>`;
          }
          
          let srBadge = '';
          if (kind === 'wr') {
            const isDue = (q._nextDue == null) || q._nextDue <= Date.now();
            const streak = q._streak || 0;
            if (isDue) srBadge = `<span class="ctag tr" style="margin-left:.3rem"><i class="ph ph-repeat"></i> Due now</span>`;
            else {
              const daysLeft = Math.ceil((q._nextDue - Date.now()) / (24 * 60 * 60 * 1000));
              srBadge = `<span class="ctag ta" style="margin-left:.3rem">⏳ Due in ${daysLeft}d</span>`;
            }
            if (streak > 0) srBadge += `<span class="ctag tg" style="margin-left:.3rem"><i class="ph ph-check"></i>×${streak}</span>`;
          }
          
          return `<div class="qcard" style="margin-bottom:.5rem">
            <div class="qm"><span class="qn mono">#${i + 1}</span>
              ${q.tag ? `<span class="ctag ta" style="margin-left:.3rem"><i class="ph ph-tag"></i> ${esc(q.tag)}</span>` : ''}
              ${srBadge}
              ${missBadge}
              ${q._withdrawn ? `<span class="ctag tr" style="margin-left:.3rem" title="This question was removed from the question bank"><i class="ph ph-prohibit"></i> Withdrawn</span>` : ''}
              ${(q._corrected && Date.now() - q._corrected < 14 * 24 * 60 * 60 * 1000) ? `<span class="ctag tg" style="margin-left:.3rem" title="Your teacher corrected this question"><i class="ph ph-check-circle"></i> Corrected</span>` : ''}
              ${qReportHtml(q, `USER_REPORT.reportList(${kindJson},${uidJson})`)}
              ${qSearchHtml(q)}
              <button class="ib" data-on-click='REV._removeOne(${kindJson},${uidJson})' title="Remove from review" aria-label="Remove from review"><i class="ph ph-trash"></i></button>
            </div>
            <div class="qt" style="font-size:.82rem">${esc(q.q)}</div>
            ${qImgHtml(q)}
            <div style="margin-top:.3rem">${opts}</div>
            ${q.explanation ? `<div class="expl show" style="margin-top:.45rem">${esc(q.explanation)}</div>` : ''}
            ${tagPicker}
            ${reasonPicker}
            ${notePicker}
          </div>`;
  },

  renderList(kind) {
    let arr = REV._store(kind);
    REV._loadFilters();
    
    const _inputId = kind === 'bk' ? 'bk-search' : kind === 'fl' ? 'fl-search' : 'wr-search';
    const _input = document.getElementById(_inputId);
    if (_input && _input.value !== REV._filters[kind]) _input.value = REV._filters[kind];
    
    const filter = this._filters[kind] || '';
    if (filter) arr = arr.filter(q => this._matches(q, filter));
    if (kind === 'wr') REV._updateMasteredBtn();
    
    const el = document.getElementById(REV._listEl(kind));
    if (!el) return;
    
    if (!arr.length) {
      const copy = kind === 'bk'
        ? { i: '<i class="ph ph-star"></i>', t: 'No bookmarks yet', s: 'Tap the star on any question while studying to save it here.' }
        : kind === 'fl'
        ? { i: '<i class="ph ph-flag"></i>', t: 'No flagged questions yet', s: 'Tap the flag on a question you want to come back to.' }
        : { i: '<i class="ph ph-x-circle"></i>', t: 'No wrong answers yet', s: 'Questions you miss land here automatically, ready for spaced review.' };
      
      el.innerHTML = `<div class="empty">
        <div class="empty-i">${copy.i}</div>
        <p>${copy.t}</p>
        <p style="font-size:.72rem;color:var(--t3);margin-top:.15rem">${copy.s}</p>
      </div>`;
      return;
    }

    if (kind === 'wr') arr = [...arr].sort((a, b) => (a._nextDue ?? 0) - (b._nextDue ?? 0));
    
    requestAnimationFrame(() => {
      try {
        const total = arr.length;
        const lim = Math.max(REV.PAGE, (REV._limit[kind] || REV.PAGE));
        el.innerHTML = '<div class="rev-chunk">' + arr.slice(0, lim).map((q, i) => REV._cardHtml(kind, q, i)).join('') + '</div>' + REV._moreHtml(kind, total, lim);
        renderMath(el);
      } catch (err) {
        console.error('[REV.renderList] failed to render list:', err);
      }
    });
  },

  _removeOne(kind, uid) {
    if (!uid) return;
    const arr = REV._store(kind);
    const i = arr.findIndex(x => x && x.uid === uid);
    if (i > -1) {
      const item = arr[i];
      arr.splice(i, 1);
      _save(REV._lsKey(kind), arr);
      REV.renderList(kind);
      if (typeof HOME !== 'undefined') HOME.updateBadges();
      if (kind === 'wr' && typeof PROGRESS_RESET !== 'undefined') {
        PROGRESS_RESET.noteRemoved(uid);
        toastUndo('Removed from wrong bank', () => {
          if (S.wr.some(x => x && x.uid === uid)) return;
          S.wr.push({ ...item, _addedAt: Date.now() });
          _save(LS.WR, S.wr);
          REV.renderList('wr');
          if (typeof HOME !== 'undefined') HOME.updateBadges();
          if (typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
        });
      }
    }
  },

  clearAll(kind) {
    const prev = JSON.parse(JSON.stringify(REV._store(kind)));
    if (kind === 'bk') { S.bk = []; _save(LS.BK, []); }
    else if (kind === 'fl') { S.fl = []; _save(LS.FL, []); }
    else { S.wr = []; _save(LS.WR, []); }
    const clearedAt = (kind === 'wr' && typeof PROGRESS_RESET !== 'undefined') ? PROGRESS_RESET.noteWrongCleared() : 0;
    REV.renderList(kind);
    if (typeof HOME !== 'undefined') HOME.updateBadges();
    toastUndo('🗑 List cleared', () => {
      if (kind === 'bk') { S.bk = prev; _save(LS.BK, prev); }
      else if (kind === 'fl') { S.fl = prev; _save(LS.FL, prev); }
      else {
        S.wr = prev; _save(LS.WR, prev);
        if (clearedAt) PROGRESS_RESET.lift([clearedAt]);
        if (typeof PSYNC !== 'undefined') PSYNC.scheduleSync();
      }
      REV.renderList(kind);
      if (typeof HOME !== 'undefined') HOME.updateBadges();
      toast('↩️ Restored');
    });
  },

  start(kind, mode, dueOnly) {
    let arr = [...REV._store(kind)].filter(x => x && !x._withdrawn);
    if (kind === 'wr' && dueOnly) arr = REV.dueWrong();
    if (!arr.length) { toast(dueOnly ? 'Nothing due for review right now 🎉' : 'Nothing to study here yet'); return; }
    QUIZ.startWith(shuf(arr), mode, kind === 'bk' ? '⭐ Bookmarks' : kind === 'fl' ? '🚩 Flagged' : (dueOnly ? '🔁 Wrong Bank (Due Today)' : '❌ Wrong Bank'),
      { sessionKind: 'review' });
  }
};

window.REV = REV;