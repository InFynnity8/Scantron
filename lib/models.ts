import type { ItemReading } from './omr/types';

export interface ScoringPolicy {
  correct: number;
  wrong: number; // e.g. -0.25 for negative marking
  blank: number;
}

export const DEFAULT_SCORING: ScoringPolicy = { correct: 1, wrong: 0, blank: 0 };

export interface Exam {
  id: string;
  title: string;
  course: string;
  templateId: string; // built-in id, calibrated id (e.g. knust-60) or "auto"
  templateName: string;
  numQuestions: number;
  options: string[];
  /** One entry per question: accepted options ("B", "AC") or "" = not graded. */
  key: string[];
  scoring: ScoringPolicy;
  passMark: number; // percentage
  createdAt: number;
  updatedAt: number;
}

export interface SheetField {
  label: string;
  value: string | null;
  confidence: number;
  /** option read in each column (null = blank/unclear); used to draw the marks */
  marks?: (string | null)[];
}

export interface Sheet {
  id: string;
  examId: string;
  createdAt: number;
  templateId: string;
  engine: 'device' | 'server';
  studentId: string | null;
  studentIdConfidence: number;
  idOverride?: string;
  fields: Record<string, SheetField>;
  answers: ItemReading[];
  /** manual corrections: question label -> chosen options ([] = blank) */
  overrides: Record<string, string[]>;
  reviewReasons: string[];
  reviewed: boolean;
  warnings: string[];
  photoUri?: string;
  annotatedUri?: string;
  regionUris?: Record<string, { label: string; uri: string }>;
  homography?: number[];
  blockShifts?: Record<string, [number, number]>;
  imageSize?: { width: number; height: number };
}

export function effectiveStudentId(s: Sheet): string | null {
  return s.idOverride?.trim() || s.studentId;
}

export function needsReview(s: Sheet): boolean {
  return !s.reviewed && s.reviewReasons.length > 0;
}
