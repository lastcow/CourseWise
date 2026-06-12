import { useTranslation } from 'react-i18next';
import {
  CalendarClock,
  ClipboardList,
  Download,
  Hourglass,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AssignmentSummary } from '@coursewise/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/markdown';
import { getDownloadUrl } from '@/lib/queries';
import { useToast } from '@/components/ui/toast';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Read-only "assignment requirements" viewer in a dialog: the key facts (max
 * score, individual/team, late policy), the availability timeline, and the full
 * Markdown brief + any attachment. Mirrors the student-facing assignment
 * briefing so teachers see exactly what students were asked to do.
 */
export function AssignmentRequirementDialog({
  assignment: a,
  open,
  onClose,
}: {
  assignment: AssignmentSummary;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();

  const onDownload = async (fileAssetId: string): Promise<void> => {
    try {
      const r = await getDownloadUrl(fileAssetId);
      window.open(r.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch {
      toast.push({ title: t('errors.internal'), tone: 'error' });
    }
  };

  const isTeam = a.submissionMode === 'group';
  const facts: { icon: LucideIcon; label: string; value: string }[] = [
    {
      icon: Trophy,
      label: t('assignments.maxScore'),
      value: a.maxScore != null ? String(a.maxScore) : '—',
    },
    {
      icon: isTeam ? Users : User,
      label: t('assignments.metaSubmission'),
      value: isTeam ? t('assignments.submissionTeam') : t('assignments.submissionIndividual'),
    },
    {
      icon: Hourglass,
      label: t('assignments.metaLateWork'),
      value: a.allowLateSubmission
        ? t('assignments.lateAccepted')
        : t('assignments.lateNotAccepted'),
    },
  ];

  const stops = [
    a.startDate ? { label: t('assignments.timelineOpens'), iso: a.startDate } : null,
    a.dueDate ? { label: t('assignments.timelineDue'), iso: a.dueDate } : null,
    a.endDate ? { label: t('assignments.timelineCloses'), iso: a.endDate } : null,
    a.untilDate ? { label: t('assignments.timelineSubmitBy'), iso: a.untilDate } : null,
  ].filter(Boolean) as { label: string; iso: string }[];

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <div className="space-y-5">
        {/* Header band */}
        <div className="min-w-0 pr-8">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            {t('submissions.requirementsKicker')}
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold">{a.title}</h2>
        </div>

        {/* Fact tiles */}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {facts.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="rounded-md border bg-card p-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {f.label}
                </dt>
                <dd className="mt-1 truncate text-base font-semibold tabular-nums text-foreground">
                  {f.value}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Availability timeline */}
        {stops.length > 0 ? (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {t('assignments.timelineHeading')}
            </div>
            <ul className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {stops.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatDateTime(s.iso)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* The requirement itself — full Markdown brief, read-only + scrollable. */}
        <div className="min-w-0">
          <div className="max-h-[45vh] overflow-y-auto rounded-md border bg-muted/30 p-4">
            {a.description ? (
              <Markdown source={a.description} />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {t('assignments.noDescription')}
              </p>
            )}
          </div>
          {a.attachmentFileId ? (
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onDownload(a.attachmentFileId!)}
              >
                <Download className="h-4 w-4" aria-hidden />
                {t('assignments.downloadAttachment')}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
