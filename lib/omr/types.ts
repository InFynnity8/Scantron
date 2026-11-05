/** Template spec - identical JSON format to the Python engine (backend/scantron_omr/template.py). */
export interface TemplateSpec {
  id: string;
  name: string;
  description?: string;
  printable?: boolean;
  page: { width: number; height: number };
  bubble_radius: number;
  /** [width, height] of elongated option cells such as "<A>" brackets */
  bubble_size?: [number, number];
  /** colour channel used to read marks; "red" removes red/pink drop-out print */
  ink_channel?: 'gray' | 'red' | 'green' | 'blue';
  alignment:
    | { type: 'aruco'; dictionary?: string; markers: { id: number; x: number; y: number; size: number }[] }
    | { type: 'features'; reference: string }
    | { type: 'page' | 'none' };
  blocks: BlockSpec[];
  regions?: { name: string; label: string; bbox: [number, number, number, number] }[];
}

export interface BlockSpec {
  type: 'mcq' | 'id' | 'field';
  name?: string;
  field?: string;
  label?: string;
  origin: [number, number];
  first?: number;
  count: number;
  /** named set (digits/letters/alnum), a string of single characters, or a list of labels such as ["2024/25", ...] */
  options?: string | string[];
  option_gap: number;
  item_gap: number;
  options_axis?: 'x' | 'y';
  allow_trailing_blank?: boolean;
  /** this block's columns may be left empty anywhere in the code, e.g. course letters "BIT" + two empty + "466" */
  allow_blank?: boolean;
}

export type Pt = { x: number; y: number };

export interface Item {
  key: string;
  label: string;
  block: number;
  options: string[];
  centers: Pt[];
}

export interface Block {
  bbox: [number, number, number, number]; // x0, y0, x1, y1 in template px
  center: Pt;
}

export interface FieldDef {
  name: string;
  label: string;
  columns: Item[];
  allowTrailingBlank: boolean;
  /** per column: may be left empty anywhere in the code (block option allow_blank) */
  optional: boolean[];
}

export interface CompiledTemplate {
  id: string;
  name: string;
  spec: TemplateSpec;
  width: number;
  height: number;
  radius: number;
  rx: number;
  ry: number;
  inkChannel: 'gray' | 'red' | 'green' | 'blue';
  alignment: 'aruco' | 'features' | 'page' | 'none';
  blocks: Block[];
  questions: Item[];
  fields: FieldDef[];
  /** marker id -> TL,TR,BR,BL corners in template px */
  markers: Map<number, Pt[]>;
}

export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
  /** optional red channel (same size) for red drop-out sheets */
  red?: Uint8Array;
}

export type Status = 'answered' | 'blank' | 'multiple';

export interface ItemReading {
  label: string;
  marked: string[];
  status: Status;
  confidence: number;
  fills: number[];
  flags: string[];
}

export interface FieldReading {
  label: string;
  value: string | null;
  confidence: number;
  issues: string[];
  characters: ItemReading[];
}

export interface SheetStats {
  baseline: number;
  floor: number;
  global_threshold: number;
  jump: number;
}

/** Output of a scan (device or server) normalised to one shape. */
export interface ScanReading {
  templateId: string;
  engine: 'device' | 'server';
  questions: ItemReading[];
  fields: Record<string, FieldReading>;
  review: { needed: boolean; questions: string[]; reasons: string[] };
  warnings: string[];
  stats?: SheetStats;
  /** template px -> image px homography (row-major 3x3), device engine only */
  homography?: number[];
  /** residual per-block offsets in template px (marker-free sheets) */
  blockShifts?: Record<string, [number, number]>;
  imageSize?: { width: number; height: number };
  timingMs?: number;
}
