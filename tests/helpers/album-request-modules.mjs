import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
/** Run trusted repository server modules with explicit I/O doubles, never log strings. */
export function requestModules(overrides = {}) {
  const cache = new Map();
  function load(file) {
    const full = path.resolve(file);
    if (cache.has(full)) return cache.get(full);
    const exports = {};
    cache.set(full, exports);
    const source = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(source, { exports, process, console, performance, require(name) {
      if (name in overrides) return overrides[name];
      if (name === 'server-only') return {};
      const target = name.startsWith('@/') ? name.slice(2) : path.resolve(path.dirname(full), name);
      const candidate = [target, target+'.ts', target+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
      if (candidate) return load(candidate);
      throw new Error('Unmocked dependency: '+name);
    } }, { filename: full });
    return exports;
  }
  return load;
}
