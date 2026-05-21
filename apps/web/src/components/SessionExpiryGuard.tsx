import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/authContext';

// When time-to-expiry is at or below this, show the warning dialog.
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
// How often to recompute the remaining time.
const TICK_INTERVAL_MS = 1_000;

// Best-effort decoder. Returns null on anything malformed — caller treats
// "couldn't decode" as "no warning" rather than guessing an expiry.
function readJwtExpMs(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!;
    // base64url → base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      '=',
    );
    const json = JSON.parse(atob(b64)) as { exp?: number };
    if (typeof json.exp !== 'number') return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Routes where the dialog should never appear: login/register/legal/etc.
// If the user is on /login, the auth context probably already has no auth
// and there's nothing to expire — but a guard against false positives.
const PUBLIC_PATH_PREFIXES = ['/login', '/register', '/teacher/accept-invite', '/legal', '/p/'];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

/**
 * Watches the access token's `exp` claim and, when expiry is imminent, shows
 * a dialog with a countdown plus "Stay signed in" / "Sign out now" buttons.
 * At zero, signs out and redirects to /login with a small toast.
 *
 * Mount once near the top of the tree (inside AuthProvider).
 */
export function SessionExpiryGuard(): JSX.Element | null {
  const { t } = useTranslation();
  const { auth, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  // Re-read token + recompute on every tick. We also recompute when `auth`
  // changes (login/refresh updates the access token).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const expMs = useMemo(() => readJwtExpMs(auth?.accessToken), [auth?.accessToken]);
  const remaining = expMs == null ? null : expMs - now;

  // Track whether we've already fired the auto-logout, so a slow refresh
  // attempt can't double-trigger it.
  const firedLogoutRef = useRef(false);
  useEffect(() => {
    firedLogoutRef.current = false;
  }, [auth?.accessToken]);

  // Skip the dialog on public pages and when there's no session.
  if (!auth || expMs == null || isPublicPath(location.pathname)) return null;

  const shouldWarn = remaining != null && remaining <= WARNING_THRESHOLD_MS;

  // Hit zero → logout + redirect. Done as a side-effect of render here is
  // OK because navigate/logout are stable callbacks and a guard ref prevents
  // re-entry.
  if (remaining != null && remaining <= 0 && !firedLogoutRef.current) {
    firedLogoutRef.current = true;
    void (async () => {
      try {
        await logout();
      } finally {
        toast.push({ title: t('session.expiredToast'), tone: 'info' });
        navigate('/login', { replace: true });
      }
    })();
  }

  if (!shouldWarn || remaining == null) return null;

  const countdownLabel =
    remaining <= 0 ? t('session.signingOut') : formatRemaining(remaining);

  return (
    <Dialog
      open
      onClose={() => {
        /* deliberately empty — user must pick "Stay" or "Sign out" */
      }}
      title={t('session.warningTitle')}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('session.warningBody')}</p>
        <div className="rounded border bg-muted/30 px-4 py-3 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('session.countdownLabel')}
          </div>
          <div className="font-mono text-3xl tabular-nums">{countdownLabel}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await logout();
              } finally {
                navigate('/login', { replace: true });
              }
            }}
          >
            {t('session.signOutNow')}
          </Button>
          <Button
            type="button"
            onClick={async () => {
              try {
                await refresh();
                toast.push({ title: t('session.refreshed'), tone: 'success' });
              } catch {
                // Refresh failed — token is unusable; sign the user out so
                // they can log back in cleanly.
                toast.push({ title: t('session.refreshFailed'), tone: 'error' });
                try {
                  await logout();
                } finally {
                  navigate('/login', { replace: true });
                }
              }
            }}
          >
            {t('session.staySignedIn')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
