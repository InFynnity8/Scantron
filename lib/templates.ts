import { useEffect, useState } from 'react';

import { fetchTemplates, type TemplateSummary } from './api';
import { BUILTIN_TEMPLATES } from './omr/generated';

export interface TemplateOption {
  id: string;
  name: string;
  description: string;
  numQuestions: number;
  options: string[];
  idDigits: number;
  printable: boolean;
  offline: boolean; // readable on the phone without internet
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
};

function builtinOptions(): TemplateOption[] {
  return BUILTIN_TEMPLATES.map((t) => {
    const mcq = t.blocks.filter((b) => b.type === 'mcq');
    const idb = t.blocks.filter((b) => b.type === 'id');
    return {
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      numQuestions: mcq.reduce((s, b) => s + b.count, 0),
      options: (mcq[0]?.options ?? 'ABCDE').split(''),
      idDigits: idb.reduce((s, b) => s + b.count, 0),
      printable: true,
      offline: true,
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
  };
}

/** Built-in sheets (always available) + server templates (e.g. calibrated KNUST sheets) + auto. */
export function useTemplateOptions(): { options: TemplateOption[]; loading: boolean; error: string | null } {
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
  const extra = server.filter((s) => !ids.has(s.id));
  // Institution sheets first - they're what most users scan.
  return { options: [...extra, ...builtins, AUTO_TEMPLATE], loading, error };
}

export function builtinTemplateOptions(): TemplateOption[] {
  return builtinOptions();
}
