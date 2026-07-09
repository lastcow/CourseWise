import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, FileArchive, Lock } from 'lucide-react';
import type { ExportShareMeta } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ApiClientError } from '@/lib/api';
import { fetchExportShareMeta, requestExportShareDownload } from '@/lib/queries';

function formatBytes(n: number | null): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Map metadata-fetch failures to a friendly guest-facing i18n key. 404/410
// (gone/expired/exhausted/revoked) are deliberately coarse; 423 is a lock.
function metaErrorKey(status: number): string {
  if (status === 423) return 'exportShare.error.locked';
  return 'exportShare.error.gone';
}

// Map download failures. 401/403 are passphrase problems; 423 is a lock; the
// rest read as "link no longer works".
function downloadErrorKey(status: number): string {
  switch (status) {
    case 401:
      return 'exportShare.error.passphraseRequired';
    case 403:
      return 'exportShare.error.passphraseIncorrect';
    case 423:
      return 'exportShare.error.locked';
    default:
      return 'exportShare.error.gone';
  }
}

// Guest (logged-out) download page for a course-export capability link. Rendered
// OUTSIDE the auth layouts — the share token is the only credential. All API
// calls go through helpers that pass { auth: false } so no JWT is attached.
export function PublicExportDownloadPage(): JSX.Element {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ok'; meta: ExportShareMeta }
    | { kind: 'error'; messageKey: string }
  >({ kind: 'loading' });
  const [passphrase, setPassphrase] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', messageKey: 'exportShare.error.gone' });
      return;
    }
    let cancelled = false;
    fetchExportShareMeta(token)
      .then((meta) => {
        if (!cancelled) setState({ kind: 'ok', meta });
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err instanceof ApiClientError ? err.status : 0;
        setState({ kind: 'error', messageKey: metaErrorKey(status) });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onDownload = async (): Promise<void> => {
    if (!token) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      const trimmed = passphrase.trim();
      const { downloadUrl } = await requestExportShareDownload(
        token,
        trimmed ? trimmed : undefined,
      );
      // Navigate the browser to the short-lived presigned URL to start the file
      // download (same pattern as the authed export download).
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDownloaded(true);
      // Refresh the metadata so the remaining-download count (and any lock)
      // reflects this download; keep the current view if the refresh fails.
      fetchExportShareMeta(token)
        .then((meta) => setState({ kind: 'ok', meta }))
        .catch(() => {
          /* keep the prior meta */
        });
    } catch (err) {
      const status = err instanceof ApiClientError ? err.status : 0;
      setDownloadError(t(downloadErrorKey(status)));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4 text-foreground">
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-background p-6 shadow-sm">
        <div className="text-center">
          <Link to="/" className="text-sm font-semibold tracking-tight hover:underline">
            CourseWise
          </Link>
        </div>
        {state.kind === 'loading' ? (
          <p className="text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : state.kind === 'error' ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-semibold">{t('exportShare.unavailableTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t(state.messageKey)}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <FileArchive className="mt-0.5 h-8 w-8 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold">{t('exportShare.title')}</h1>
                {state.meta.courseCode ? (
                  <p className="text-sm text-muted-foreground">{state.meta.courseCode}</p>
                ) : null}
              </div>
            </div>

            <dl className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('exportShare.fileLabel')}</dt>
                <dd className="truncate font-medium">{state.meta.fileName}</dd>
              </div>
              {state.meta.sizeBytes != null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{t('exportShare.sizeLabel')}</dt>
                  <dd>{formatBytes(state.meta.sizeBytes)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('exportShare.expiresLabel')}</dt>
                <dd>{new Date(state.meta.expiresAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {t('exportShare.downloadsRemainingLabel')}
                </dt>
                <dd>{state.meta.downloadsRemaining}</dd>
              </div>
            </dl>

            {state.meta.requiresPassphrase ? (
              <div className="space-y-1">
                <Label htmlFor="passphrase">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    {t('exportShare.passphraseLabel')}
                  </span>
                </Label>
                <Input
                  id="passphrase"
                  type="password"
                  autoComplete="off"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onDownload();
                  }}
                />
              </div>
            ) : null}

            {downloadError ? <p className="text-sm text-rose-600">{downloadError}</p> : null}

            <Button
              className="w-full"
              onClick={() => void onDownload()}
              disabled={downloading || (state.meta.requiresPassphrase && passphrase.trim() === '')}
            >
              <Download className="h-4 w-4" />
              {downloading ? t('exportShare.downloading') : t('exportShare.downloadCta')}
            </Button>

            {downloaded ? (
              <p className="text-center text-sm text-emerald-600">{t('exportShare.started')}</p>
            ) : null}

            <p className="text-center text-xs text-muted-foreground">
              {t('exportShare.privacyNote')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
