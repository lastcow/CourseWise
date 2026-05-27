import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';

const mutateAsync = vi.fn();
vi.mock('@/lib/queries', () => ({
  useForgotPassword: () => ({ mutateAsync, isPending: false }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <BrowserRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </BrowserRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  it('shows the confirmation panel after submit (success)', async () => {
    mutateAsync.mockResolvedValueOnce({ requested: true });
    wrap(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'student@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
  });

  it('shows the same confirmation when the request errors (enumeration-safe)', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('boom'));
    wrap(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument());
  });
});
