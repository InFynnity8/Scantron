import { useEffect, useState } from 'react';

import { fetchTemplates, type TemplateSummary } from './api';
import { BUILTIN_TEMPLATES } from './omr/generated';
import { getTemplate } from './omr/engine';

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  numQuestions: number;
  options: string[];
  idDigits: number;
  printable: boolean;
  offline: boolean; // readable on the phone without internet
  downloadable: boolean; // becomes offline once its template is downloaded
}

export const AUTO_TEMPLATE: TemplateOption = {
  id: 'auto',
  name: 'Any other sheet (auto-detect)',
  description: 'Finds bubbles on any simple MCQ sheet. Needs internet; no index number.',
  numQuestions: 100,
  options: ['A', 'B', 'C', 'D', 'E'],
  idDigits: 0,
  printable: false,
  offline: false,
  downloadable: false,
};

/**
 * Sheet types offered in the app: the KNUST IDL sheet (server template) and the
 * printable KNUST-layout sheet. The older standard sheets and auto-detect stay
 * in the engine so existing exams keep working, but are no longer offered.
 */
const OFFERED = (id: string) => id.startsWith('uni-') || id.startsWith('knust-');

function builtinOptions(all = false): TemplateOption[] {
  return BUILTIN_TEMPLATES.filter((t) => all || OFFERED(t.id)).map((t) => {
    const mcq = t.blocks.filter((b) => b.type === 'mcq');
    const idb = t.blocks.filter((b) => b.type === 'id');
    return {
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      numQuestions: mcq.reduce((s, b) => s + b.count, 0),
      options: getTemplate(t).questions[0]?.options ?? ['A', 'B', 'C', 'D', 'E'],
      idDigits: idb.reduce((s, b) => s + b.count, 0),
      printable: true,
      offline: true,
      downloadable: false,
    };
  });
}

function fromServer(t: TemplateSummary): TemplateOption {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    numQuestions: t.num_questions,
    options: t.options,
    idDigits: t.id_digits,
    printable: t.printable,
    offline: false,
    downloadable: t.alignment === 'features' || t.alignment === 'page',
  };
}

/**
 * KNUST IDL (server template, downloaded once for offline use) and the printable
 * KNUST-layout sheet. `keepId` keeps an existing exam's older sheet type selectable.
 */
export function useTemplateOptions(keepId?: string): { options: TemplateOption[]; loading: boolean; error: string | null } {
  const [server, setServer] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTemplates()
      .then((ts) => alive && setServer(ts.map(fromServer)))
      .catch((e) => alive && setError(e?.message ?? 'offline'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  const builtins = builtinOptions();
  const ids = new Set(builtins.map((b) => b.id));
  const extra = server.filter((s) => !ids.has(s.id) && OFFERED(s.id));
  const options = [...extra, ...builtins];
  if (keepId && !options.some((o) => o.id === keepId)) {
    const old = keepId === 'auto' ? AUTO_TEMPLATE : [...builtinOptions(true), ...server].find((o) => o.id === keepId);
    if (old) options.push(old);
  }
  return { options, loading, error };
}

export function builtinTemplateOptions(): TemplateOption[] {
  return builtinOptions();
}
