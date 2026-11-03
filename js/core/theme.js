// js/core/theme.js — dark/light preference + the eye icon in every password field.

const THEME_KEY = 'abhyas_theme';

function getStoredTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v === 'dark' || v === 'light') return v;
    }
  } catch (e) {}
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function toggleTheme() {
  const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch (e) {}
  applyTheme(next);
  return next;
}

/* The eye button in every .pw-field. Loaded on all three pages, so this is
   the single definition — do not re-declare it in page/admin modules. */
function togglePw(btn) {
  const field = btn.closest('.pw-field');
  const input = field ? field.querySelector('input') : btn.previousElementSibling;
  if (!input || input.tagName !== 'INPUT') return;
  const icon = btn.querySelector('i');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  if (icon) icon.className = showing ? 'ph ph-eye' : 'ph ph-eye-slash';
  btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  btn.setAttribute('aria-pressed', String(!showing));
}
window.togglePw = togglePw;
