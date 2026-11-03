// js/features/tutorial.js — the welcome sheet, seen once per account.
// MUST load AFTER: core/storage.js (_load, _save), core/state.js (S).

const TUTORIAL = {
  _seenKey: 'abhyas_tut_seen',
  _idx: 0,
  _steps: [
    { icon: '<i class="ph ph-hand-waving"></i>', title: 'Welcome to Abhyas',
      body: `<p><b>Practice</b> — pick a chapter, or start the 30-minute session on Home for the right mix of reviews, weak spots, and new material.</p>
        <p><b>Written answers</b> — a timed question every day, plus full papers. Photograph your answer and upload as one PDF.</p>
        <p><b>Review</b> — saved and missed questions come back on a spacing schedule until you get them right four times.</p>
        <p><b>Progress</b> — accuracy, weak chapters, your plan.</p>
        <p><b>Tools</b> — offline downloads, backup, study plan.</p>
        <p style="margin-top:.6rem">Once you open a chapter, it works with no signal.</p>` }
  ],

  maybeAutoOpen(user){
    if(!user || !user.username) return;
    const seen = _load(TUTORIAL._seenKey, {});
    if(seen[user.username]) return;
    setTimeout(()=>TUTORIAL.open(), 600);
  },

  open(){
    if(document.getElementById('tut-modal')) return;
    TUTORIAL._idx = 0;
    const modal = document.createElement('div');
    modal.id = 'tut-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:10001;padding:1.2rem;backdrop-filter:blur(4px)';
    modal.innerHTML = `
      <div style="background:var(--c2);border:1px solid var(--bd);border-radius:var(--r3);padding:1.4rem;max-width:420px;width:100%;box-shadow:var(--sh3);max-height:88vh;display:flex;flex-direction:column">
        <div id="tut-dots" style="display:flex;gap:.3rem;margin-bottom:.9rem;justify-content:center"></div>
        <div style="flex:1;overflow-y:auto;min-height:0" id="tut-body"></div>
        <div style="display:flex;gap:.4rem;margin-top:1rem">
          <button id="tut-next" style="flex:1;padding:.62rem;background:linear-gradient(135deg,var(--amb2),var(--amb));border:none;border-radius:var(--r2);color:var(--on-accent);font-weight:700;font-size:.85rem;cursor:pointer;font-family:var(--ff)">Got it — let's study! →</button>
        </div>
        <button id="tut-skip" style="margin-top:.55rem;background:none;border:none;color:var(--t3);font-size:.72rem;cursor:pointer;font-family:var(--ff);text-decoration:underline">Skip tutorial</button>
      </div>`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Welcome to Abhyas');
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') TUTORIAL._finish(); });
    document.body.appendChild(modal);
    try { document.getElementById('tut-next').focus(); } catch (e) {}
    document.getElementById('tut-next').onclick = ()=>TUTORIAL._finish();
    document.getElementById('tut-skip').onclick = ()=>TUTORIAL._finish();
    TUTORIAL._render();
  },

  _render(){
    const step = TUTORIAL._steps[0];
    const body = document.getElementById('tut-body');
    if(!body) return;
    body.innerHTML = `
      <div style="font-size:1.6rem;margin-bottom:.3rem">${step.icon}</div>
      <div style="font-family:var(--fd);font-size:1rem;font-weight:700;color:var(--t1);margin-bottom:.5rem">${step.title}</div>
      <div style="font-size:.82rem;color:var(--t2);line-height:1.55">${step.body}</div>`;
  },

  _finish(){
    const modal = document.getElementById('tut-modal');
    if(modal) modal.remove();
    if(S.user && S.user.username){
      const seen = _load(TUTORIAL._seenKey, {});
      seen[S.user.username] = true;
      _save(TUTORIAL._seenKey, seen);
    }
  }
};

window.TUTORIAL = TUTORIAL;