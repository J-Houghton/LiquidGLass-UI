// Post-build guard: the four package entries must exist, export their key symbols at runtime,
// ship non-empty declarations, and keep the custom-element tag map augmentation.
// Runs via `npm run build` (postbuild) and therefore in CI.
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const dist = resolve('dist');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const failures = [];

const entries = {
  '.': { runtime: ['attachLiquidGlass', 'createGlassFilter', 'detectGlassSupport', 'resolveGlassParams'], types: ['attachLiquidGlass', 'LiquidGlassHandle', 'GlassParams'] },
  './core': { runtime: ['displacementCurve', 'displacementMap', 'buildFilterSpec', 'filterSpecToSvg'], types: ['displacementMap', 'RGBAImage'] },
  './elements': { runtime: ['defineLiquidGlassElements', 'LiquidGlassElement', 'LiquidGlassFilterElement'], types: ['defineLiquidGlassElements', 'LiquidGlassElement', 'HTMLElementTagNameMap'] },
  './motion': { runtime: ['stepSpring', 'springPhysics', 'squashDeformation'], types: ['SpringState', 'SquashConfig'] },
};

for (const [name, want] of Object.entries(entries)) {
  const target = pkg.exports?.[name];
  if (!target?.import || !target?.types) {
    failures.push(`exports["${name}"] must declare both "types" and "import"`);
    continue;
  }
  if (Object.keys(target)[0] !== 'types') failures.push(`exports["${name}"]: "types" must be the first condition`);

  const js = resolve(target.import);
  const dts = resolve(target.types);
  for (const f of [js, dts]) if (!existsSync(f)) failures.push(`${name}: missing ${f}`);
  if (!existsSync(js) || !existsSync(dts)) continue;

  const mod = await import(pathToFileURL(js).href);
  for (const sym of want.runtime) if (!(sym in mod)) failures.push(`${name}: runtime export "${sym}" missing from ${target.import}`);

  const text = readFileSync(dts, 'utf8');
  if (text.trim() === 'export { }' || text.trim().length < 40) failures.push(`${name}: ${target.types} is empty`);
  const reachable = collectDeclarationText(dts, new Set());
  for (const sym of want.types) {
    if (!new RegExp(`\\b${sym}\\b`).test(reachable)) failures.push(`${name}: type "${sym}" not found via ${target.types}`);
  }
}

/** Concatenate a .d.ts and everything it re-exports/imports relatively (one package, no node_modules). */
function collectDeclarationText(file, seen) {
  if (seen.has(file) || !existsSync(file)) return '';
  seen.add(file);
  let text = readFileSync(file, 'utf8');
  const dir = resolve(file, '..');
  for (const m of text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const spec = m[1].replace(/\.js$/, '');
    for (const cand of [`${spec}.d.ts`, `${spec}/index.d.ts`]) {
      const p = resolve(dir, cand);
      if (existsSync(p)) {
        text += '\n' + collectDeclarationText(p, seen);
        break;
      }
    }
  }
  return text;
}

if (!existsSync(resolve(dist, 'index.d.ts'))) failures.push('dist/index.d.ts missing');
if (existsSync(resolve(dist, 'src'))) failures.push('dist/src/ exists: declaration entryRoot is wrong');

if (failures.length) {
  console.error('check-dist: FAILED');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('check-dist: OK (4 entries, runtime exports, non-empty declarations, tag map present)');
