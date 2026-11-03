// js/core/access.js — the ONE place a login response becomes an access level.

function computeAccessLevel(res, user) {
  user = user || res.user || {};
  return {
    level: res.permanentAccess || user.status === 'active' ? 'permanent'
         : res.isTrial ? 'trial'
         : res.needsPayment && user.status === 'payment_pending' ? 'pending_review'
         : res.needsPayment ? 'expired'
         : 'unknown',
    trialExpiresAt: res.trialExpiresAt || user.trialExpiresAt,
    permanent: !!(res.permanentAccess || user.status === 'active'),
    accessType: res.accessType || user.accessType || 'permanent',
    accessExpiresAt: res.accessExpiresAt || user.accessExpiresAt || ''
  };
}