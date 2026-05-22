import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Archive,
  Circle,
  CircleCheck,
  FolderInput,
  Inbox,
  Lock,
  RefreshCw,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionIconButton } from '@/components/ui/action-icon-button';
import { Dialog } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import { stripMarkdown } from '@/components/ui/markdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import {
  useAssignmentsList,
  useDeleteAssignment,
  useModulesList,
  useTransitionAssignment,
  useUpdateAssignment,
} from '@/lib/queries';
import { ApiClientError } from '@/lib/api';
import type { AssignmentSummary } from '@coursewise/shared';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusIcon({ status }: { status: AssignmentSummary['status'] }): JSX.Element {
  const { t } = useTranslation();
  const label = t(`assignments.status${status[0]!.toUpperCase()}${status.slice(1)}`);
  const { Icon, tone } = (() => {
    switch (status) {
      case 'published':
        return { Icon: CircleCheck, tone: 'border-emerald-500/60 text-emerald-500' };
      case 'closed':
        return { Icon: Lock, tone: 'border-sky-500/60 text-sky-500' };
      case 'archived':
        return { Icon: Archive, tone: 'border-orange-500/60 text-orange-500' };
      default:
        return { Icon: Circle, tone: 'border-slate-400/60 text-slate-400' };
    }
  })();
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border bg-transparent ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function TeacherAssignmentsPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const navigate = useNavigate();
  const list = useAssignmentsList(id);
  const transition = useTransitionAssignment(id);
  const del = useDeleteAssignment(id);
  const update = useUpdateAssignment(id);
  const modulesQ = useModulesList(id || null);
  const toast = useToast();

  const [deleteTarget, setDeleteTarget] = useState<AssignmentSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState<AssignmentSummary | null>(null);
  const [moveModuleId, setMoveModuleId] = useState<string>('');

  const moduleTitleById = new Map((modulesQ.data ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('assignments.title')}</h2>
      </header>

      <div className="overflow-hidden rounded-md border">
        <div className="flex items-center justify-end gap-1.5 border-b bg-muted/30 px-3 py-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/teacher/courses/${id}/assignments/new`}>{t('assignments.newCta')}</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <RefreshCw
              className={list.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              aria-hidden
            />
          </Button>
        </div>
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !list.data || list.data.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('assignments.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('assignments.colTitle')}</TableHead>
                <TableHead>{t('assignments.colDescription')}</TableHead>
                <TableHead>{t('assignments.colModule')}</TableHead>
                <TableHead>{t('assignments.colDue')}</TableHead>
                <TableHead className="text-right">{t('assignments.colMaxScore')}</TableHead>
                <TableHead className="text-right">{t('assignments.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={a.status} />
                      <Link
                        to={`/teacher/courses/${id}/assignments/${a.id}`}
                        className="hover:underline"
                      >
                        {a.title}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[24ch] text-muted-foreground">
                    <span className="line-clamp-1">
                      {a.description ? stripMarkdown(a.description) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-between gap-2">
                      <span className={a.moduleId ? 'line-clamp-1' : 'text-muted-foreground'}>
                        {a.moduleId ? (moduleTitleById.get(a.moduleId) ?? '—') : '—'}
                      </span>
                      <ActionIconButton
                        icon={FolderInput}
                        label={t('assignments.linkModuleAction')}
                        color="sky"
                        size="sm"
                        onClick={() => {
                          setMoveModuleId(a.moduleId ?? '');
                          setMoveTarget(a);
                        }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.maxScore ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <ActionIconButton
                        icon={SquarePen}
                        label={t('common.edit')}
                        color="yellow"
                        onClick={() => navigate(`/teacher/courses/${id}/assignments/${a.id}`)}
                      />
                      <ActionIconButton
                        icon={Inbox}
                        // Mirrors the teal "view attempts" icon on the
                        // teacher Quizzes page so both lists share the
                        // same visual shortcut to the student response
                        // surface.
                        label={t('assignments.viewSubmissionsAction', {
                          count: a.submissionCount ?? 0,
                        })}
                        color="teal"
                        onClick={() =>
                          navigate(`/teacher/courses/${id}/assignments/${a.id}/submissions`)
                        }
                      />
                      {a.status === 'draft' ? (
                        <ActionIconButton
                          icon={CircleCheck}
                          label={t('assignments.publish')}
                          color="emerald"
                          onClick={async () => {
                            try {
                              await transition.mutateAsync({ id: a.id, action: 'publish' });
                              toast.push({
                                title: t('assignments.published'),
                                tone: 'success',
                              });
                            } catch {
                              toast.push({
                                title: t('assignments.publishBlocked'),
                                tone: 'error',
                              });
                            }
                          }}
                        />
                      ) : null}
                      {a.status === 'published' ? (
                        <ActionIconButton
                          icon={Lock}
                          label={t('assignments.close')}
                          color="sky"
                          onClick={async () => {
                            await transition.mutateAsync({ id: a.id, action: 'close' });
                          }}
                        />
                      ) : null}
                      {a.status !== 'archived' ? (
                        <ActionIconButton
                          icon={Archive}
                          label={t('assignments.archive')}
                          color="orange"
                          onClick={async () => {
                            await transition.mutateAsync({ id: a.id, action: 'archive' });
                          }}
                        />
                      ) : null}
                      <ActionIconButton
                        icon={Trash2}
                        label={t('common.delete')}
                        color="red"
                        onClick={() => setDeleteTarget(a)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('assignments.deleteDialogTitle')}
        dismissOnBackdropClick={false}
      >
        <p className="text-sm text-muted-foreground">{t('assignments.deleteConfirm')}</p>
        {deleteTarget ? <p className="mt-2 text-sm font-medium">{deleteTarget.title}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              if (!deleteTarget) return;
              try {
                await del.mutateAsync(deleteTarget.id);
                toast.push({ title: t('assignments.deleted'), tone: 'success' });
                setDeleteTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        title={t('assignments.linkModuleTitle')}
        dismissOnBackdropClick={false}
      >
        <div className="space-y-2">
          <Label htmlFor="move-module">{t('assignments.moduleLabel')}</Label>
          <select
            id="move-module"
            value={moveModuleId}
            onChange={(e) => setMoveModuleId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={modulesQ.isLoading}
          >
            <option value="">{t('assignments.unassignedModule')}</option>
            {(modulesQ.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMoveTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={update.isPending}
            onClick={async () => {
              if (!moveTarget) return;
              try {
                await update.mutateAsync({
                  id: moveTarget.id,
                  input: { moduleId: moveModuleId || null },
                });
                toast.push({ title: t('assignments.moduleUpdated'), tone: 'success' });
                setMoveTarget(null);
              } catch (err) {
                const key = err instanceof ApiClientError ? err.error.i18nKey : 'errors.internal';
                toast.push({ title: t(key), tone: 'error' });
              }
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
