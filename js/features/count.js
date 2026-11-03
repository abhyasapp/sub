// js/features/count.js — ask how many questions are inside each file, once.

const CNT_AUTO_LIMIT = 20;

const CNT = {
  _lastError: null,
  _remember(fid, n) {
    if (!fid || n == null) return false;
    n = n | 0;
    if (n <= 0 || S.fcount[fid] === n) return false;
    S.fcount[fid] = n;
    return true;
  },
  /* A downloaded set is the copy the quiz will actually use, so its length is
     more trustworthy than a count learned before the content changed. */
  async _cachedCount(ref) {
    if (!ref || !ref.fid || !ref.key || typeof QDB === 'undefined') return null;
    try {
      const raw = await QDB.get(ref.key);
      if (!raw) return null;
      const n = normQ(raw, ref.fid).length;
      return n > 0 ? n : null;
    } catch (e) { return null; }
  },
  /* Reconcile every cached file in a chapter before its sheet renders. */
  async reconcileCached(refs) {
    if (!Array.isArray(refs) || !refs.length || typeof QDB === 'undefined') return false;
    let changed = false;
    await Promise.all(refs.map(async ref => {
      const n = await this._cachedCount(ref);
      if (n != null && this._remember(ref.fid, n)) changed = true;
    }));
    if (changed) _save(LS.FCOUNT, S.fcount);
    return changed;
  },
  /* Counts for downloaded rows should track the published file, not merely the
     copy learned earlier. Revalidate in the background; the sheet has already
     rendered, so a slow network never blocks it. */
  async refreshRemote(refs, onCount) {
    if (!Array.isArray(refs) || !refs.length || typeof QUIZ === 'undefined') return false;
    if (!S.online || S.forcedOffline) return false;
    const queue = refs.slice();
    let changed = false;
    const worker = async () => {
      while (queue.length) {
        const ref = queue.shift();
        try {
          const raw = await QUIZ._fetch(ref.fid, ref.key, 1, 'bg');
          const n = normQ(raw, ref.fid).length;
          if (n > 0 && this._remember(ref.fid, n)) {
            changed = true;
            if (onCount) onCount(ref, n);
          }
        } catch (e) { /* keep the cached count */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, refs.length) }, worker));
    if (changed) _save(LS.FCOUNT, S.fcount);
    return changed;
  },
  async forFile(ref) {
    if (!ref.fid) return null;
    const cached = await this._cachedCount(ref);
    if (cached != null) {
      if (this._remember(ref.fid, cached)) _save(LS.FCOUNT, S.fcount);
      return cached;
    }
    if (S.fcount[ref.fid] != null) return S.fcount[ref.fid];
    try {
      const raw = await QUIZ._fetch(ref.fid, ref.key);
      const n = normQ(raw, ref.fid).length;
      S.fcount[ref.fid] = n;
      _save(LS.FCOUNT, S.fcount);
      return n;
    } catch (e) { CNT._lastError = e && e.message; return null; }
  },
  knownTotal(leaves) {
    let sum = 0, unknown = 0;
    leaves.forEach(ref => {
      const n = S.fcount[ref.fid];
      if (n == null) unknown++; else sum += n;
    });
    return { total: sum, files: leaves.length, unknown };
  },
  async totalFor(lv, ch, book, sub, { force = false, onTick } = {}) {
    const leaves = scopeLeaves(lv, ch, book, sub);
    const known = CNT.knownTotal(leaves);
    if (known.unknown === 0) return known;
    if (!force && leaves.length > CNT_AUTO_LIMIT) return { ...known, needsConfirm: true };
    let sum = 0, unknown = 0, done = 0;
    const CONC = 4; let i = 0;
    async function worker() {
      while (i < leaves.length) {
        const ref = leaves[i++];
        const n = await CNT.forFile(ref);
        if (n == null) unknown++; else sum += n;
        done++;
        onTick && onTick(done, leaves.length);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(CONC, leaves.length)) }, worker));
    return { total: sum, files: leaves.length, unknown };
  }
};