// Abhyas scripts are plain browser globals (no modules), so tests load them the
// same way the browser does: evaluate each file, in order, inside one shared
// vm context whose `window` is the context itself.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export function loadGlobals(files, extra = {}) {
  const sandbox = { console, Math, Date, JSON, Object, Array, String, Number, Set, Map, ...extra };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, '');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
}
