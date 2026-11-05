import type { Exam, Sheet } from './models';

export type QuestionResult = 'correct' | 'wrong' | 'blank' | 'multiple' | 'ungraded';

export interface GradedQuestion {
  label: string;
  marked: string[];
  key: string[];
  result: QuestionResult;
  points: number;
  overridden: boolean;
  flags: string[];
  confidence: number;
}

export interface GradeSummary {
  score: number;
  max: number;
  percentage: number | null;
  passed: boolean | null;
  counts: Record<QuestionResult, number>;
  questions: GradedQuestion[];
}

export function keyOptions(entry: string | undefined): string[] {
  return (entry ?? '').split('').filter(Boolean);
}

/** Grades a sheet against the exam's current key (so key edits re-grade instantly). */
export function gradeSheet(exam: Exam, sheet: Sheet): GradeSummary {
  const counts: Record<QuestionResult, number> = { correct: 0, wrong: 0, blank: 0, multiple: 0, ungraded: 0 };
  const byLabel = new Map(sheet.answers.map((a) => [a.label, a]));
  const questions: GradedQuestion[] = [];
  let score = 0;
  let max = 0;
  for (let i = 0; i < exam.numQuestions; i++) {
    const label = String(i + 1);
    const reading = byLabel.get(label);
    const overridden = label in sheet.overrides;
    const marked = overridden ? sheet.overrides[label] : reading?.marked ?? [];
    const key = keyOptions(exam.key[i]);
    let result: QuestionResult;
    let points = 0;
    if (!key.length) {
      result = 'ungraded';
    } else {
      max += exam.scoring.correct;
      if (marked.length === 0) {
        result = 'blank';
        points = exam.scoring.blank;
      } else if (marked.length > 1) {
        result = 'multiple';
        points = exam.scoring.wrong;
      } else if (key.includes(marked[0])) {
        result = 'correct';
        points = exam.scoring.correct;
      } else {
        result = 'wrong';
        points = exam.scoring.wrong;
      }
    }
    counts[result]++;
    score += points;
    questions.push({
      label,
      marked,
      key,
      result,
      points,
      overridden,
      flags: overridden ? [] : reading?.flags ?? [],
      confidence: overridden ? 1 : reading?.confidence ?? 0,
    });
  }
  const percentage = max > 0 ? Math.round((1000 * score) / max) / 10 : null;
  return {
    score: Math.round(score * 100) / 100,
    max,
    percentage,
    passed: percentage == null ? null : percentage >= exam.passMark,
    counts,
    questions,
  };
}

export interface ExamStats {
  count: number;
  mean: number | null;
  median: number | null;
  stdev: number | null;
  high: number | null;
  low: number | null;
  passRate: number | null;
  needsReview: number;
}

export function examStats(exam: Exam, sheets: Sheet[]): ExamStats {
  const pcts = sheets
    .map((s) => gradeSheet(exam, s).percentage)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  const n = pcts.length;
  const needsReview = sheets.filter((s) => !s.reviewed && s.reviewReasons.length > 0).length;
  if (!n) return { count: sheets.length, mean: null, median: null, stdev: null, high: null, low: null, passRate: null, needsReview };
  const mean = pcts.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? pcts[(n - 1) / 2] : (pcts[n / 2 - 1] + pcts[n / 2]) / 2;
  const stdev = Math.sqrt(pcts.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return {
    count: sheets.length,
    mean: round1(mean),
    median: round1(median),
    stdev: round1(stdev),
    high: pcts[n - 1],
    low: pcts[0],
    passRate: round1((100 * pcts.filter((p) => p >= exam.passMark).length) / n),
    needsReview,
  };
}

export interface ItemStat {
  label: string;
  key: string;
  pCorrect: number | null; // difficulty index (0-1)
  discrimination: number | null; // upper 27% minus lower 27%
  optionCounts: Record<string, number>;
  blank: number;
  multiple: number;
}

/** Classical item analysis (difficulty + discrimination), as used in exam boards. */
export function itemAnalysis(exam: Exam, sheets: Sheet[]): ItemStat[] {
  const graded = sheets.map((s) => gradeSheet(exam, s));
  const order = graded
    .map((g, i) => ({ i, pct: g.percentage ?? 0 }))
    .sort((a, b) => b.pct - a.pct)
    .map((x) => x.i);
  const k = Math.max(1, Math.round(order.length * 0.27));
  const upper = new Set(order.slice(0, k));
  const lower = new Set(order.slice(-k));
  return Array.from({ length: exam.numQuestions }, (_, qi) => {
    const optionCounts: Record<string, number> = Object.fromEntries(exam.options.map((o) => [o, 0]));
    let correct = 0;
    let gradedN = 0;
    let blank = 0;
    let multiple = 0;
    let up = 0;
    let lo = 0;
    graded.forEach((g, si) => {
      const q = g.questions[qi];
      if (q.marked.length === 1) optionCounts[q.marked[0]] = (optionCounts[q.marked[0]] ?? 0) + 1;
      if (q.result === 'blank') blank++;
      if (q.result === 'multiple') multiple++;
      if (q.result !== 'ungraded') {
        gradedN++;
        if (q.result === 'correct') {
          correct++;
          if (upper.has(si)) up++;
          if (lower.has(si)) lo++;
        }
      }
    });
    const hasKey = !!exam.key[qi];
    return {
      label: String(qi + 1),
      key: exam.key[qi] ?? '',
      pCorrect: hasKey && gradedN ? correct / gradedN : null,
      discrimination: hasKey && graded.length >= 4 ? (up - lo) / k : null,
      optionCounts,
      blank,
      multiple,
    };
  });
}

const round1 = (x: number) => Math.round(x * 10) / 10;
