import type { WorkflowSpec } from '@carrental/contracts';
import { validateWorkflowGraph } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';

import { parseSpec } from './model';

import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Export the pipeline as a JSON file, or paste / choose one to load it into the editor. Nothing is saved until you save. */
export function ImportExport({
  name,
  code,
  spec,
  canEdit,
  onLoad,
}: {
  name: string;
  code: string;
  spec: WorkflowSpec;
  canEdit: boolean;
  onLoad: (spec: WorkflowSpec) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ name, code, spec }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${code || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const load = () => {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setProblems([t('ops.wfb.importNotJson')]);
      return;
    }
    // accept either the exported wrapper or a bare spec
    const candidate =
      raw && typeof raw === 'object' && 'spec' in raw ? (raw as { spec: unknown }).spec : raw;
    const parsed = parseSpec(candidate);
    if ('error' in parsed) {
      setProblems([parsed.error]);
      return;
    }
    const graph = validateWorkflowGraph(parsed.spec);
    if (graph.length) {
      setProblems(graph.map((g) => g.message));
      return;
    }
    setProblems([]);
    setText('');
    onLoad(parsed.spec); // nothing partial: it either loads whole or not at all
  };

  return (
    <SectionCard
      title={t('ops.wfb.importTitle')}
      description={t('ops.wfb.importBody')}
      data-testid="import-export"
    >
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={exportFile}>
          <Download aria-hidden="true" />
          {t('ops.wfb.export')}
        </Button>
      </div>
      {canEdit ? (
        <div className="mt-5 space-y-3">
          <Label htmlFor="wf-import">{t('ops.wfb.importLabel')}</Label>
          <Textarea
            id="wf-import"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir="ltr"
            className="font-mono text-xs"
            data-testid="import-text"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={load} disabled={!text.trim()} data-testid="import-load">
              <Upload aria-hidden="true" />
              {t('ops.wfb.importLoad')}
            </Button>
            <label className="cursor-pointer text-sm text-primary underline-offset-2 hover:underline">
              {t('ops.wfb.importFile')}
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setText(await f.text());
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {problems.length ? (
            <ul className="space-y-1 text-sm text-destructive" role="alert">
              {problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
