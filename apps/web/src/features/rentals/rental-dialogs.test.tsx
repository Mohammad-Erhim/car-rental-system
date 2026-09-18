import { I18nProvider } from '@carrental/i18n/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PickupDialog, ReturnDialog } from './rental-dialogs';

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider initialLocale="en">{ui}</I18nProvider>
    </QueryClientProvider>,
  );

describe('ReturnDialog', () => {
  const show = () =>
    wrap(
      <ReturnDialog
        reference="RNT-1"
        currency="USD"
        odometerOutKm={15000}
        fuelOutPct={100}
        open
        onOpenChange={() => {}}
      />,
    );

  it('rejects a return reading below the pickup reading', async () => {
    show();
    fireEvent.change(screen.getByTestId('return-odo-RNT-1'), { target: { value: '14000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm return' }));
    expect(
      await screen.findByText('The return reading can’t be below the pickup reading.'),
    ).toBeInTheDocument();
  });

  it('summarises distance and fuel deficit live', async () => {
    show();
    fireEvent.change(screen.getByTestId('return-odo-RNT-1'), { target: { value: '15480' } });
    fireEvent.change(screen.getByTestId('return-fuel-RNT-1'), { target: { value: '75' } });
    await waitFor(() => expect(screen.getByText(/480 km this rental/)).toBeInTheDocument());
    expect(screen.getByText(/25% deficit billed/)).toBeInTheDocument();
    expect(screen.getByText('No damage recorded')).toBeInTheDocument();
  });

  it('adds a damage finding row and counts it in the summary', async () => {
    show();
    fireEvent.click(screen.getByTestId('return-add-finding-RNT-1'));
    expect(await screen.findByTestId('return-finding-RNT-1-0')).toBeInTheDocument();
    expect(screen.getByText(/1 damage finding/)).toBeInTheDocument();
  });
});

describe('PickupDialog', () => {
  it('requires the odometer, driver and licence', async () => {
    wrap(<PickupDialog reference="RNT-1" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pickup' }));
    expect(await screen.findByText('Enter a whole number.')).toBeInTheDocument();
    expect(screen.getAllByText('This is required')).toHaveLength(2);
  });
});
