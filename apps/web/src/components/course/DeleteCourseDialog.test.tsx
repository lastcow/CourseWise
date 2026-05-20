import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeleteCourseDialog } from './DeleteCourseDialog';

const counts = {
  enrollments: 3,
  modules: 2,
  readingMaterials: 4,
  assignments: 1,
  submissions: 6,
  quizzes: 1,
  quizAttempts: 3,
  discussionTopics: 1,
  discussionPosts: 12,
  attendanceSessions: 0,
  fileCount: 2,
  fileBytes: 1024 * 1024,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('DeleteCourseDialog', () => {
  it('disables the delete button until the typed code matches', () => {
    wrap(
      <DeleteCourseDialog
        open
        onOpenChange={() => {}}
        courseId="c1"
        courseCode="INT101"
        courseTitle="Intro"
        counts={counts}
      />,
    );
    const btn = screen.getByRole('button', { name: /delete forever/i });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/course code/i), { target: { value: 'wrong' } });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/course code/i), { target: { value: 'INT101' } });
    expect(btn).toBeEnabled();
  });
});
