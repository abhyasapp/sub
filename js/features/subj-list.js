// js/features/subj-list.js — the browse-questions view.
// MUST load AFTER: subj-bank.js (BANK, _allQuestions, _questionsByChapter),
// core/text.js (esc). subj-public.js supplies _emptyCard and _retryBtn at
// RUNTIME only — the order that file loads does not matter.

function _renderList(){
  const body = document.getElementById('subj-list-body');
  if(!body) return;

  if(!BANK.loaded){
    body.innerHTML = _emptyCard('ph-circle-notch','Loading…','Fetching the question bank.');
    return;
  }
  if(!_allQuestions().length){
    body.innerHTML = _emptyCard('ph-list-dashes','Nothing to browse yet',
      BANK.error || 'Once questions are added, this becomes a chapter-by-chapter index.',
      BANK.error ? _retryBtn : '');
    return;
  }

  const f = (window.SUBJ && SUBJ._listFilter) || { query: '', chapter: '' };
  const chapters = window.SUBJECTIVE_CHAPTERS || [];
  const tree = chapters
    .filter(ch => !f.chapter || ch.id === f.chapter)
    .map(ch => {
      let qs = _questionsByChapter(ch.id);
      if(f.query) qs = qs.filter(q => (q.q || '').toLowerCase().includes(f.query));
      if(!qs.length) return '';

      const byTopic = {};
      qs.forEach(q => {
        const key = q.topic || 'General';
        (byTopic[key] = byTopic[key] || []).push(q);
      });
      const topics = Object.keys(byTopic).sort();

      const topicBlocks = topics.map(topic => {
        const tQs = byTopic[topic];
        return `<div style="margin:0 0 .55rem">` +
          `<div style="font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:.35rem .3rem .2rem;border-bottom:1px solid var(--b1)">` +
            `${esc(topic)} <span style="font-weight:500;opacity:.6">(${tQs.length})</span>` +
          `</div>` +
          tQs.map((q, i) => `<div class="subj-q-row">` +
            `<span class="qn">${i+1}.</span>` +
            `<span class="qt">${esc(q.q)}</span>` +
            `<span class="qm ${q.marks===10?'m10':'m5'}">${q.marks}M</span>` +
          `</div>`).join('') +
        `</div>`;
      }).join('');

      const openClass = (f.query || f.chapter) ? ' open' : '';
      return `<div class="subj-group${openClass}">` +
        `<div class="subj-group-hd" data-on-click="this.parentElement.classList.toggle('open')">` +
          `<div><div>${ch.icon || ''} ${esc(ch.name)} <span style="color:var(--t3);font-weight:400">· Group ${esc(ch.group || '')}</span></div>` +
          `<div class="meta">${qs.length} question${qs.length !== 1 ? 's' : ''} · ${topics.length} section${topics.length !== 1 ? 's' : ''}</div></div>` +
          `<i class="ph ph-caret-right chev"></i>` +
        `</div>` +
        `<div class="subj-group-body">${topicBlocks}</div>` +
      `</div>`;
    }).filter(Boolean).join('');

  body.innerHTML = tree || _emptyCard('ph-list-dashes','No matching questions','Try clearing the search or picking a different chapter.');
}

window._renderList = _renderList;