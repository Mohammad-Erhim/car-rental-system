import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DecisionDialog } from './decision-dialog';

import type { WorkflowDecision } from '@/lib/workflow-hooks';

const show = (decision: WorkflowDecision, requireComment: boolean) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <I18nProvider initialLocale="en">
      <DecisionDialog
        open
        onOpenChange={() => undefined}
        decision={decision}
        subject="policy · cancellation"
        requireComment={requireComment}
        onSubmit={onSubmit}
      />
    </I18nProvider>,
  );
  return onSubmit;
};

describe('DecisionDialog', () => {
  it('approving needs no comment, even when the step asks for one on rejection', async () => {
    const onSubmit = show('approve', true);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(''));
  });

  it('rejecting is refused until a comment is given, when the step requires one', async () => {
    const onSubmit = show('reject', true);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText(/comment .* required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('wf-comment'), { target: { value: '  wrong figure ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('wrong figure'));
  });

  it('rejecting without a required comment is allowed when the step does not require one', async () => {
    const onSubmit = show('reject', false);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(''));
  });
});
