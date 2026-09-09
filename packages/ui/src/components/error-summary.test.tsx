import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ErrorSummary, type FieldErrorItem } from './error-summary';

const ERRORS: FieldErrorItem[] = [
  { id: 'field-email', message: 'Email: is required' },
  { id: 'field-password', message: 'Password: is required' },
];

describe('ErrorSummary (COMP-SH-005)', () => {
  it('renders a linked item per error and takes focus when errors appear', () => {
    const { rerender } = render(<ErrorSummary title="Problems" errors={[]} />);
    expect(screen.queryByTestId('error-summary')).not.toBeInTheDocument();

    rerender(<ErrorSummary title="Problems" errors={ERRORS} />);
    const box = screen.getByTestId('error-summary');
    expect(box).toHaveFocus();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('does NOT re-steal focus on a re-render with the same errors (a fresh array each time)', () => {
    function Harness() {
      const [, setN] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setN((n) => n + 1)}>
            bump
          </button>
          <input aria-label="email" />
          {/* a new array identity on every render, same content — mirrors useFormErrors callers */}
          <ErrorSummary title="Problems" errors={ERRORS.map((e) => ({ ...e }))} />
        </div>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText('email');
    input.focus();
    expect(input).toHaveFocus();

    // a re-render that does not change the error content must leave the caret alone
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    expect(input).toHaveFocus();
    expect(screen.getByTestId('error-summary')).not.toHaveFocus();
  });
});
