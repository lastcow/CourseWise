import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/ui/toast';
import { JoinCourseDialog } from './JoinCourseDialog';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <BrowserRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

describe('JoinCourseDialog', () => {
  it('disables the Join button until a code is entered', () => {
    wrap(<JoinCourseDialog open onOpenChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /^join$/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/invitation code/i), {
      target: { value: 'INV-AAAA-BBBB' },
    });
    expect(btn).toBeEnabled();
  });
});
