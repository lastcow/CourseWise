import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/authContext';
import { useRedeemInvitationCode, useValidateInvitationCode } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export function InviteRedeemPage(): JSX.Element {
  const { t } = useTranslation();
  const { code = '' } = useParams<{ code: string }>();
  const { auth } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const validate = useValidateInvitationCode(auth ? code : undefined);
  const redeem = useRedeemInvitationCode();

  if (!auth) {
    return <Navigate to={`/register?invitationCode=${encodeURIComponent(code)}`} replace />;
  }

  if (auth.user.role !== 'student') {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-lg font-semibold">{t('invite.notStudent.title')}</h1>
        <p className="mt-2 text-sm text-ink-400">{t('invite.notStudent.body')}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/')}>
          {t('invite.notStudent.back')}
        </Button>
      </div>
    );
  }

  if (validate.isLoading) {
    return <div className="p-6 text-sm text-ink-400">{t('invite.loading')}</div>;
  }
  if (validate.isError || !validate.data?.valid) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-lg font-semibold text-destructive">{t('invite.invalid.title')}</h1>
        <p className="mt-2 text-sm text-ink-400">{t('invite.invalid.body')}</p>
      </div>
    );
  }

  const courseTitle = validate.data.courseTitle ?? t('invite.fallbackCourseLabel');

  async function onJoin(): Promise<void> {
    try {
      const result = await redeem.mutateAsync(code);
      toast.push({
        title: result.alreadyEnrolled
          ? t('student.joinCourse.toast.alreadyEnrolled', { course: result.courseTitle })
          : t('student.joinCourse.toast.joined', { course: result.courseTitle }),
        tone: 'success',
      });
      navigate(`/student/courses/${result.courseId}`);
    } catch (e) {
      toast.push({
        title: e instanceof Error ? e.message : String(e),
        tone: 'error',
      });
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-xl font-semibold">{t('invite.join.title', { course: courseTitle })}</h1>
      <p className="mt-2 text-sm text-ink-400">{t('invite.join.body')}</p>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" onClick={() => navigate('/')} disabled={redeem.isPending}>
          {t('invite.join.cancel')}
        </Button>
        <Button
          onClick={onJoin}
          disabled={redeem.isPending}
          className="bg-evergreen text-paper hover:bg-evergreen-dark"
        >
          {redeem.isPending ? t('invite.join.joining') : t('invite.join.cta')}
        </Button>
      </div>
    </div>
  );
}
