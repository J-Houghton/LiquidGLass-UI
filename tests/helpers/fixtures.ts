import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UPDATE = process.env.UPDATE_FIXTURES === '1';
const ROOT = fileURLToPath(new URL('../fixtures/', import.meta.url));

export type Json = number | string | boolean | null | Json[] | { [k: string]: Json };

/**
 * Compare `value` against the JSON fixture `tests/fixtures/<name>.json`, treating numbers as
 * equal when within `tol`. Fails if the fixture is missing. Run `UPDATE_FIXTURES=1 npm test`
 * to (re)generate fixtures; do that only in a commit that explains the intended change.
 */
export function expectToMatchFixture(name: string, value: Json, tol: number): void {
  const path = resolve(ROOT, `${name}.json`);
  if (UPDATE) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value) + '\n');
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`Fixture "${name}" is missing. Run UPDATE_FIXTURES=1 npm test to create it.`);
  }
  const expected = JSON.parse(readFileSync(path, 'utf8')) as Json;
  const diff = firstDifference(expected, value, tol, '$');
  if (diff) throw new Error(`Fixture "${name}" mismatch at ${diff}`);
}

function firstDifference(a: Json, b: Json, tol: number, path: string): string | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return null;
    return Math.abs(a - b) <= tol ? null : `${path}: expected ${a}, got ${b} (|delta| ${Math.abs(a - b)} > ${tol})`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], tol, `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.join() !== kb.join()) return `${path}: keys [${ka}] vs [${kb}]`;
    for (const k of ka) {
      const d = firstDifference(a[k], b[k], tol, `${path}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return Object.is(a, b) ? null : `${path}: expected ${JSON.stringify(a)}, got ${JSON.stringify(b)}`;
}
