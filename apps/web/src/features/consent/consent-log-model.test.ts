import type { ConsentLogEntry } from '@carrental/contracts';
import { describe, expect, it } from 'vitest';

import { consentLogCsv, consentLogQuery } from './consent-log-model';

describe('consent-log-model', () => {
  it('includes the end date as a whole day', () => {
    expect(
      consentLogQuery({ from: '2026-01-01', to: '2026-01-31', action: '', visitor: ' v1 ' }),
    ).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
      action: undefined,
      anonymousId: 'v1',
    });
  });

  it('writes formula-safe rows', () => {
    const rows = [
      {
        id: '1',
        at: '2026-01-01T00:00:00Z',
        anonymousId: 'abc',
        action: 'accept_all',
        choices: { functional: true, analytics: false, marketing: false },
        policyVersion: 2,
        staleVersion: false,
        locale: 'en',
        page: '=HYPERLINK("x")',
        ipPrefix: null,
      },
    ] as unknown as ConsentLogEntry[];
    const [head, line] = consentLogCsv(rows).split('\n');
    expect(head).toContain('anonymousId');
    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
