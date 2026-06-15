import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarRange, ChevronRight, ExternalLink } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DownloadPresentationButton } from '@/components/presentation/DownloadPresentationButton';
import { ModuleContentSummary } from '@/components/ModuleContentSummary';
import { StudentTasksPanel } from '@/components/student/StudentTasksPanel';
import { CourseHeader } from '@/components/course/CourseHeader';
import {
  useAssignmentsList,
  useCourse,
  useDiscussionTopicsList,
  useMaterialsList,
  useModulesList,
  usePresentationsList,
  useQuizzesList,
} from '@/lib/queries';
import { formatModuleWindow, moduleClosed } from '@/lib/moduleSchedule';
import { cn } from '@/lib/utils';
import type {
  AssignmentSummary,
  DiscussionTopicSummary,
  MaterialSummary,
  PresentationSummary,
  QuizSummary,
  SubmissionStatus,
} from '@coursewise/shared';

function submissionVariant(s: SubmissionStatus): 'success' | 'destructive' | 'secondary' {
  if (s === 'graded' || s === 'submitted') return 'success';
  if (s === 'late' || s === 'returned') return 'destructive';
  return 'secondary';
}

function bucket<T extends { moduleId: string | null }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    if (!it.moduleId) continue;
    const arr = m.get(it.moduleId) ?? [];
    arr.push(it);
    m.set(it.moduleId, arr);
  }
  return m;
}

function ItemRow({
  to,
  title,
  meta,
}: {
  to: string;
  title: string;
  meta?: React.ReactNode;
}): JSX.Element {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {meta}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function Section({
  titleKey,
  children,
}: {
  titleKey: string;
  children: React.ReactNode;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <Card className="bg-muted/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          {t(titleKey)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">{children}</ul>
      </CardContent>
    </Card>
  );
}

export function StudentModulesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
  const course = useCourse(id);
  const modulesQ = useModulesList(id);
  const materialsQ = useMaterialsList(id);
  const presentationsQ = usePresentationsList(id);
  const assignmentsQ = useAssignmentsList(id);
  const quizzesQ = useQuizzesList(id);
  const discussionsQ = useDiscussionTopicsList(id);

  const matsByModule = useMemo(() => bucket(materialsQ.data ?? []), [materialsQ.data]);
  const presByModule = useMemo(() => bucket(presentationsQ.data ?? []), [presentationsQ.data]);
  const asgByModule = useMemo(() => bucket(assignmentsQ.data ?? []), [assignmentsQ.data]);
  const qzByModule = useMemo(() => bucket(quizzesQ.data ?? []), [quizzesQ.data]);
  const dscByModule = useMemo(() => bucket(discussionsQ.data ?? []), [discussionsQ.data]);

  // Available modules stay on top; expired ones (past their end time, or closed
  // by the teacher) sink to the bottom so students always see what's open
  // first. The API returns modules in position order and Array.sort is stable,
  // so the teacher's ordering is preserved within each group.
  const orderedModules = useMemo(
    () =>
      [...(modulesQ.data ?? [])].sort((a, b) => Number(moduleClosed(a)) - Number(moduleClosed(b))),
    [modulesQ.data],
  );

  const renderMaterial = (mat: MaterialSummary): JSX.Element => (
    <li key={mat.id} className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <ItemRow
          to={`/student/courses/${id}/materials/${mat.id}`}
          title={mat.title}
          meta={
            <Badge variant="info">
              {t(
                `materials.kind${mat.sourceType.replace(/(^|_)(\w)/g, (_, _b, c: string) =>
                  c.toUpperCase(),
                )}`,
              )}
            </Badge>
          }
        />
      </div>
      {mat.fileAssetId ? (
        <DownloadPresentationButton
          fileAssetId={mat.fileAssetId}
          labelKey="common.download"
          iconOnly
        />
      ) : null}
    </li>
  );

  const renderPresentation = (p: PresentationSummary): JSX.Element => (
    <li key={p.id} className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <ItemRow
          to={`/student/courses/${id}/presentations/${p.id}`}
          title={p.title}
          meta={
            <span className="text-xs text-muted-foreground">
              {t('presentations.slidesCount', { count: p.slideCount })}
            </span>
          }
        />
      </div>
      {p.provider === 'gamma' && p.externalUrl ? (
        <a
          href={p.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('gamma.openInGamma')}
          title={t('gamma.openInGamma')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-transparent transition-colors hover:bg-accent"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      ) : null}
      {p.fileAssetId ? <DownloadPresentationButton fileAssetId={p.fileAssetId} iconOnly /> : null}
    </li>
  );

  const renderAssignment = (a: AssignmentSummary): JSX.Element => {
    const mine = a.mySubmission ?? null;
    // Same draft-vs-submitted gating as the Assignments list page: the
    // draft row that POST /submissions creates on first open shouldn't
    // count as "submitted" in the module overview.
    const hasSubmitted = mine && mine.status !== 'draft';
    return (
      <li key={a.id} className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ItemRow
            to={`/student/courses/${id}/assignments/${a.id}`}
            title={a.title}
            meta={
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                {a.dueDate ? (
                  <span>
                    {t('assignments.dueLabel')}: {new Date(a.dueDate).toLocaleDateString()}
                  </span>
                ) : null}
                {hasSubmitted ? (
                  <>
                    <Badge variant={submissionVariant(mine!.status)}>
                      {t(
                        `submissions.status${mine!.status[0]!.toUpperCase()}${mine!.status.slice(1)}`,
                      )}
                    </Badge>
                    {mine!.submittedAt ? (
                      <span>{new Date(mine!.submittedAt).toLocaleDateString()}</span>
                    ) : null}
                  </>
                ) : null}
              </span>
            }
          />
        </div>
        {a.attachmentFileId ? (
          <DownloadPresentationButton
            fileAssetId={a.attachmentFileId}
            labelKey="common.download"
            iconOnly
          />
        ) : null}
      </li>
    );
  };

  const renderQuiz = (q: QuizSummary): JSX.Element => (
    <li key={q.id}>
      <ItemRow
        to={`/student/courses/${id}/quizzes/${q.id}`}
        title={q.title}
        meta={
          <span className="text-xs text-muted-foreground">
            {t('quizzes.questionsCount', { count: q.questionCount ?? 0 })}
            {q.timeLimitMinutes
              ? ` · ${t('quizzes.timeLimitDisplay', { minutes: q.timeLimitMinutes })}`
              : ''}
          </span>
        }
      />
    </li>
  );

  const renderDiscussion = (d: DiscussionTopicSummary): JSX.Element => (
    <li key={d.id}>
      <ItemRow
        to={`/student/courses/${id}/discussion/${d.id}`}
        title={d.title}
        meta={
          <span className="text-xs text-muted-foreground">
            {t('discussion.postCount', { count: d.postCount ?? 0 })}
          </span>
        }
      />
    </li>
  );

  return (
    <div className="space-y-4">
      {course.data ? <CourseHeader course={course.data} role="student" /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {modulesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : !modulesQ.data || modulesQ.data.length === 0 ? (
            <p className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
              {t('modules.empty')}
            </p>
          ) : (
            <Accordion single className="space-y-3">
              {orderedModules.map((m) => {
                const mats = matsByModule.get(m.id) ?? [];
                const pres = presByModule.get(m.id) ?? [];
                const asgs = asgByModule.get(m.id) ?? [];
                const qzs = qzByModule.get(m.id) ?? [];
                const dscs = dscByModule.get(m.id) ?? [];
                const total = mats.length + pres.length + asgs.length + qzs.length + dscs.length;
                const closed = moduleClosed(m);
                const windowLabel = formatModuleWindow(m);
                return (
                  <AccordionItem
                    key={m.id}
                    value={m.id}
                    // Past its window or closed by the teacher: gray out, but the
                    // module stays fully usable.
                    className={cn(closed && 'opacity-60 grayscale')}
                  >
                    <AccordionTrigger>
                      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium">{m.title}</span>
                          {closed ? (
                            <Badge variant="secondary" className="shrink-0">
                              {t('modules.endedBadge')}
                            </Badge>
                          ) : null}
                          {windowLabel ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                              {windowLabel}
                            </span>
                          ) : null}
                        </span>
                        <ModuleContentSummary
                          counts={{
                            materials: mats.length,
                            presentations: pres.length,
                            assignments: asgs.length,
                            quizzes: qzs.length,
                            discussions: dscs.length,
                          }}
                        />
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      {m.description ? (
                        <p className="text-sm text-muted-foreground">{m.description}</p>
                      ) : null}

                      {mats.length > 0 ? (
                        <Section titleKey="materials.title">{mats.map(renderMaterial)}</Section>
                      ) : null}
                      {pres.length > 0 ? (
                        <Section titleKey="presentations.title">
                          {pres.map(renderPresentation)}
                        </Section>
                      ) : null}
                      {asgs.length > 0 ? (
                        <Section titleKey="assignments.title">{asgs.map(renderAssignment)}</Section>
                      ) : null}
                      {qzs.length > 0 ? (
                        <Section titleKey="quizzes.title">{qzs.map(renderQuiz)}</Section>
                      ) : null}
                      {dscs.length > 0 ? (
                        <Section titleKey="discussion.title">{dscs.map(renderDiscussion)}</Section>
                      ) : null}

                      {total === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('studentModules.emptyModule')}
                        </p>
                      ) : null}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>

        <StudentTasksPanel
          courseId={id}
          assignments={assignmentsQ.data ?? []}
          quizzes={quizzesQ.data ?? []}
          discussions={discussionsQ.data ?? []}
          loading={assignmentsQ.isLoading || quizzesQ.isLoading || discussionsQ.isLoading}
        />
      </div>
    </div>
  );
}
