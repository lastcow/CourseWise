import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink } from 'lucide-react';
import type { PublicPresentationView } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { apiCall, ApiClientError } from '@/lib/api';

function isOfficeEmbeddable(externalUrl: string | null): boolean {
  // Gamma share URLs allow iframe embedding only when the workspace is set
  // to public. We optimistically iframe and fall back to a "open in Gamma"
  // button if the host browser blocks the embed.
  if (!externalUrl) return false;
  try {
    const u = new URL(externalUrl);
    return u.hostname.endsWith('gamma.app');
  } catch {
    return false;
  }
}

export function PublicPresentationPage(): JSX.Element {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ok'; data: PublicPresentationView }
    | { kind: 'notfound' }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ kind: 'notfound' });
      return;
    }
    apiCall<PublicPresentationView>(`/api/share/presentations/${token}`, { auth: false })
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err) => {
        if (err instanceof ApiClientError && err.status === 404) {
          setState({ kind: 'notfound' });
        } else {
          setState({ kind: 'error', message: err instanceof Error ? err.message : 'error' });
        }
      });
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-sm font-semibold tracking-tight hover:underline">
            CourseWise
          </Link>
          {state.kind === 'ok' ? (
            <div className="flex items-center gap-2">
              {state.data.externalUrl ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={state.data.externalUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {t('gamma.openInGamma')}
                  </a>
                </Button>
              ) : null}
              {state.data.hasDownload ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/share/presentations/${token}/download.pptx`}>
                    <Download className="h-4 w-4" />
                    {t('gamma.downloadPptx')}
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <main className="flex-1">
        {state.kind === 'loading' ? (
          <p className="p-8 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : state.kind === 'notfound' ? (
          <div className="mx-auto max-w-xl space-y-2 p-12 text-center">
            <h1 className="text-2xl font-semibold">{t('share.notFoundTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('share.notFoundBody')}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="mx-auto max-w-xl space-y-2 p-12 text-center">
            <h1 className="text-2xl font-semibold">{t('common.error')}</h1>
            <p className="text-sm text-muted-foreground">{state.message}</p>
          </div>
        ) : (
          <PublicViewerBody data={state.data} />
        )}
      </main>
    </div>
  );
}

function PublicViewerBody({ data }: { data: PublicPresentationView }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{data.title}</h1>
        <p className="text-xs text-muted-foreground">{data.courseTitle}</p>
        {data.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{data.description}</p>
        ) : null}
      </div>
      {isOfficeEmbeddable(data.externalUrl) && data.externalUrl ? (
        // Gamma serves the deck at a publicly-iframeable URL only when the
        // workspace has it switched on. If the iframe blocks (X-Frame-Options),
        // the user still has the "Open in Gamma" + download buttons in the
        // header above.
        <div className="aspect-video w-full overflow-hidden rounded border bg-muted">
          <iframe
            src={data.externalUrl}
            title={data.title}
            className="h-full w-full"
            allow="fullscreen"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="rounded border bg-muted/30 p-6 text-sm text-muted-foreground">
          {t('share.noEmbed')}
        </div>
      )}
    </div>
  );
}
