import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import type { ChildCounts } from '@coursewise/shared';
import { useDeleteCourse } from '@/lib/queries';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? `${singular}s`);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  counts: ChildCounts;
  onDeleted?: () => void;
};

export function DeleteCourseDialog({
  open,
  onOpenChange,
  courseId,
  courseCode,
  courseTitle,
  counts,
  onDeleted,
}: Props): JSX.Element {
  const [typed, setTyped] = useState('');
  const del = useDeleteCourse();
  const matches = typed === courseCode;

  const handleClose = (): void => {
    if (del.isPending) return;
    setTyped('');
    onOpenChange(false);
  };

  async function onConfirm(): Promise<void> {
    await del.mutateAsync({ courseId, confirmCode: typed });
    setTyped('');
    onOpenChange(false);
    onDeleted?.();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      dismissOnBackdropClick={false}
      title={`Delete "${courseTitle}" (${courseCode})?`}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This permanently removes the course and all its content. It cannot be undone.
        </p>

        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li>
            {counts.enrollments} enrolled {plural(counts.enrollments, 'student')}
          </li>
          <li>
            {counts.modules} {plural(counts.modules, 'module')}, {counts.readingMaterials}{' '}
            {plural(counts.readingMaterials, 'reading material')}
          </li>
          <li>
            {counts.assignments} {plural(counts.assignments, 'assignment')}, {counts.submissions}{' '}
            {plural(counts.submissions, 'submission')}
          </li>
          <li>
            {counts.quizzes} {plural(counts.quizzes, 'quiz', 'quizzes')}, {counts.quizAttempts}{' '}
            {plural(counts.quizAttempts, 'quiz attempt')}
          </li>
          <li>
            {counts.discussionTopics} {plural(counts.discussionTopics, 'discussion topic')},{' '}
            {counts.discussionPosts} {plural(counts.discussionPosts, 'discussion post')}
          </li>
          <li>
            {counts.attendanceSessions}{' '}
            {plural(counts.attendanceSessions, 'attendance session')}
          </li>
          <li>
            {counts.fileCount} uploaded {plural(counts.fileCount, 'file')} (
            {formatBytes(counts.fileBytes)})
          </li>
        </ul>

        <div className="space-y-2">
          <Label htmlFor="delete-course-confirm-code">
            Type the course code <span className="font-mono font-semibold">{courseCode}</span> to
            confirm
          </Label>
          <Input
            id="delete-course-confirm-code"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="course code"
            placeholder={courseCode}
            autoComplete="off"
          />
        </div>

        {del.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Failed to delete course. Please try again.
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={handleClose} disabled={del.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || del.isPending}
            onClick={onConfirm}
          >
            {del.isPending ? 'Deleting…' : 'Delete forever'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
