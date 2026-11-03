// js/features/local-file.js — load a question bank from this device.
// MUST load AFTER: core/state.js, core/question.js (normQ),
// core/text.js (pluralize), core/toast.js (toast).

const LOC = {
  onFile(){
    const f = document.getElementById('loc-file').files[0]; if (!f) return;
    const nameEl = document.getElementById('loc-file-name');
    if (nameEl) nameEl.textContent = f.name;
    const r = new FileReader();
    r.onload = e => {
      try {
        const qs2 = normQ(JSON.parse(e.target.result), 'local');
        if (!qs2.length){ toast('❌ No valid questions found in file'); return; }
        S.localQs = qs2;
        const info = document.getElementById('loc-info');
        info.style.display = ''; info.textContent = `✅ ${pluralize(qs2.length,'question')} loaded from "${f.name}"`;
        document.getElementById('loc-pr').disabled = false;
        document.getElementById('loc-ex').disabled = false;
        toast(`✅ ${pluralize(qs2.length,'question')} ready`);
      } catch{ toast('❌ Invalid JSON file'); }
    };
    r.onerror = () => toast('❌ Could not read file');
    r.readAsText(f);
  },
  start(mode){
    if (!S.localQs){ toast('Load a JSON file first'); return; }
    QUIZ.startWith([...S.localQs], mode, 'Local File');
  }
};

window.LOC = LOC;