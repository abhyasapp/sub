import { describe, it, expect } from 'vitest';
import { loadGlobals } from './helpers/load-globals.js';

const g = loadGlobals(['js/core/text.js']);

describe('esc (the one HTML escaper — every innerHTML relies on it)', () => {
  it('escapes all five dangerous characters', () => {
    expect(g.esc(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;'
    );
  });
  it('turns null/undefined into empty string, keeps 0', () => {
    expect(g.esc(null)).toBe('');
    expect(g.esc(undefined)).toBe('');
    expect(g.esc(0)).toBe('0');
  });
  it('never leaves a raw < or > behind', () => {
    const nasty = ['<script>', '"><svg/onload=1>', "'><b>", '</textarea><script>'];
    for (const s of nasty) expect(g.esc(s)).not.toMatch(/[<>]/);
  });
});

describe('escAttrJs', () => {
  it('escapes quotes for JS inside an HTML attribute', () => {
    const out = g.escAttrJs(`it's "x"`);
    expect(out).not.toContain("'");
    expect(out).not.toContain('"');
  });
  it('escapes newlines and line separators so the JS string stays on one line', () => {
    const out = g.escAttrJs('a\nb\rc\u2028d\u2029e');
    expect(out).not.toMatch(/[\n\r\u2028\u2029]/);
    expect(out).toBe('a\\nb\\rc\\u2028d\\u2029e');
  });
});

describe('small helpers', () => {
  it('pluralize', () => {
    expect(g.pluralize(1, 'question')).toBe('1 question');
    expect(g.pluralize(2, 'question')).toBe('2 questions');
    expect(g.pluralize(2, 'box', 'boxes')).toBe('2 boxes');
  });
  it('formatBytes', () => {
    expect(g.formatBytes(500)).toBe('500 B');
    expect(g.formatBytes(2048)).toBe('2 KB');
    expect(g.formatBytes(5 * 1048576)).toBe('5.0 MB');
    expect(g.formatBytes('junk')).toBe('0 B');
  });
  it('localISODate pads month and day', () => {
    expect(g.localISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('driveFileId', () => {
  const id = 'A'.repeat(33);
  it('accepts a bare id', () => expect(g.driveFileId(id)).toBe(id));
  it('extracts from /d/<id>/ and ?id= URLs', () => {
    expect(g.driveFileId(`https://drive.google.com/file/d/${id}/view`)).toBe(id);
    expect(g.driveFileId(`https://drive.google.com/uc?id=${id}&export=download`)).toBe(id);
  });
  it('rejects data: URIs, short strings and empties', () => {
    expect(g.driveFileId('data:image/png;base64,AAAA')).toBe('');
    expect(g.driveFileId('short')).toBe('');
    expect(g.driveFileId(null)).toBe('');
  });
});
