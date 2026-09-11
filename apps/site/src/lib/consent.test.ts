import type { ConsentChoices } from '@carrental/contracts';
import { describe, expect, it } from 'vitest';

import { isWithdrawal } from './consent';

const choices = (overrides: Partial<ConsentChoices> = {}): ConsentChoices => ({
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
  ...overrides,
});

describe('isWithdrawal — the frontend half of the "withdraw consent at any time" promise made in the privacy/cookie policy copy', () => {
  it('is never a withdrawal before the visitor has ever decided — nothing granted to take back', () => {
    expect(isWithdrawal(false, choices(), choices({ functional: true }))).toBe(false);
    expect(isWithdrawal(false, choices({ functional: true }), choices())).toBe(false);
  });

  it('turning an already-granted optional category off, having already decided, is a withdrawal', () => {
    expect(isWithdrawal(true, choices({ analytics: true }), choices({ analytics: false }))).toBe(
      true,
    );
  });

  it('rejecting everything after previously accepting everything is a withdrawal', () => {
    const all = choices({ functional: true, analytics: true, marketing: true });
    expect(isWithdrawal(true, all, choices())).toBe(true);
  });

  it('partially reducing consent (one category off, others left alone) still counts as a withdrawal', () => {
    const some = choices({ functional: true, analytics: true });
    expect(isWithdrawal(true, some, choices({ functional: true, analytics: false }))).toBe(true);
  });

  it('is not a withdrawal when consent only increases', () => {
    expect(isWithdrawal(true, choices(), choices({ functional: true, analytics: true }))).toBe(
      false,
    );
  });

  it('is not a withdrawal when nothing changes', () => {
    const same = choices({ functional: true });
    expect(isWithdrawal(true, same, { ...same })).toBe(false);
  });

  it('the necessary category is always on and never itself drives a withdrawal classification', () => {
    expect(isWithdrawal(true, choices(), choices())).toBe(false);
  });
});
