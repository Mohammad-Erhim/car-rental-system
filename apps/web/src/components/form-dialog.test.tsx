import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { FormDialog } from './form-dialog';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';

const problem = (over: Record<string, unknown> = {}) =>
  new ApiError({
    code: 'business_rule_violation',
    category: 'business_rule',
    status: 422,
    title: 'Nothing captured to refund',
    correlationId: 'x',
    ...over,
  } as never);

function Harness({
  onSubmit,
  onOpenChange = () => {},
}: {
  onSubmit: (v: { note: string }) => Promise<unknown>;
  onOpenChange?: (open: boolean) => void;
}) {
  const form = useForm<{ note: string }>({ defaultValues: { note: '' } });
  return (
    <I18nProvider initialLocale="en">
      <FormDialog
        open
        onOpenChange={onOpenChange}
        form={form}
        defaultValues={{ note: '' }}
        title="Do the thing"
        submitLabel="Go"
        onSubmit={onSubmit}
      >
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>
    </I18nProvider>
  );
}

describe('FormDialog', () => {
  it('submits the values and closes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<Harness onSubmit={onSubmit} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ note: 'hello' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open and shows the API problem inline when the action fails', async () => {
    const onOpenChange = vi.fn();
    render(<Harness onSubmit={() => Promise.reject(problem())} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('Nothing captured to refund')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    // and nothing the user typed is lost
    expect(screen.getByLabelText('Note')).toBeInTheDocument();
  });

  it('shows a generic message for an unexpected (non-API) failure', async () => {
    render(<Harness onSubmit={() => Promise.reject(new Error('boom'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('The action could not be completed.')).toBeInTheDocument();
  });

  it('puts an API field error on its field', async () => {
    render(
      <Harness
        onSubmit={() =>
          Promise.reject(
            problem({ title: 'Invalid', fieldErrors: [{ path: 'note', code: 'required' }] }),
          )
        }
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(await screen.findByText('This is required')).toBeInTheDocument();
  });

  it('cancel closes without submitting', () => {
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(<Harness onSubmit={onSubmit} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
