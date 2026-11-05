/**
 * Accuracy test for the on-device OMR engine (lib/omr) using the exact
 * JPEG -> jpeg-js -> grayscale path the app uses.
 *
 *   npm run test:engine      (needs Python with backend/requirements.txt to make fixtures)
 *
 * Env: PYTHON (interpreter), COUNT (number of synthetic sheets, default 24).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'omr-'));
const venvWin = join(root, 'backend/.venv/Scripts/python.exe');
const venvNix = join(root, 'backend/.venv/bin/python');
const python = process.env.PYTHON ?? (existsSync(venvWin) ? venvWin : existsSync(venvNix) ? venvNix : 'python3');

// 1. Fixtures: synthetic phone photos with known answers.
const fixtures = join(work, 'fixtures');
execFileSync(python, [join(root, 'backend/scripts/make_device_fixtures.py'), fixtures, '--count', process.env.COUNT ?? '24'], {
  stdio: 'inherit',
  cwd: join(root, 'backend'),
});

// 2. Copy the engine with explicit .ts import specifiers (Node type stripping).
const src = join(work, 'omr');
cpSync(join(root, 'lib/omr'), src, { recursive: true });
for (const f of readdirSync(src)) {
  const p = join(src, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1.ts'"));
}
writeFileSync(join(src, 'package.json'), '{"type":"module"}');

const { scanGray } = await import(pathToFileURL(join(src, 'engine.ts')).href);
const jpeg = createRequire(import.meta.url)('jpeg-js');

const cases = JSON.parse(readFileSync(join(fixtures, 'cases.json'), 'utf8'));
let questions = 0;
let errors = 0;
let failed = 0;
let idOk = 0;
let ms = 0;
for (const c of cases) {
  const raw = jpeg.decode(readFileSync(join(fixtures, c.file)), { useTArray: true, formatAsRGBA: false });
  const gray = new Uint8Array(raw.width * raw.height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 3) gray[i] = (raw.data[j] * 77 + raw.data[j + 1] * 150 + raw.data[j + 2] * 29) >> 8;
  try {
    const r = scanGray({ width: raw.width, height: raw.height, data: gray });
    if (r.templateId !== c.template) throw new Error(`template ${r.templateId} != ${c.template}`);
    ms += r.timingMs;
    const bad = r.questions.filter((q) => JSON.stringify([...q.marked].sort()) !== JSON.stringify(c.answers[q.label]));
    questions += r.questions.length;
    errors += bad.length;
    if (r.fields.index_number?.value === c.id) idOk++;
    else console.log(`  ${c.file}: index ${r.fields.index_number?.value} != ${c.id}`);
    for (const q of bad) console.log(`  ${c.file}: Q${q.label} read ${q.marked} expected ${c.answers[q.label]}`);
  } catch (e) {
    failed++;
    console.log(`  ${c.file}: FAILED ${e.message}`);
  }
}
console.log({
  sheets: cases.length,
  failed,
  questions,
  errors,
  indexAccuracy: idOk / cases.length,
  avgScanMs: Math.round(ms / Math.max(1, cases.length - failed)),
});
process.exit(failed || errors || idOk !== cases.length ? 1 : 0);
