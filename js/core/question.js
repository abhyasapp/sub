// js/core/question.js — parsing a question file into the shape the app uses,
// plus the small helpers that put a question on screen (image, search link).

const GOOGLE_PROMPT_MAX = 1400;

const GOOGLE_PROMPT_HEAD =
  'You are a tutor for Nepal Lok Sewa Aayog Level 7 Civil Engineering. ' +
  'Analyse this exam question and reply with: ' +
  '(1) the correct option and exactly why, ' +
  '(2) why each wrong option is a trap, ' +
  '(3) the full concept it tests — definition, formula, principle, ' +
  '(4) related concepts a similar exam question could ask, ' +
  '(5) the common confusions to avoid on this topic, ' +
  '(6) a one-line memory trick. Keep it exam-focused. ';

// ── EXTENSION CONNECTION STATE ──
window.isDualSearchExtensionInstalled = false;

// Listen for the safe event dispatched by content.js
document.addEventListener('DualSearchExtensionReady', () => {
    window.isDualSearchExtensionInstalled = true;
    console.log("✅ Dual Search Extension Connected!");
});

// Startup-race safety net. If the extension announced itself BEFORE this script ran, the event above
// was missed. So we also ask any already-loaded extension to answer (it replies DUAL_SEARCH_PONG; see
// docs/SEARCH.md for the 6-line content.js addition). Harmless if the extension never answers.
window.addEventListener('message', (e) => {
  if (e.source === window && e.data && e.data.type === 'DUAL_SEARCH_PONG') window.isDualSearchExtensionInstalled = true;
});
try { window.postMessage({ type: 'DUAL_SEARCH_PING' }, window.location.origin); } catch (_) { /* ignore */ }

// ── IMAGE HELPERS ──
function _resolveQImg(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (v.startsWith('data:image')) return v;
  if (/^https?:\/\//.test(v)) {
    const m = v.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || v.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200` : v;
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(v)) return `https://drive.google.com/thumbnail?id=${v}&sz=w1200`;
  return null;
}

function qImgHtml(q) {
  if (!q.img) return '';
  const alt = q.imgCaption || 'Question figure';
  return `<div style="margin:.4rem 0"><img src="${esc(q.img)}" alt="${esc(alt)}" style="max-width:100%;border-radius:8px;border:1px solid var(--b1);display:block" loading="lazy" data-on-error="ACT.hideParent(this)"></div>`;
}

// ── QUERY BUILDER ──
function _buildRichQuery(q) {
  if (!q) return '';
  const opts = (q.options || []).map((o, i) => String.fromCharCode(65 + i) + ') ' + String(o)).join(' ');
  const stem = String(q.q || '').trim();
  const body = 'Question: ' + stem + '  Options: ' + opts + '.';
  return (GOOGLE_PROMPT_HEAD + body).slice(0, GOOGLE_PROMPT_MAX).trim();
}

// Plain "question + options" text that is sent to the extension.
function _plainSearchText(q) {
  const opts = (q.options || []).map((o, i) => String.fromCharCode(65 + i) + ') ' + String(o)).join(' ');
  return String(q.q || '').trim() + (opts ? '  Options: ' + opts : '');
}

// ── SEARCH BUTTON HTML ──
function qSearchHtml(q) {
  // 1. Text for the extension, escaped with the app's esc() (covers & < > " ' — not just quotes)
  const safeQuery = esc(_plainSearchText(q));
  
  // 2. Fallback URL (used ONLY if the extension is not installed)
  const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(_buildRichQuery(q))}`;

  // 3. Return the link with class "ext-search-btn" for Event Delegation
  return `<a class="ib ext-search-btn" href="${fallbackUrl}" target="_blank" rel="noopener" `
       + `data-query="${safeQuery}" `
       + `title="Ask Google AI to analyse this question" `
       + `aria-label="Ask Google AI to analyse this question">`
       + `<i class="ph ph-magnifying-glass"></i></a>`;
}

// ── EVENT DELEGATION (THE FIX) ──
// We intercept clicks globally instead of using inline onclick.
document.addEventListener('click', function(e) {
    // Check if the clicked element (or its parent) is our search button
    const btn = e.target.closest && e.target.closest('.ext-search-btn');
    if (btn) {
        const plain = e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
        if (window.isDualSearchExtensionInstalled && plain) {
            // Extension is installed! Stop the normal link and send the message.
            e.preventDefault();
            const queryText = btn.getAttribute('data-query');
            window.postMessage({ type: 'DUAL_SEARCH_REQUEST', query: queryText }, window.location.origin);
        }
        // If extension is NOT ready, it falls back to the default href (normal Google search)
    }
});

// ── QUESTION PARSER ──
function normQ(raw, fid) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.success === false) {
    console.warn('[normQ] Server error for', fid, '—', raw.error);
    return [];
  }
  let a = Array.isArray(raw) ? raw
        : (raw?.questions || raw?.data || raw?.quiz || raw?.items || raw?.result || null);
  if (!Array.isArray(a) && a === null && raw && typeof raw === 'object') {
    const vals = Object.values(raw);
    if (vals.length && vals[0] && (vals[0].q || vals[0].question || vals[0].Question)) a = vals;
  }
  if (!Array.isArray(a)) {
    console.warn('[normQ] Unrecognised format for', fid, '— got:', typeof raw, Array.isArray(raw) ? 'array' : JSON.stringify(raw).slice(0, 120));
    return [];
  }
  const result = [];
  let skipped = 0;
  a.forEach((q, i) => {
    if (!q || typeof q !== 'object') { skipped++; return; }
    const text = q.q || q.question || q.Question || q.stem || q.ques || q.text || '';
    if (!text) { skipped++; return; }
    let options = q.options || q.opts || q.choices || q.Options;
    if (!Array.isArray(options)) {
      const lettered = [q.a || q.A, q.b || q.B, q.c || q.C, q.d || q.D, q.e || q.E]
        .filter(x => x !== undefined && x !== null && x !== '');
      if (lettered.length >= 2) options = lettered;
    }
    if (!Array.isArray(options) || options.length < 2) { skipped++; return; }
    let correct = q.correct !== undefined ? q.correct
                : q.answer !== undefined ? q.answer
                : q.ans !== undefined ? q.ans
                : q.Answer !== undefined ? q.Answer : undefined;
    if (typeof correct === 'string' && /^[a-eA-E]$/.test(correct.trim())) {
      correct = 'abcde'.indexOf(correct.trim().toLowerCase());
    }
    result.push({
      q: String(text).trim(),
      options: options.map(String),
      correct,
      explanation: q.explanation || q.explain || q.exp || q.solution || q.hint || '',
      img: _resolveQImg(q.img || q.image || q.Image || q.figure || q.diagram || ''),
      imgCaption: String(q.imgCaption || q.imgAlt || q.figureCaption || q.caption || '').trim(),
      fileId: fid || 'local',
      uid: `${fid || 'local'}_${i}`
    });
  });
  if (skipped > 0) console.warn(`[normQ] ${skipped}/${a.length} questions skipped in ${fid}`);
  if (!result.length) console.warn('[normQ] Zero valid questions from', fid, '— raw sample:', JSON.stringify(a[0]).slice(0, 200));
  return result;
}