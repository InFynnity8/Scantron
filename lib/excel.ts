import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

import { examStats, gradeSheet, itemAnalysis } from './grading';
import { effectiveStudentId, type Exam, type Sheet } from './models';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'Results';
}

function widths(rows: (string | number | null)[][]): XLSX.ColInfo[] {
  const n = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: n }, (_, c) => ({
    wch: Math.min(40, Math.max(6, ...rows.map((r) => String(r[c] ?? '').length + 2))),
  }));
}

function sheetFromRows(rows: (string | number | null)[][], freezeRows = 1, freezeCols = 0): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths(rows);
  if (rows.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  (ws as any)['!freeze'] = { xSplit: freezeCols, ySplit: freezeRows };
  return ws;
}

/** Build the workbook (exported separately so it can be unit tested). */
export function buildWorkbook(exam: Exam, sheets: Sheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ordered = [...sheets].sort((a, b) => (effectiveStudentId(a) ?? '').localeCompare(effectiveStudentId(b) ?? ''));
  const fieldNames = [...new Set(sheets.flatMap((s) => Object.keys(s.fields)))].filter((f) => f !== 'index_number');
  const fieldLabels = fieldNames.map((f) => sheets.find((s) => s.fields[f])?.fields[f].label ?? f);
  const qCols = Array.from({ length: exam.numQuestions }, (_, i) => `Q${i + 1}`);

  // 1. Results - one row per student
  const header = [
    'Index Number',
    ...fieldLabels,
    'Score',
    'Max',
    'Percentage',
    'Result',
    'Correct',
    'Wrong',
    'Blank',
    'Multiple',
    'Needs review',
    'Corrected by hand',
    'Scanned at',
    ...qCols,
  ];
  const rows: (string | number | null)[][] = [header];
  for (const s of ordered) {
    const g = gradeSheet(exam, s);
    rows.push([
      effectiveStudentId(s) ?? '',
      ...fieldNames.map((f) => s.fields[f]?.value ?? ''),
      g.score,
      g.max,
      g.percentage,
      g.passed == null ? '' : g.passed ? 'Pass' : 'Fail',
      g.counts.correct,
      g.counts.wrong,
      g.counts.blank,
      g.counts.multiple,
      !s.reviewed && s.reviewReasons.length ? 'Yes' : 'No',
      Object.keys(s.overrides).length || s.idOverride ? 'Yes' : 'No',
      new Date(s.createdAt).toLocaleString(),
      ...g.questions.map((q) => q.marked.join('/')),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 1, 1), 'Results');

  // 2. Answer key
  const keyRows: (string | number)[][] = [['Question', 'Correct answer(s)']];
  exam.key.slice(0, exam.numQuestions).forEach((k, i) => keyRows.push([i + 1, k ? k.split('').join(' or ') : '(not graded)']));
  XLSX.utils.book_append_sheet(wb, sheetFromRows(keyRows), 'Answer Key');

  // 3. Item analysis
  const items = itemAnalysis(exam, sheets);
  const iaRows: (string | number | null)[][] = [
    ['Question', 'Key', '% Correct', 'Discrimination', ...exam.options.map((o) => `Chose ${o}`), 'Blank', 'Multiple', 'Comment'],
  ];
  for (const it of items) {
    let comment = '';
    if (it.pCorrect != null) {
      if (it.pCorrect < 0.3) comment = 'Very hard - check the key';
      else if (it.pCorrect > 0.9) comment = 'Very easy';
      if (it.discrimination != null && it.discrimination < 0) comment = 'Negative discrimination - check the key/wording';
    }
    iaRows.push([
      Number(it.label),
      it.key,
      it.pCorrect == null ? null : Math.round(it.pCorrect * 1000) / 10,
      it.discrimination == null ? null : Math.round(it.discrimination * 100) / 100,
      ...exam.options.map((o) => it.optionCounts[o] ?? 0),
      it.blank,
      it.multiple,
      comment,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, sheetFromRows(iaRows), 'Item Analysis');

  // 4. Summary
  const st = examStats(exam, sheets);
  const summary: (string | number | null)[][] = [
    ['Exam', exam.title],
    ['Course', exam.course],
    ['Sheet type', exam.templateName],
    ['Questions', exam.numQuestions],
    ['Scoring', `+${exam.scoring.correct} correct, ${exam.scoring.wrong} wrong, ${exam.scoring.blank} blank`],
    ['Pass mark (%)', exam.passMark],
    ['Sheets graded', st.count],
    ['Mean (%)', st.mean],
    ['Median (%)', st.median],
    ['Std deviation', st.stdev],
    ['Highest (%)', st.high],
    ['Lowest (%)', st.low],
    ['Pass rate (%)', st.passRate],
    ['Sheets needing review', st.needsReview],
    ['Exported', new Date().toLocaleString()],
  ];
  const ws = XLSX.utils.aoa_to_sheet(summary);
  ws['!cols'] = [{ wch: 24 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  return wb;
}

export async function exportExamToExcel(exam: Exam, sheets: Sheet[]): Promise<string> {
  const wb = buildWorkbook(exam, sheets);
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
  const dir = `${FileSystem.documentDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const uri = `${dir}${safeName(exam.course || exam.title)}_${safeName(exam.title)}_${stamp}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle: `Export ${exam.title}`, UTI: 'org.openxmlformats.spreadsheetml.sheet' });
  }
  return uri;
}
