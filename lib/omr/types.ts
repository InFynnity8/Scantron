/** Template spec - identical JSON format to the Python engine (backend/scantron_omr/template.py). */
export interface TemplateSpec {
  id: string;
  name: string;
  description?: string;
  printable?: boolean;
  page: { width: number; height: number };
  bubble_radius: number;
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
  options?: string;
  option_gap: number;
  item_gap: number;
  options_axis?: 'x' | 'y';
  allow_trailing_blank?: boolean;
}

export type Pt = { x: number; y: number };

export interface Item {
  key: string;
  label: string;
  options: string[];
  centers: Pt[];
}

export interface FieldDef {
  name: string;
  label: string;
  columns: Item[];
  allowTrailingBlank: boolean;
}

export interface CompiledTemplate {
  id: string;
  name: string;
  spec: TemplateSpec;
  width: number;
  height: number;
  radius: number;
  questions: Item[];
  fields: FieldDef[];
  /** marker id -> TL,TR,BR,BL corners in template px */
  markers: Map<number, Pt[]>;
}

export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
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
  imageSize?: { width: number; height: number };
  timingMs?: number;
}
