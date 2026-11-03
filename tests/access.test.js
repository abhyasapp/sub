import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { loadGlobals } from './helpers/load-globals.js';

// This function decides who gets paid content — it must never regress silently.
const { computeAccessLevel } = loadGlobals(['js/core/access.js']);

describe('computeAccessLevel', () => {
  it('permanent when server says permanentAccess', () => {
    expect(computeAccessLevel({ permanentAccess: true }, {}).level).toBe('permanent');
  });
  it('permanent when user.status is active', () => {
    expect(computeAccessLevel({}, { status: 'active' }).level).toBe('permanent');
  });
  it('trial', () => {
    const a = computeAccessLevel({ isTrial: true, trialExpiresAt: '2026-12-01' }, {});
    expect(a.level).toBe('trial');
    expect(a.trialExpiresAt).toBe('2026-12-01');
    expect(a.permanent).toBe(false);
  });
  it('pending_review only when payment is pending', () => {
    expect(computeAccessLevel({ needsPayment: true }, { status: 'payment_pending' }).level)
      .toBe('pending_review');
  });
  it('expired when payment needed and nothing pending', () => {
    expect(computeAccessLevel({ needsPayment: true }, { status: 'expired' }).level).toBe('expired');
  });
  it('unknown for an empty response — and never grants access', () => {
    const a = computeAccessLevel({}, {});
    expect(a.level).toBe('unknown');
    expect(a.permanent).toBe(false);
  });
  it('permanent beats trial and needsPayment', () => {
    expect(computeAccessLevel({ permanentAccess: true, isTrial: true, needsPayment: true }, {}).level)
      .toBe('permanent');
  });
  it('falls back to res.user when user arg is omitted', () => {
    expect(computeAccessLevel({ user: { status: 'active' } }).level).toBe('permanent');
  });
  it('defaults accessType to permanent', () => {
    expect(computeAccessLevel({ permanentAccess: true }, {}).accessType).toBe('permanent');
  });
});

// Offline access is granted without asking the server, so an expiry that is
// not honoured here keeps working indefinitely on a device that never
// reconnects.
describe('AUTH._isValidOffline', () => {
  const ctx = loadGlobals(['js/core/auth.js']);
  const check = (access) => {
    ctx.__access = access;
    return vm.runInContext('AUTH._isValidOffline({ access: __access })', ctx);
  };
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

  it('keeps a live yearly licence working offline', () => {
    expect(check({ level: 'permanent', accessType: 'yearly', accessExpiresAt: inDays(30) })).toBe(true);
  });
  it('rejects a yearly licence that expired months ago', () => {
    expect(check({ level: 'permanent', accessType: 'yearly', accessExpiresAt: '2024-01-01T00:00:00Z' })).toBe(false);
  });
  it('allows a genuine permanent licence with no expiry', () => {
    expect(check({ level: 'permanent', accessType: 'permanent' })).toBe(true);
  });
  it('rejects an expired trial', () => {
    expect(check({ level: 'trial', trialExpiresAt: '2024-01-01T00:00:00Z' })).toBe(false);
  });
});
