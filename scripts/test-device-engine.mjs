/**
 * Accuracy test for the on-device OMR engine (lib/omr) using the exact
 * JPEG -> jpeg-js -> grayscale/red path the app uses.
 *
 *   npm run test:engine      (needs Python with backend/requirements.txt to make fixtures)
 *
 * Suites:
 *   markers - printed Scantron sheets (ArUco), live-preview resolution (760 px)
 *   knust   - marker-free KNUST-style sheets (paper edges + reference registration, red drop-out)
 *   idl     - the real KNUST IDL template (backend/templates/knust-idl-200): answers + all header fields
 *
 * Env: PYTHON (interpreter), COUNT (sheets per suite, default 16).
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
const count = process.env.COUNT ?? '16';

function fixtures(name, args) {
  const dir = join(work, name);
  execFileSync(python, [join(root, 'backend/scripts/make_device_fixtures.py'), dir, '--count', count, ...args], {
    stdio: 'inherit',
    cwd: join(root, 'backend'),
  });
  return dir;
}

// Copy the engine with explicit .ts import specifiers (Node type stripping).
const src = join(work, 'omr');
cpSync(join(root, 'lib/omr'), src, { recursive: true });
for (const f of readdirSync(src)) {
  const p = join(src, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1.ts'"));
}
writeFileSync(join(src, 'package.json'), '{"type":"module"}');
const { scanGray, getTemplate } = await import(pathToFileURL(join(src, 'engine.ts')).href);
const jpeg = createRequire(import.meta.url)('jpeg-js');

function decode(file) {
  const raw = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: false });
  const n = raw.width * raw.height;
  const data = new Uint8Array(n);
  const red = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    data[i] = (raw.data[j] * 77 + raw.data[j + 1] * 150 + raw.data[j + 2] * 29) >> 8;
    red[i] = raw.data[j];
  }
  return { width: raw.width, height: raw.height, data, red };
}

function run(name, dir, opts) {
  const cases = JSON.parse(readFileSync(join(dir, 'cases.json'), 'utf8'));
  let questions = 0;
  let errors = 0;
  let flaggedWrong = 0;
  let failed = 0;
  let idOk = 0;
  let ms = 0;
  for (const c of cases) {
    const img = decode(join(dir, c.file));
    try {
      const r = scanGray(img, opts);
      if (r.templateId !== c.template) throw new Error(`template ${r.templateId} != ${c.template}`);
      ms += r.timingMs;
      const wrong = r.questions.filter((q) => JSON.stringify([...q.marked].sort()) !== JSON.stringify([...c.answers[q.label]].sort()));
      // A wrong reading that is flagged goes to human review in the app; only silent errors fail.
      const bad = wrong.filter((q) => !q.flags.length);
      flaggedWrong += wrong.length - bad.length;
      questions += r.questions.length;
      errors += bad.length;
      if (r.fields.index_number?.value === c.id) idOk++;
      else console.log(`  ${c.file}: index ${r.fields.index_number?.value} != ${c.id}`);
      for (const q of bad.slice(0, 5)) console.log(`  ${c.file}: Q${q.label} read ${q.marked} expected ${c.answers[q.label]}`);
      for (const [k, v] of Object.entries(c.fields ?? {})) {
        if ((r.fields[k]?.value ?? null) !== v) {
          errors++;
          console.log(`  ${c.file}: ${k} ${r.fields[k]?.value} != ${v}`);
        }
      }
    } catch (e) {
      failed++;
      console.log(`  ${c.file}: FAILED ${e.message}`);
    }
  }
  const summary = { suite: name, sheets: cases.length, failed, questions, errors, flaggedWrong, indexAccuracy: idOk / cases.length, avgScanMs: Math.round(ms / Math.max(1, cases.length - failed)) };
  console.log(summary);
  return failed === 0 && errors === 0 && idOk === cases.length;
}

const okMarkers = run('markers', fixtures('markers', ['--width', '760']), {});

const kdir = fixtures('knust', ['--knust-sim', '--width', process.env.KNUST_WIDTH ?? '1400']);
const template = getTemplate(JSON.parse(readFileSync(join(kdir, 'template.json'), 'utf8')));
const refRaw = decode(join(kdir, 'reference.jpg'));
const okKnust = run('knust', kdir, { custom: { template, reference: { width: refRaw.width, height: refRaw.height, data: refRaw.data } } });

const idir = fixtures('idl', ['--knust-idl', '--width', '1600']);
const idlTemplate = getTemplate(JSON.parse(readFileSync(join(idir, 'template.json'), 'utf8')));
const idlRef = decode(join(idir, 'reference.jpg'));
const okIdl = run('idl', idir, { custom: { template: idlTemplate, reference: { width: idlRef.width, height: idlRef.height, data: idlRef.data } } });

process.exit(okMarkers && okKnust && okIdl ? 0 : 1);
