import { I18nProvider } from '@carrental/i18n/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInPage } from './sign-in-page';

const signIn = vi.fn();
vi.mock('@carrental/client/react', async () => {
  const actual = await vi.importActual<object>('@carrental/client/react');
  return {
    ...actual,
    useAuth: () => ({ signIn, status: 'anonymous', actor: null }),
  };
});

function setup() {
  return render(
    <I18nProvider initialLocale="en">
      <MemoryRouter initialEntries={['/sign-in']}>
        <SignInPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('SignInPage', () => {
  beforeEach(() => signIn.mockReset());

  it('validates before calling the API', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('This is required')).toHaveLength(2);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Staff email'), { target: { value: 'nope' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid value')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in as staff with the entered credentials', async () => {
    signIn.mockResolvedValue({});
    setup();
    fireEvent.change(screen.getByLabelText('Staff email'), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: 'admin@example.test',
        password: 'secret-pass',
        audience: 'staff',
      }),
    );
  });
});
