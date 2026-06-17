import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Megaphone, Pin, RefreshCw } from 'lucide-react';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Badge } from '@/components/ui/badge';
import { MarkdownView } from '@/components/ui/markdown';
import { EmptyState } from '@/components/ui/empty';
import { CourseSectionHeader, ListSkeleton } from '@/components/course/CourseSectionHeader';
import { AnnouncementAttachments } from '@/components/announcements/AnnouncementAttachments';
import { AnnouncementInteractions } from '@/components/announcements/AnnouncementInteractions';
import { cn } from '@/lib/utils';
import { useAnnouncements, useMarkAnnouncementRead } from '@/lib/queries';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function StudentAnnouncementsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';

  const listQ = useAnnouncements(id);
  const markRead = useMarkAnnouncementRead(id);
  const rows = listQ.data ?? [];

  // Snapshot which announcements were unread on first load so the "new"
  // highlight persists for this visit even after we mark them read (which
  // clears the nav badge). Runs once per mount.
  const initialUnread = useRef<Set<string>>(new Set());
  const markedOnce = useRef(false);
  useEffect(() => {
    if (markedOnce.current || !listQ.data) return;
    markedOnce.current = true;
    const unread = listQ.data.filter((a) => !a.isRead);
    unread.forEach((a) => initialUnread.current.add(a.id));
    unread.forEach((a) => markRead.mutate(a.id));
  }, [listQ.data, markRead]);

  return (
    <div className="space-y-4">
      <CourseSectionHeader
        title={t('announcements.title')}
        description={t('announcements.helpStudent')}
        count={rows.length}
        actions={
          <ActionIconButton
            icon={RefreshCw}
            label={t('common.refresh')}
            color="sky"
            size="sm"
            onClick={() => void listQ.refetch()}
            disabled={listQ.isFetching}
            className={cn(listQ.isFetching && '[&_svg]:animate-spin')}
          />
        }
      />

      {listQ.isLoading ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-6 w-6" />} title={t('announcements.emptyStudent')} />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const isNew = initialUnread.current.has(a.id);
            return (
              <div
                key={a.id}
                className={cn('rounded-md border p-4', isNew && 'border-primary/40 bg-primary/5')}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.pinned ? <Pin className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
                    <h3 className="font-medium">{a.title}</h3>
                    {a.priority !== 'normal' ? (
                      <Badge
                        variant={a.priority === 'urgent' ? 'default' : 'warning'}
                        className={a.priority === 'urgent' ? 'bg-red-600 text-white' : undefined}
                      >
                        {t(`announcements.priority.${a.priority}`)}
                      </Badge>
                    ) : null}
                  </div>
                  {isNew ? <Badge variant="info">{t('announcements.new')}</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.authorName ?? '—'} · {formatDate(a.publishedAt ?? a.createdAt)}
                </p>
                <MarkdownView source={a.body} className="mt-3 border-t pt-3" />
                <AnnouncementAttachments attachments={a.attachments} />
                <AnnouncementInteractions announcement={a} courseId={id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
