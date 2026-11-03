// js/features/chapter-stats.js — the per-chapter accuracy rollup and the
// per-file coverage store. Moved from the ORIGINAL 01-state-storage-helpers.js
// (they lived there as top-level consts). MUST load AFTER: core/constants.js
// (LS), core/storage.js (_save), core/state.js (S).

const CHAPSTATS = {
  record(sess){
    const key = sess.chapter || 'Unknown';
    const rec = S.chapStats[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
    rec.attempted += sess.total || 0;
    rec.correct += sess.correct || 0;
    rec.sessions += 1;
    rec.lastAt = sess.at || Date.now();
    S.chapStats[key] = rec;
    _save(LS.CHAPSTATS, S.chapStats);
  },
  entries(){
    return Object.entries(S.chapStats)
      .map(([chapter, d]) => ({
        chapter, attempted: d.attempted, correct: d.correct,
        accuracy: d.attempted ? Math.round((d.correct/d.attempted)*100) : 0,
        sessions: d.sessions, lastAt: d.lastAt
      }))
      .sort((a,b)=>b.lastAt-a.lastAt);
  },
  rebuildFromSessions(){
    const rebuilt = {};
    (S.prog.sessions||[]).forEach(s=>{
      const key = s.chapter || 'Unknown';
      const rec = rebuilt[key] || {attempted:0, correct:0, sessions:0, lastAt:0};
      rec.attempted += s.total || 0;
      rec.correct += s.correct || 0;
      rec.sessions += 1;
      if((s.at||0) > rec.lastAt) rec.lastAt = s.at||0;
      rebuilt[key] = rec;
    });
    Object.entries(rebuilt).forEach(([key, rec])=>{
      if(!S.chapStats[key]) S.chapStats[key] = rec;
    });
    _save(LS.CHAPSTATS, S.chapStats);
  }
};

const COV = {
  _ok(){
    if(!S.cov || typeof S.cov !== 'object' || Array.isArray(S.cov)) S.cov = {};
    return true;
  },
  _add(q){
    if(!q || !q.uid) return;
    const uid = String(q.uid);
    const i = uid.lastIndexOf('_');
    if(i < 1) return;
    const fid = uid.slice(0, i);
    if(fid === 'local') return;
    const idx = parseInt(uid.slice(i + 1), 10);
    if(!isFinite(idx) || idx < 0 || idx > 20000) return;
    const rec = S.cov[fid] || (S.cov[fid] = {p:'', a:0, c:0});
    rec.t = Date.now();      /* v1.33: lets a reset on another device tell old coverage from new */
    if(rec.p.length <= idx) rec.p = rec.p.padEnd(idx + 1, '0');
    rec.p = rec.p.slice(0, idx) + (q.ok ? '1' : '2') + rec.p.slice(idx + 1);
    rec.a = (rec.a || 0) + 1;
    if(q.ok) rec.c = (rec.c || 0) + 1;
  },
  record(qres){
    if(!Array.isArray(qres) || !COV._ok()) return;
    qres.forEach(q => COV._add(q));
    _save(LS.COV, S.cov);
  },
  rebuildFromSessions(){
    if(!COV._ok()) return;
    const sessions = (S.prog && Array.isArray(S.prog.sessions)) ? S.prog.sessions : [];
    for(let i = sessions.length - 1; i >= 0; i--){
      (sessions[i].qres || []).forEach(q => COV._add(q));
    }
    _save(LS.COV, S.cov);
  },
  merge(remote){
    if(!remote || typeof remote !== 'object' || !COV._ok()) return;
    Object.keys(remote).forEach(fid => {
      const r = remote[fid];
      if(!r || typeof r !== 'object') return;
      const rp = String(r.p || '');
      const l = S.cov[fid];
      if(!l){ S.cov[fid] = {p: rp, a: Number(r.a) || 0, c: Number(r.c) || 0, t: Number(r.t) || 0}; return; }
      let out = '';
      const n = Math.max(rp.length, l.p.length);
      for(let i = 0; i < n; i++){
        const a = l.p[i] || '0', b = rp[i] || '0';
        out += (a !== '0') ? a : b;
      }
      l.p = out;
      l.a = Math.max(l.a || 0, Number(r.a) || 0);
      l.c = Math.max(l.c || 0, Number(r.c) || 0);
    });
    _save(LS.COV, S.cov);
  }
};

window.CHAPSTATS = CHAPSTATS;
window.COV       = COV;