import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useRedeemInvitationCode } from '@/lib/queries';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JoinCourseDialog({ open, onOpenChange }: Props): JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const redeem = useRedeemInvitationCode();
  const navigate = useNavigate();
  const toast = useToast();

  const close = (): void => {
    if (redeem.isPending) return;
    setCode('');
    setError(null);
    onOpenChange(false);
  };

  async function onSubmit(): Promise<void> {
    setError(null);
    try {
      const result = await redeem.mutateAsync(code.trim());
      setCode('');
      onOpenChange(false);
      toast.push({
        title: result.alreadyEnrolled
          ? t('student.joinCourse.toast.alreadyEnrolled', { course: result.courseTitle })
          : t('student.joinCourse.toast.joined', { course: result.courseTitle }),
        tone: 'success',
      });
      navigate(`/student/courses/${result.courseId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={t('student.joinCourse.title')} className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('student.joinCourse.description')}</p>
        <div className="space-y-2">
          <Label htmlFor="join-course-code">{t('student.joinCourse.codeLabel')}</Label>
          <Input
            id="join-course-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label={t('student.joinCourse.codeLabel')}
            placeholder={t('student.joinCourse.codePlaceholder')}
            autoComplete="off"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={close} disabled={redeem.isPending}>
            {t('student.joinCourse.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!code.trim() || redeem.isPending}
            onClick={onSubmit}
          >
            {redeem.isPending ? t('student.joinCourse.joining') : t('student.joinCourse.join')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
