import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleCheck, ClipboardList, ListChecks, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type {
  AssignmentSummary,
  DiscussionTopicSummary,
  QuizSummary,
} from '@coursewise/shared';
import { buildStudentTasks, type TaskKind } from './studentTasks';

const KIND_ICON: Record<TaskKind, typeof ClipboardList> = {
  assignment: ClipboardList,
  quiz: ListChecks,
  discussion: MessageSquare,
};

/** Cap so the panel stays a glanceable summary, not a full backlog. */
const MAX_TASKS = 8;

export interface StudentTasksPanelProps {
  courseId: string;
  assignments: AssignmentSummary[];
  quizzes: QuizSummary[];
  discussions: DiscussionTopicSummary[];
  loading?: boolean;
}

/**
 * Right-rail panel on the student Modules page: a course-scoped "to do &
 * upcoming" list, mirroring the teacher Modules pending-tasks panel.
 */
export function StudentTasksPanel({
  courseId,
  assignments,
  quizzes,
  discussions,
  loading = false,
}: StudentTasksPanelProps): JSX.Element {
  const { t } = useTranslation();
  const tasks = useMemo(
    () => buildStudentTasks({ courseId, assignments, quizzes, discussions }),
    [courseId, assignments, quizzes, discussions],
  );
  const visible = tasks.slice(0, MAX_TASKS);

  return (
    <aside className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t('studentTasks.title')}
      </h3>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : visible.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-emerald-300/60 bg-emerald-50/60 px-3 py-2.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
          <p className="text-sm font-medium">{t('studentTasks.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((task) => {
            const Icon = KIND_ICON[task.kind];
            return (
              <li key={task.key}>
                <Link
                  to={task.to}
                  className="block rounded-md border bg-card transition-colors hover:border-primary/40 hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">{task.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t(`studentTasks.kind.${task.kind}`)}
                        {task.dueAt
                          ? ` · ${t('studentTasks.due', {
                              date: new Date(task.dueAt).toLocaleDateString(),
                            })}`
                          : ''}
                      </p>
                    </div>
                    {task.statusKey ? (
                      <Badge variant={task.statusVariant} className="shrink-0">
                        {t(`studentTasks.${task.statusKey}`)}
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
