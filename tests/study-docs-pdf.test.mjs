import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 37, 37, 69, 79, 70, 10]);
const signedUrl = 'https://storage.example/signed/example.pdf';

function bytesResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? 'application/pdf' : null },
    clone() { return bytesResponse(bytes); },
    blob: async () => new Blob([bytes]),
    json: async () => { throw new Error('not JSON'); }
  };
}

function jsonResponse(json, contentType = 'application/json') {
  return {
    ok: true,
    status: 200,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    clone() { return jsonResponse(json, contentType); },
    blob: async () => new Blob([JSON.stringify(json)]),
    json: async () => json
  };
}

function app(fetchImpl) {
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Set, Map,
    AbortController, Blob, ArrayBuffer, Uint8Array, URL, atob, btoa,
    setTimeout, clearTimeout,
    location: { origin: 'https://app.example' },
    S: { user: { username: 'student', token: 'test-token' }, online: true, forcedOffline: false },
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of ['js/core/config.js', 'js/core/net.js', 'js/features/study-docs.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '');
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

/* This is the shape listStudyDocs actually answers with: no storage path and
   no file id, only the record id. */
const listedDoc = {
  id: 'study-doc-record-id',
  title: 'Example answers',
  fileName: 'example.pdf',
  category: 'model-answer',
  sizeBytes: 1024
};

test('STUDYDOCS.open reads a listed document through getStudyDocPdf by record id', async () => {
  const calls = [];
  const context = app(async (url, options) => {
    calls.push({ url, options });
    if (url === signedUrl) return bytesResponse(pdfBytes);
    const body = JSON.parse(options.body);
    assert.equal(body.action, 'getStudyDocPdf');
    return jsonResponse({ success: true, url: signedUrl, title: 'Example answers' });
  });
  let viewerOptions;
  context.PDFVIEW = { open(options) { viewerOptions = options; } };
  context.STUDYDOCS.docs = [listedDoc];

  context.STUDYDOCS.open(listedDoc.id);
  const loaded = await viewerOptions.load();

  assert.equal(atob(loaded.base64), '%PDF-1.7\n%%EOF\n');
  assert.equal(loaded.filename, 'example.pdf');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, context.ABHYAS_CONFIG.SUPABASE_URL);
  assert.equal(JSON.parse(calls[0].options.body).id, listedDoc.id);
  assert.equal(calls[1].url, signedUrl);
});

test('STUDYDOCS.open falls back to getFile when the document carries a storage path', async () => {
  const calls = [];
  const context = app(async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options.body);
    if (body.action === 'getStudyDocPdf') return jsonResponse({ success: false, error: 'Document not found.' });
    assert.equal(body.action, 'getFile');
    assert.equal(body.fileId, 'study-docs/example.pdf');
    return bytesResponse(pdfBytes);
  });
  let viewerOptions;
  context.PDFVIEW = { open(options) { viewerOptions = options; } };
  context.STUDYDOCS.docs = [Object.assign({}, listedDoc, { pdfPath: 'study-docs/example.pdf' })];

  context.STUDYDOCS.open(listedDoc.id);
  const loaded = await viewerOptions.load();

  assert.equal(atob(loaded.base64), '%PDF-1.7\n%%EOF\n');
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).action, 'getStudyDocPdf');
  assert.equal(JSON.parse(calls[1].options.body).action, 'getFile');
});

test('STUDYDOCS.open unwraps base64 returned inside the getFile JSON envelope', async () => {
  const context = app(async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === 'getStudyDocPdf') return jsonResponse({ success: false, error: 'Document not found.' });
    return jsonResponse({ success: true, content: btoa(String.fromCharCode(...pdfBytes)) });
  });
  let viewerOptions;
  context.PDFVIEW = { open(options) { viewerOptions = options; } };
  context.STUDYDOCS.docs = [Object.assign({}, listedDoc, { pdfPath: 'study-docs/example.pdf' })];

  context.STUDYDOCS.open(listedDoc.id);
  const loaded = await viewerOptions.load();

  assert.equal(atob(loaded.base64), '%PDF-1.7\n%%EOF\n');
});
