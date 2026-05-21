import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ShieldAlert } from 'lucide-react';
import type { DisclosureLogEntry } from '@coursewise/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiCall } from '@/lib/api';
import { useMyDisclosures } from '@/lib/queries';

const PAGE_SIZE = 50;

// Friendly labels for the action keys we know about today. Anything not in
// this map falls back to the raw key — better that the student see something
// they can quote in a complaint than that we lose the audit row.
const ACTION_LABELS: Record<string, string> = {
  'grades.export.csv': 'settings.disclosures.action.gradesExport',
  'attendance.export.csv': 'settings.disclosures.action.attendanceExport',
  'gradebook.student.view': 'settings.disclosures.action.gradebookView',
  'submission.view': 'settings.disclosures.action.submissionView',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function actorRoleBadge(
  role: DisclosureLogEntry['actor']['role'],
): { variant: 'secondary' | 'info' | 'warning' | 'outline'; key: string } | null {
  if (role === 'admin') return { variant: 'warning', key: 'roles.admin' };
  if (role === 'teacher') return { variant: 'info', key: 'roles.teacher' };
  if (role === 'student') return { variant: 'secondary', key: 'roles.student' };
  return null;
}

export function SettingsDisclosuresPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const q = useMyDisclosures(offset, PAGE_SIZE);

  const onDownload = async () => {
    // The export route requires Bearer auth, so a plain <a href> won't work
    // (browsers don't send Authorization on direct navigation). Fetch as a
    // raw Response, materialise the body as a Blob, and trigger a download
    // via a programmatic anchor click.
    setDownloading(true);
    try {
      const res = (await apiCall<Response>('/api/me/records/export', {
        raw: true,
      })) as Response;
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `coursewise-records-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.push({ title: t('settings.disclosures.exportToast'), tone: 'success' });
    } catch {
      toast.push({ title: t('common.error'), tone: 'error' });
    } finally {
      setDownloading(false);
    }
  };

  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const nextOffset = q.data?.nextOffset ?? null;

  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + items.length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('settings.disclosures.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('settings.disclosures.description')}
          </p>
        </div>
        <Button onClick={onDownload} disabled={downloading} variant="outline">
          <Download className="h-4 w-4" />
          {downloading ? t('common.loading') : t('settings.disclosures.exportCta')}
        </Button>
      </header>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6" />}
          title={t('settings.disclosures.emptyTitle')}
          description={t('settings.disclosures.emptyBody')}
        />
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.disclosures.col.when')}</TableHead>
                  <TableHead>{t('settings.disclosures.col.what')}</TableHead>
                  <TableHead>{t('settings.disclosures.col.who')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const labelKey = ACTION_LABELS[row.action];
                  const what = labelKey ? t(labelKey) : row.action;
                  const roleBadge = actorRoleBadge(row.actor.role);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {formatDateTime(row.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{what}</div>
                        {labelKey ? (
                          <div className="text-xs text-muted-foreground">{row.action}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <span>{row.actor.name ?? t('settings.disclosures.unknownActor')}</span>
                          {roleBadge ? (
                            <Badge variant={roleBadge.variant}>{t(roleBadge.key)}</Badge>
                          ) : null}
                          {row.actor.type === 'api_token' ? (
                            <Badge variant="outline">{t('settings.disclosures.viaApiToken')}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {t('settings.disclosures.showingRange', {
                from: showingFrom,
                to: showingTo,
                total,
              })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                {t('common.back')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={nextOffset == null}
                onClick={() => nextOffset != null && setOffset(nextOffset)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
