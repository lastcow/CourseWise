import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      title={t('course.dangerZone.dialog.title', { title: courseTitle, code: courseCode })}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('course.dangerZone.dialog.body')}</p>

        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li>
            {t('course.dangerZone.dialog.enrolledStudents', { count: counts.enrollments })}
          </li>
          <li>
            {t('course.dangerZone.dialog.modulesMaterials', {
              modules: counts.modules,
              materials: counts.readingMaterials,
            })}
          </li>
          <li>
            {t('course.dangerZone.dialog.assignmentsSubmissions', {
              assignments: counts.assignments,
              submissions: counts.submissions,
            })}
          </li>
          <li>
            {t('course.dangerZone.dialog.quizzesAttempts', {
              quizzes: counts.quizzes,
              attempts: counts.quizAttempts,
            })}
          </li>
          <li>
            {t('course.dangerZone.dialog.discussionTopicsPosts', {
              topics: counts.discussionTopics,
              posts: counts.discussionPosts,
            })}
          </li>
          <li>
            {t('course.dangerZone.dialog.attendanceSessions', { count: counts.attendanceSessions })}
          </li>
          <li>
            {t('course.dangerZone.dialog.uploadedFiles', {
              count: counts.fileCount,
              size: formatBytes(counts.fileBytes),
            })}
          </li>
        </ul>

        <div className="space-y-2">
          <Label htmlFor="delete-course-confirm-code">
            {t('course.dangerZone.dialog.confirmLabel', { code: courseCode })}
          </Label>
          <Input
            id="delete-course-confirm-code"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={t('course.dangerZone.dialog.codeInputAriaLabel')}
            placeholder={courseCode}
            autoComplete="off"
          />
        </div>

        {del.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t('course.dangerZone.dialog.failed')}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={handleClose} disabled={del.isPending}>
            {t('course.dangerZone.dialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || del.isPending}
            onClick={onConfirm}
          >
            {del.isPending
              ? t('course.dangerZone.dialog.deleting')
              : t('course.dangerZone.dialog.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
