import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/authContext';
import { useRedeemInvitationCode, useValidateInvitationCode } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

export function InviteRedeemPage(): JSX.Element {
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
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">Switch accounts to join</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invitation codes are for student accounts. Switch to a student account to join.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/')}>
          Back
        </Button>
      </div>
    );
  }

  if (validate.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (validate.isError || !validate.data?.valid) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold text-red-800">Invitation not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation code is invalid, expired, or already used. Check with your teacher.
        </p>
      </div>
    );
  }

  const courseTitle = validate.data.courseTitle ?? 'this course';

  async function onJoin(): Promise<void> {
    try {
      const result = await redeem.mutateAsync(code);
      toast.push({
        title: result.alreadyEnrolled
          ? `You're already in ${result.courseTitle}`
          : `Joined ${result.courseTitle}`,
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
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Join {courseTitle}?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You'll be enrolled and can start working right away.
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => navigate('/')} disabled={redeem.isPending}>
          Cancel
        </Button>
        <Button onClick={onJoin} disabled={redeem.isPending}>
          {redeem.isPending ? 'Joining…' : 'Join course'}
        </Button>
      </div>
    </div>
  );
}
