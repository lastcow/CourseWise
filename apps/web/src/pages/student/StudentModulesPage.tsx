import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ModuleContentSummary } from '@/components/ModuleContentSummary';
import {
  useAssignmentsList,
  useDiscussionTopicsList,
  useMaterialsList,
  useModulesList,
  usePresentationsList,
  useQuizzesList,
} from '@/lib/queries';
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
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(titleKey)}</div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

export function StudentModulesPage(): JSX.Element {
  const { t } = useTranslation();
  const { courseId } = useParams();
  const id = courseId ?? '';
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

  const renderMaterial = (mat: MaterialSummary): JSX.Element => (
    <li key={mat.id}>
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
    </li>
  );

  const renderPresentation = (p: PresentationSummary): JSX.Element => (
    <li key={p.id}>
      <ItemRow
        to={`/student/courses/${id}/presentations/${p.id}`}
        title={p.title}
        meta={
          <span className="text-xs text-muted-foreground">
            {t('presentations.slidesCount', { count: p.slideCount })}
          </span>
        }
      />
    </li>
  );

  const renderAssignment = (a: AssignmentSummary): JSX.Element => {
    const mine = a.mySubmission ?? null;
    // Same draft-vs-submitted gating as the Assignments list page: the
    // draft row that POST /submissions creates on first open shouldn't
    // count as "submitted" in the module overview.
    const hasSubmitted = mine && mine.status !== 'draft';
    return (
      <li key={a.id}>
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
      <header>
        <h2 className="text-xl font-semibold">{t('modules.title')}</h2>
      </header>

      {modulesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !modulesQ.data || modulesQ.data.length === 0 ? (
        <p className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          {t('modules.empty')}
        </p>
      ) : (
        <Accordion single className="space-y-3">
          {modulesQ.data.map((m) => {
            const mats = matsByModule.get(m.id) ?? [];
            const pres = presByModule.get(m.id) ?? [];
            const asgs = asgByModule.get(m.id) ?? [];
            const qzs = qzByModule.get(m.id) ?? [];
            const dscs = dscByModule.get(m.id) ?? [];
            const total = mats.length + pres.length + asgs.length + qzs.length + dscs.length;
            return (
              <AccordionItem key={m.id} value={m.id}>
                <AccordionTrigger>
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-medium">{m.title}</span>
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
  );
}
