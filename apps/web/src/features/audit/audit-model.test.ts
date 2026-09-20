import { describe, expect, it } from 'vitest';

import { csvCell, PAGE, shortId, shownRange, toCsv, toQuery } from './audit-model';

import type { AuditRow } from '@/lib/admin-hooks';

describe('audit-model', () => {
  it('quotes cells and doubles inner quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });

  it('defuses spreadsheet formulas', () => {
    for (const bad of ['=SUM(A1)', '+1', '-2', '@cmd']) expect(csvCell(bad)).toBe(`"'${bad}"`);
    expect(csvCell('safe=value')).toBe('"safe=value"');
  });

  it('writes a header and one line per row', () => {
    const rows = [
      {
        occurredAt: '2026-01-01T00:00:00Z',
        actor: '=evil',
        actorId: 'a1',
        action: 'x.y',
        targetType: null,
        targetId: null,
        outcome: 'accepted',
        reason: null,
        surface: 'app-ops',
      },
    ] as unknown as AuditRow[];
    const lines = toCsv(rows).split('\n');
    expect(lines[0]).toBe(
      'occurredAt,actor,actorId,action,targetType,targetId,outcome,reason,surface',
    );
    expect(lines[1]).toContain(`"'=evil"`);
  });

  it('widens dates to whole UTC days and drops blanks', () => {
    expect(
      toQuery({ from: '2026-03-01', to: '2026-03-02', action: '', outcome: 'failed' }),
    ).toMatchObject({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-02T23:59:59.999Z',
      action: undefined,
      outcome: 'failed',
    });
  });

  it('derives the shown range from the pages behind', () => {
    expect(shownRange(0, 50)).toEqual({ from: 1, to: 50 });
    expect(shownRange(2, 7)).toEqual({ from: 2 * PAGE + 1, to: 2 * PAGE + 7 });
  });

  it('shortens a uuid but shows a readable key whole', () => {
    expect(shortId('6dc218e4-1111-4222-8333-444455556666')).toBe('6dc218e4');
    expect(shortId('data_quality_sweep')).toBe('data_quality_sweep');
  });
});
