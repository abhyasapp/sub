// js/admin/features/settings.js — Settings screen + Loksewa scheme editor.
// MUST load AFTER: core.js (ADMIN, $, $$, esc, escAttrJs, TOAST, CONFIRM),
// core/loksewa.js (normalizeLoksewaScheme, loksewaSchemeConflict).
// Uses ChapterData at call time only.

const LKS_ADMIN = {
  rows: [],

  _catalog(){
    const levels = new Map();
    try {
      ChapterData.allFileRefs().forEach(r => {
        if (!levels.has(r.lv)) levels.set(r.lv, { id: r.lv, label: ChapterData.levelLabel(r.lv), chapters: new Map() });
        const L = levels.get(r.lv);
        if (!L.chapters.has(r.ch)) L.chapters.set(r.ch, ChapterData.chapterName(r.lv, r.ch) || r.ch);
      });
    } catch(e){}
    return levels;
  },

  load(stored){
    const sch = normalizeLoksewaScheme(stored || '');
    this.rows = sch.groups.map(g => ({ name: g.name, marks: g.marks, level: g.level, chapters: g.chapters.slice() }));
    this.render();
  },

  _sync(){
    document.querySelectorAll('#lks-rows .lks-row').forEach((el, i) => {
      const r = this.rows[i]; if (!r) return;
      r.name = el.querySelector('.lks-name').value;
      r.marks = el.querySelector('.lks-marks').value;
      r.level = el.querySelector('.lks-level').value;
      r.chapters = [...el.querySelectorAll('.lks-ch:checked')].map(c => c.value);
    });
  },

  render(){
    const box = $('lks-rows'); if (!box) return;
    const cat = this._catalog();
    const levelOpts = sel => [...cat.values()].map(L => '<option value="' + esc(L.id) + '"' + (sel === L.id ? ' selected' : '') + '>' + esc(L.label) + '</option>').join('') +
      (cat.has(sel) || !sel ? '' : '<option value="' + esc(sel) + '" selected>' + esc(sel) + ' (not in the chapter list)</option>');
    box.innerHTML = this.rows.map((r, i) => {
      const L = cat.get(r.level);
      const chapters = L ? [...L.chapters.entries()] : [];
      return '<div class="lks-row" style="border:1px solid var(--sep);border-radius:var(--r-card);padding:var(--sp-3);margin-bottom:var(--sp-2)">' +
        '<div class="field-row">' +
          '<div class="field"><label for="lks-n' + i + '">Group name</label><input class="input lks-name" id="lks-n' + i + '" type="text" maxlength="60" value="' + esc(r.name) + '" placeholder="Structural Engineering" data-on-input="LKS_ADMIN._changed()"></div>' +
          '<div class="field"><label for="lks-m' + i + '">Marks</label><input class="input lks-marks" id="lks-m' + i + '" type="number" min="1" max="100" inputmode="numeric" value="' + esc(r.marks) + '" data-on-input="LKS_ADMIN._changed()"></div>' +
        '</div>' +
        '<div class="field"><label for="lks-l' + i + '">Level</label><select class="select lks-level" id="lks-l' + i + '" data-on-change="LKS_ADMIN._levelChanged(' + i + ')">' + levelOpts(r.level) + '</select></div>' +
        '<details' + (r.chapters.length ? ' open' : '') + '><summary class="t-callout" style="cursor:pointer">' +
          (r.chapters.length ? r.chapters.length + ' chapter' + (r.chapters.length === 1 ? '' : 's') + ' selected' : 'All chapters of this level') + '</summary>' +
          '<div class="t-foot mt2 mb2">Tick chapters to limit this group to them. Leave all unticked to use every chapter of the level.</div>' +
          '<div style="display:grid;gap:6px">' + (chapters.length ? chapters.map(([id, name]) =>
            '<label class="perm-row"><input type="checkbox" class="lks-ch" value="' + esc(id) + '"' + (r.chapters.indexOf(id) !== -1 ? ' checked' : '') + ' data-on-change="LKS_ADMIN._changed()"><span>' + esc(name) + '</span></label>').join('')
            : '<span class="t-foot">No chapters are loaded for this level.</span>') + '</div>' +
        '</details>' +
        (this.rows.length > 1 ? '<div class="mt2"><button class="btn btn-quiet btn-sm" data-on-click="LKS_ADMIN.removeRow(' + i + ')"><i class="ph ph-trash"></i> Remove this group</button></div>' : '') +
      '</div>';
    }).join('');
    this._changed();
  },

  _changed(){
    this._sync();
    const total = this.rows.reduce((n, r) => n + (Math.round(Number(r.marks)) || 0), 0);
    const t = $('lks-total'); if (t) t.textContent = 'Total: ' + total + ' marks';
  },
  _levelChanged(i){ this._sync(); this.rows[i].chapters = []; this.render(); },
  addRow(){ this._sync(); const cat = this._catalog(); this.rows.push({ name: '', marks: 10, level: (cat.keys().next().value) || 'level7', chapters: [] }); this.render(); },
  removeRow(i){ this._sync(); this.rows.splice(i, 1); this.render(); },

  problem(){ this._sync(); return loksewaSchemeConflict(this.rows); },

  async save(){
    const bad = this.problem();
    if (bad) return TOAST.show(bad, 'warning', 5000);
    const scheme = { version: 1, groups: this.rows.map(r => ({ name: String(r.name).trim(), marks: Math.round(Number(r.marks)), level: r.level, chapters: r.chapters })) };
    await this._store(JSON.stringify(scheme), 'Mark scheme saved. Students get it the next time they open the app online.');
  },
  async useDefault(){
    const ok = await CONFIRM.ask({ title: 'Go back to the default?', body: 'The daily paper returns to the built-in split: 25 General Knowledge + the 50 Level 7 marks by topic (Engineering Survey 7, Construction Materials 6, Geotechnical 6, Construction Management 6, Structural Analysis 5, Concrete Technology 5, Estimating and Costing 5, Engineering Drawing 4, Engineering Economics 3, Professional Practices 3).', confirmText: 'Use the default' });
    if (!ok) return;
    await this._store('', 'Back to the default scheme.');
    this.load('');
  },
  async _store(value, message){
    const btn = $('lks-save'); if (btn) btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateSettings', { key: 'loksewaScheme', value });
      if (!res.success) throw new Error(res.error || 'Could not save.');
      ADMIN.data.settings = Object.assign({}, ADMIN.data.settings || {}, { loksewaScheme: value });
      TOAST.show(message, 'success', 4500);
    } catch(e){ TOAST.show(e.message, 'error', 6000); }
    if (btn) btn.classList.remove('loading');
  }
};

const SETTINGS = {
  load(){
  const s = ADMIN.data.settings || {};
  setVal('set-name',     s.appName);
  setVal('set-qr',       s.qrCodeUrl);
  setVal('set-phone',    s.contactPhone);
  setVal('set-amount',   s.paymentAmount);
  setVal('set-inst',     s.paymentInstructions);
  setVal('set-announce', s.announcement);
  setVal('set-eta',      s.paymentEta);
  setVal('set-trial',    s.trialHours);
  try { LKS_ADMIN.load(s.loksewaScheme); } catch(e){}
  const preview = $('set-qr-preview'), status = $('set-qr-status');
  if (!preview || !status) return;
  if (s.qrCodeUrl) {
    preview.src = s.qrCodeUrl; preview.hidden = false;
    status.textContent = s.qrCodeUrl.startsWith('data:image')
      ? 'A QR image is saved'
      : 'Currently an external link — students may not see it. Upload the image instead.';
  } else { preview.hidden = true; status.textContent = 'No QR uploaded yet'; }
},

  onQrFile(evt){
    const file = evt.target.files[0];
    if (!file) return;
    const status = $('set-qr-status');
    status.textContent = 'Processing…';
    const LIMIT = 48000;
    const attempts = [
      { max:600, q:.85 }, { max:600, q:.6 }, { max:450, q:.6 },
      { max:450, q:.4 }, { max:320, q:.5 }, { max:320, q:.3 }
    ];
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let best = null;
        for (const a of attempts) {
          const scale = Math.min(1, a.max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL('image/jpeg', a.q);
          if (url.length <= LIMIT) { best = url; break; }
          if (!best || url.length < best.length) best = url;
        }
        if (!best || best.length > LIMIT) {
          status.textContent = 'Still too large at the lowest quality — crop the image to just the QR square and try again.';
          return;
        }
        $('set-qr').value = best;
        $('set-qr-preview').src = best;
        $('set-qr-preview').hidden = false;
        status.textContent = 'Ready — save changes to publish it';
      };
      img.onerror = () => { status.textContent = 'That image could not be read.'; };
      img.src = e.target.result;
    };
    reader.onerror = () => { status.textContent = 'That file could not be read.'; };
    reader.readAsDataURL(file);
  },

  async save(){
    const amount = parseInt($('set-amount').value, 10);
    const trial = parseInt($('set-trial').value, 10);
    if (isNaN(amount) || amount < 1) { $('set-amount').classList.add('invalid'); $('set-amount').focus(); return TOAST.show('Enter a payment amount of at least 1', 'error'); }
    if (isNaN(trial) || trial < 1) { $('set-trial').classList.add('invalid'); $('set-trial').focus(); return TOAST.show('Enter a trial length of at least 1 hour', 'error'); }
    $('set-amount').classList.remove('invalid'); $('set-trial').classList.remove('invalid');

    const settings = [
      { key:'appName', value: $('set-name').value.trim() },
      { key:'qrCodeUrl', value: $('set-qr').value.trim() },
      { key:'contactPhone', value: $('set-phone').value.trim() },
      { key:'paymentAmount', value: amount },
      { key:'paymentInstructions', value: $('set-inst').value },
      { key:'trialHours', value: trial },
      { key:'paymentEta', value: $('set-eta').value.trim().slice(0, 60) },
      { key:'announcement', value: $('set-announce').value.trim().slice(0, 300) }
    ];
    const btn = $('btn-save-settings');
    btn.classList.add('loading');
    try {
      const res = await ADMIN.post('adminUpdateSettingsBatch', { settings });
      if (res.success) {
        TOAST.show('Changes saved', 'success');
      } else {
        const results = await Promise.all(settings.map(s =>
          ADMIN.post('adminUpdateSettings', { key:s.key, value:s.value })
            .then(r => ({ key:s.key, ok: !!(r && r.success), error: r?.error }))
            .catch(e => ({ key:s.key, ok:false, error: e.message }))
        ));
        const failed = results.filter(r => !r.ok);
        if (!failed.length) TOAST.show('Changes saved', 'success');
        else if (failed.length === settings.length) TOAST.show('Nothing saved: ' + (failed[0].error || 'the server rejected the request'), 'error', 7000);
        else TOAST.show((settings.length - failed.length) + ' of ' + settings.length + ' saved. Failed: ' + failed.map(f => f.key).join(', '), 'warning', 8000);
      }
      ADMIN.refresh(['settings']);
    } catch(e){ TOAST.show('Could not save: ' + e.message, 'error', 6000); }
    btn.classList.remove('loading');
  }
};

window.LKS_ADMIN = LKS_ADMIN;
window.SETTINGS  = SETTINGS;