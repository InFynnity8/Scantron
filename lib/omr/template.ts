import type { BlockSpec, CompiledTemplate, FieldDef, Item, Pt, TemplateSpec } from './types';

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const INDEX_FIELD = 'index_number';

function alphabet(v: string | undefined, fallback: string): string[] {
  const named: Record<string, string> = { digits: DIGITS, letters: LETTERS, alnum: LETTERS + DIGITS };
  return (v === undefined ? fallback : named[v] ?? v).split('');
}

/** Port of scantron_omr.template.template_from_spec (geometry only). */
export function compileTemplate(spec: TemplateSpec): CompiledTemplate {
  const questions: Item[] = [];
  const fields = new Map<string, FieldDef>();

  spec.blocks.forEach((b: BlockSpec) => {
    let kind: 'mcq' | 'field';
    let fname: string | null = null;
    let flabel = '';
    let options: string[];
    if (b.type === 'id') {
      kind = 'field';
      fname = b.field ?? INDEX_FIELD;
      flabel = b.label ?? 'Index number';
      options = alphabet(b.options, DIGITS);
    } else if (b.type === 'field') {
      kind = 'field';
      fname = b.field!;
      flabel = b.label ?? fname;
      options = alphabet(b.options, DIGITS);
    } else {
      kind = 'mcq';
      options = alphabet(b.options, 'ABCDE');
    }
    const axis = b.options_axis ?? (kind === 'mcq' ? 'x' : 'y');
    const [ox, oy] = b.origin;
    if (fname && !fields.has(fname)) {
      fields.set(fname, { name: fname, label: flabel, columns: [], allowTrailingBlank: b.allow_trailing_blank ?? true });
    }
    for (let i = 0; i < b.count; i++) {
      const centers: Pt[] = options.map((_, j) =>
        axis === 'x'
          ? { x: ox + j * b.option_gap, y: oy + i * b.item_gap }
          : { x: ox + i * b.item_gap, y: oy + j * b.option_gap },
      );
      if (kind === 'mcq') {
        const n = (b.first ?? 1) + i;
        questions.push({ key: `q${n}`, label: String(n), options, centers });
      } else {
        const f = fields.get(fname!)!;
        const pos = f.columns.length;
        f.columns.push({ key: `${fname}:${pos}`, label: String(pos + 1), options, centers });
      }
    }
  });
  questions.sort((a, b) => Number(a.label) - Number(b.label));

  const markers = new Map<number, Pt[]>();
  if (spec.alignment.type === 'aruco') {
    for (const m of spec.alignment.markers) {
      markers.set(m.id, [
        { x: m.x, y: m.y },
        { x: m.x + m.size, y: m.y },
        { x: m.x + m.size, y: m.y + m.size },
        { x: m.x, y: m.y + m.size },
      ]);
    }
  }
  return {
    id: spec.id,
    name: spec.name,
    spec,
    width: spec.page.width,
    height: spec.page.height,
    radius: spec.bubble_radius,
    questions,
    fields: [...fields.values()],
    markers,
  };
}
