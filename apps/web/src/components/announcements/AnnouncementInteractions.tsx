import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/lib/api';
import {
  useAddAnnouncementComment,
  useAnnouncementComments,
  useDeleteAnnouncementComment,
  useToggleAnnouncementReaction,
  useToggleCommentReaction,
} from '@/lib/queries';
import {
  ANNOUNCEMENT_REACTION_EMOJIS,
  type AnnouncementSummary,
  type ReactionSummary,
} from '@coursewise/shared';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function ReactionBar({
  reactions,
  busy,
  onToggle,
}: {
  reactions: ReactionSummary[];
  busy?: boolean;
  onToggle: (emoji: string) => void;
}): JSX.Element {
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ANNOUNCEMENT_REACTION_EMOJIS.map((emoji) => {
        const r = byEmoji.get(emoji);
        const count = r?.count ?? 0;
        const reacted = r?.reacted ?? false;
        return (
          <button
            key={emoji}
            type="button"
            disabled={busy}
            onClick={() => onToggle(emoji)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-50',
              reacted
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-accent',
            )}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 ? <span className="tabular-nums">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Announcement reaction bar + a collapsible comments thread. */
export function AnnouncementInteractions({
  announcement,
  courseId,
}: {
  announcement: AnnouncementSummary;
  courseId: string;
}): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const toggleReaction = useToggleAnnouncementReaction(courseId);
  const commentsQ = useAnnouncementComments(announcement.id, open);
  const addComment = useAddAnnouncementComment(announcement.id, courseId);
  const deleteComment = useDeleteAnnouncementComment(announcement.id, courseId);
  const toggleCommentReaction = useToggleCommentReaction(announcement.id);

  const onSend = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await addComment.mutateAsync({ body });
      setDraft('');
    } catch (err) {
      const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
      toast.push({ title: t(key), tone: 'error' });
    }
  };

  const comments = commentsQ.data ?? [];

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <ReactionBar
        reactions={announcement.reactions}
        busy={toggleReaction.isPending}
        onToggle={(emoji) => toggleReaction.mutate({ id: announcement.id, emoji })}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {t('announcements.commentsToggle', { count: announcement.commentCount })}
      </button>

      {open ? (
        <div className="space-y-3 rounded-md border bg-muted/20 p-3">
          {commentsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('announcements.noComments')}</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((cm) => (
                <li key={cm.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{cm.authorName ?? '—'}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(cm.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{cm.body}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <ReactionBar
                      reactions={cm.reactions}
                      busy={toggleCommentReaction.isPending}
                      onToggle={(emoji) =>
                        toggleCommentReaction.mutate({ commentId: cm.id, emoji })
                      }
                    />
                    {cm.canDelete ? (
                      <button
                        type="button"
                        onClick={() => deleteComment.mutate(cm.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        {t('common.delete')}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {announcement.allowComments ? (
            <div className="flex items-start gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder={t('announcements.commentPlaceholder')}
              />
              <Button size="sm" onClick={onSend} disabled={addComment.isPending || !draft.trim()}>
                {t('announcements.commentSend')}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('announcements.commentsOff')}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
