import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

const mutateAsync = vi.fn();
vi.mock('@/lib/queries', () => ({
  useResetPassword: () => ({ mutateAsync, isPending: false }),
}));

const push = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ push }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function wrap(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={qc}>
        <ResetPasswordPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    push.mockReset();
    navigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the invalid-link state when the token is missing', () => {
    wrap('/reset-password');
    expect(screen.getByText(/no longer valid/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('shows a mismatch error and does not call the mutation when passwords differ', () => {
    wrap('/reset-password?token=abc');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByText(/don't match/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('navigates to /login and shows a success toast on a successful reset', async () => {
    mutateAsync.mockResolvedValueOnce({ reset: true });
    wrap('/reset-password?token=abc');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ token: 'abc', password: 'password123' }),
    );
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
    expect(navigate).toHaveBeenCalledWith('/login');
  });
});
