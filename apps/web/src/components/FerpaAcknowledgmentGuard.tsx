import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/authContext';
import { useAcknowledgeFerpa, useMyFerpaAcknowledgment } from '@/lib/queries';

// Same allow-list as SessionExpiryGuard. We never show the modal on
// public/auth pages — there's nothing authenticated happening yet.
const PUBLIC_PATH_PREFIXES = ['/login', '/register', '/teacher/accept-invite', '/legal', '/p/'];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * FERPA §99.7(a): the school must annually notify students of their FERPA
 * rights. We render a first-login modal that can't be dismissed without
 * clicking "I acknowledge". The acknowledgment is per academic year (July 1
 * rollover), so the modal returns each year.
 *
 * Mount once near the top of the tree (inside AuthProvider).
 */
export function FerpaAcknowledgmentGuard(): JSX.Element | null {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const location = useLocation();
  const toast = useToast();
  // The query is gated on having an auth session — without auth there's
  // no point asking. React Query won't fire until we render the component
  // anyway; the `useAuth` check below short-circuits.
  const ackQ = useMyFerpaAcknowledgment();
  const ackMutation = useAcknowledgeFerpa();

  if (!auth || isPublicPath(location.pathname)) return null;
  // Wait for the first read. Don't flash the modal before we know whether
  // it's needed.
  if (ackQ.isLoading || !ackQ.data) return null;
  if (ackQ.data.acknowledged) return null;

  const onAcknowledge = async () => {
    try {
      await ackMutation.mutateAsync();
      toast.push({ title: t('ferpaNotice.acknowledgedToast'), tone: 'success' });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        /* unskippable — the only way out is the acknowledge button */
      }}
      title={t('ferpaNotice.title')}
      dismissOnBackdropClick={false}
      hideCloseButton
      className="max-w-2xl"
    >
      <div className="space-y-4 text-sm">
        <p>
          {t('ferpaNotice.intro', { year: ackQ.data.academicYear })}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t('ferpaNotice.bullet.inspect')}</li>
          <li>{t('ferpaNotice.bullet.amend')}</li>
          <li>{t('ferpaNotice.bullet.consent')}</li>
          <li>{t('ferpaNotice.bullet.complaint')}</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          {t('ferpaNotice.readMorePrefix')}{' '}
          <a
            href="/legal/ferpa"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {t('ferpaNotice.readMoreLink')}
          </a>
          .
        </p>
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={onAcknowledge}
            disabled={ackMutation.isPending}
          >
            {ackMutation.isPending ? t('common.loading') : t('ferpaNotice.acknowledgeCta')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
