import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
          ? `You're already in ${result.courseTitle}`
          : `Joined ${result.courseTitle}`,
        tone: 'success',
      });
      navigate(`/student/courses/${result.courseId}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Join a course" className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Paste the invitation code your teacher shared.
        </p>
        <div className="space-y-2">
          <Label htmlFor="join-course-code">Invitation code</Label>
          <Input
            id="join-course-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Invitation code"
            placeholder="INV-XXXX-YYYY"
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
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!code.trim() || redeem.isPending}
            onClick={onSubmit}
          >
            {redeem.isPending ? 'Joining...' : 'Join'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
