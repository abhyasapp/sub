// js/core/subjective-api.js — the transport for the written-answer backend.
// Routes through abhyasEndpointFor so the 4 SMTP actions still hit GAS while
// everything else (subjective answers, study docs, admin grading) hits Supabase.

function _backendUrlFor(action, params) {
  try {
    if (typeof ABHYAS_CONFIG === 'undefined' || !ABHYAS_CONFIG) return '';
    const which = (typeof abhyasEndpointFor === 'function')
      ? abhyasEndpointFor(action, params)
      : 'supabase';
    return which === 'gas' ? ABHYAS_CONFIG.GAS_URL : ABHYAS_CONFIG.SUPABASE_URL;
  } catch (e) {}
  try {
    if (typeof ABHYAS_CONFIG !== 'undefined' && ABHYAS_CONFIG && ABHYAS_CONFIG.SUPABASE_URL) {
      return ABHYAS_CONFIG.SUPABASE_URL;
    }
  } catch (e) {}
  try {
    if (typeof APPS !== 'undefined' && APPS) return APPS;
  } catch (e) {}
  return '';
}

function _authParams() {
  try {
    if (typeof S !== 'undefined' && S && S.user) {
      return { username: S.user.username || '', token: S.user.token || '' };
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.S && window.S.user) {
      return { username: window.S.user.username || '', token: window.S.user.token || '' };
    }
  } catch (e) {}
  return { username: '', token: '' };
}

async function _api(action, params, method) {
  const base = _authParams();
  const body = { action, ...base, ...(params || {}) };
  const url = _backendUrlFor(action, body);
  if (!url) return { success: false, error: 'Backend URL not configured.' };
  try {
    if (method === 'GET') {
      const queryString = new URLSearchParams(body).toString();
      const r = await fetch(url + '?' + queryString, { redirect: 'follow' });
      return await r.json();
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    });
    return await r.json();
  } catch (e) {
    return { success: false, error: e.message || 'Network error' };
  }
}