import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './toast';

function Harness() {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast({ title: 'Saved' })}>
      fire
    </button>
  );
}

// Note on coverage: this only verifies the wiring (a toast auto-dismisses via
// `ToastPrimitive.Root`'s own `duration`/`onOpenChange`). It does NOT attempt to also assert the
// hover/focus *pause* behaviour itself — that lives entirely inside `@radix-ui/react-toast` and
// depends on its internal pointer-tracking state, which isn't reliably reproducible by firing
// synthetic `pointerenter`/`pointermove` events under jsdom + fake timers (tried; flaky/false-
// negative). The fix here is precisely routing dismissal through Radix's own timer instead of a
// parallel `setTimeout` so that Radix's own (separately-tested) pause logic actually applies —
// see the comments in toast.tsx.
describe('ToastProvider auto-dismiss (WCAG 2.2.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismisses on its own after the duration elapses', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5100);
    });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('the Close button dismisses immediately, independent of the duration timer', async () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});
