import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { apiCall } from '@/lib/api';

type RequesterType = 'parent' | 'eligible_student' | 'records_officer' | 'other';
type ActionRequested = 'inspect' | 'amend' | 'delete';
type RecordCategory =
  | 'education_records'
  | 'ai_generation_history'
  | 'account'
  | 'discussion_posts'
  | 'other';

const ALL_RECORD_CATEGORIES: RecordCategory[] = [
  'education_records',
  'ai_generation_history',
  'account',
  'discussion_posts',
  'other',
];

// Each enum value maps to a dotted i18n key under
// public.legal.dataRequestsForm.{requester|category|action}; resolved at
// render via the existing useTranslation hook.
const REQUESTER_LABEL_KEY: Record<RequesterType, string> = {
  parent: 'public.legal.dataRequestsForm.requester.parent',
  eligible_student: 'public.legal.dataRequestsForm.requester.eligibleStudent',
  records_officer: 'public.legal.dataRequestsForm.requester.recordsOfficer',
  other: 'public.legal.dataRequestsForm.requester.other',
};

const CATEGORY_LABEL_KEY: Record<RecordCategory, string> = {
  education_records: 'public.legal.dataRequestsForm.category.educationRecords',
  ai_generation_history:
    'public.legal.dataRequestsForm.category.aiGenerationHistory',
  account: 'public.legal.dataRequestsForm.category.account',
  discussion_posts: 'public.legal.dataRequestsForm.category.discussionPosts',
  other: 'public.legal.dataRequestsForm.category.other',
};

const ACTION_LABEL_KEY: Record<ActionRequested, string> = {
  inspect: 'public.legal.dataRequestsForm.action.inspect',
  amend: 'public.legal.dataRequestsForm.action.amend',
  delete: 'public.legal.dataRequestsForm.action.delete',
};

export function DataRequestsPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const [requesterType, setRequesterType] = useState<RequesterType>('parent');
  const [action, setAction] = useState<ActionRequested>('inspect');
  const [categories, setCategories] = useState<Set<RecordCategory>>(
    () => new Set<RecordCategory>(['education_records']),
  );

  function toggleCategory(c: RecordCategory): void {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    const email = String(form.get('email') ?? '').trim();
    const institution = String(form.get('institution') ?? '').trim();
    const relationship = String(form.get('relationship') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();

    if (!firstName || !lastName || !email) {
      toast.push({
        title: t('public.legal.dataRequestsForm.nameEmailRequired'),
        tone: 'error',
      });
      return;
    }
    if (categories.size === 0) {
      toast.push({
        title: t('public.legal.dataRequestsForm.categoryRequired'),
        tone: 'error',
      });
      return;
    }
    if (description.length < 10) {
      toast.push({
        title: t('public.legal.dataRequestsForm.descriptionMinLength'),
        tone: 'error',
      });
      return;
    }
    if (description.length > 4000) {
      toast.push({
        title: t('public.legal.dataRequestsForm.descriptionMaxLength'),
        tone: 'error',
      });
      return;
    }

    const recordCategories = Array.from(categories);
    const payload = {
      requesterType,
      relationship,
      recordCategories,
      action,
      description,
    };

    const summary = [
      `Requester type: ${requesterType}`,
      `Action requested: ${action}`,
      `Record categories: ${recordCategories.join(', ') || '(none selected)'}`,
      `Relationship: ${relationship || '(blank)'}`,
      '',
      'Description:',
      description,
      '',
      '---',
      'Structured payload:',
      JSON.stringify(payload, null, 2),
    ].join('\n');

    setPending(true);
    try {
      // TODO: replace this generic /api/contact intake with a dedicated
      // /api/legal/data-requests endpoint that writes a DB-backed request
      // ticket (with status, verification state, and SLA tracking) into a
      // queue reviewable by the privacy officer.
      await apiCall<{ received: boolean }>('/api/contact', {
        method: 'POST',
        body: {
          subject: 'other',
          name: `${firstName} ${lastName}`.trim(),
          email,
          institution: institution || undefined,
          message: summary,
        },
        auth: false,
      });
      setDone(true);
    } catch {
      toast.push({
        title: t('public.legal.dataRequestsForm.submitFailed'),
        tone: 'error',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <LegalPageHeader
        title="Data Requests"
        summary="How to submit a FERPA records request, and how CourseWise LLC handles it."
        lastUpdated="2026-05-29"
        version="v1.0"
      />

      <h2>Who can submit</h2>
      <p>
        Under the Family Educational Rights and Privacy Act, the right to
        inspect, amend, or restrict the disclosure of a student's education
        records rests with the institution that maintains those records. The
        appropriate intake for most requests is the registrar or privacy
        officer at your institution. The form below is for requests
        directed to CourseWise LLC in its role as a school official, or
        for requests an institution's records officer asks us to handle
        directly because the data lives in our systems.
      </p>
      <p>
        Parents of students under eighteen, eligible students (eighteen or
        older, or enrolled in postsecondary education), institutional records
        officers, and other parties with a valid legal basis may use this
        intake. If you are uncertain which channel applies, write to us
        anyway — we will either act on the request or route it to the
        institution and tell you what we did.
      </p>

      <h2>What you can request</h2>
      <p>
        You may ask us to (i) confirm whether we hold records about a
        specific student and provide a copy of those records in a portable
        format, (ii) amend or correct records you believe are inaccurate or
        misleading, or (iii) delete records that the institution has the
        authority to remove. Records that may live in CourseWise include
        coursework attempts, AI-graded responses, AI prompts and generations
        tied to a student account, discussion posts, account profile
        information, and activity logs used to operate and secure the
        Service.
      </p>

      <h2>How we verify</h2>
      <p>
        Because education records are protected, we will not release them on
        the strength of a form alone. After we receive a request we contact
        the institution's records officer to confirm the requester's
        identity and authority, and we ask the requester for reasonable
        verification (institution email match, government ID where
        appropriate, or a verification step run by the institution). For
        deletion or amendment, we generally require written confirmation
        from the institution before changing records, because the
        institution — not the vendor — is the legal custodian.
      </p>

      <h2>Response timeline</h2>
      <p>
        We acknowledge receipt within seven calendar days. We complete most
        requests within thirty days of verification. If a request is unusually
        complex or requires coordination with the institution we may extend
        once for up to thirty additional days and will tell you the reason
        for the extension. We do not charge a fee for a first reasonable
        request. We may charge a reasonable cost-based fee for repeated or
        manifestly excessive requests, and will say so before doing the
        work. We will not retaliate against any requester for exercising
        these rights.
      </p>

      <h2>Submit a request</h2>
      <p>
        Use the form below. Fields marked required must be filled in. The
        more specific you are about the student, the time window, and the
        records involved, the faster we can act.
      </p>

      <div className="rounded-2xl border bg-white p-6 my-8 not-prose">
        {done ? (
          <div className="text-center py-6">
            <h3 className="text-lg font-semibold">
              {t('public.legal.dataRequestsForm.doneTitle')}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('public.legal.dataRequestsForm.doneBody')}
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <div className="text-sm font-semibold">
                {t('public.legal.dataRequestsForm.contactInformation')}
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="dr-first">
                    {t('public.legal.dataRequestsForm.firstNameLabel')}
                  </Label>
                  <Input id="dr-first" name="firstName" required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="dr-last">
                    {t('public.legal.dataRequestsForm.lastNameLabel')}
                  </Label>
                  <Input id="dr-last" name="lastName" required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="dr-email">
                    {t('public.legal.dataRequestsForm.emailLabel')}
                  </Label>
                  <Input id="dr-email" name="email" type="email" required maxLength={200} />
                </div>
                <div>
                  <Label htmlFor="dr-institution">
                    {t('public.legal.dataRequestsForm.institutionLabel')}
                  </Label>
                  <Input id="dr-institution" name="institution" maxLength={200} />
                </div>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold">
                {t('public.legal.dataRequestsForm.requesterTypeLegend')}
              </legend>
              <div className="mt-3 space-y-2">
                {(Object.keys(REQUESTER_LABEL_KEY) as RequesterType[]).map((value) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="requesterType"
                      value={value}
                      checked={requesterType === value}
                      onChange={() => setRequesterType(value)}
                      className="mt-1"
                    />
                    <span>{t(REQUESTER_LABEL_KEY[value])}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="dr-relationship">
                {t('public.legal.dataRequestsForm.relationshipLabel')}
              </Label>
              <Input
                id="dr-relationship"
                name="relationship"
                placeholder={t(
                  'public.legal.dataRequestsForm.relationshipPlaceholder',
                )}
                maxLength={300}
              />
            </div>

            <fieldset>
              <legend className="text-sm font-semibold">
                {t('public.legal.dataRequestsForm.recordCategoryLegend')}
              </legend>
              <div className="mt-3 space-y-2">
                {ALL_RECORD_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categories.has(c)}
                      onChange={() => toggleCategory(c)}
                      className="mt-1"
                    />
                    <span>{t(CATEGORY_LABEL_KEY[c])}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">
                {t('public.legal.dataRequestsForm.actionRequestedLegend')}
              </legend>
              <div className="mt-3 space-y-2">
                {(Object.keys(ACTION_LABEL_KEY) as ActionRequested[]).map((value) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="action"
                      value={value}
                      checked={action === value}
                      onChange={() => setAction(value)}
                      className="mt-1"
                    />
                    <span>{t(ACTION_LABEL_KEY[value])}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="dr-description">
                {t('public.legal.dataRequestsForm.descriptionLabel')}
              </Label>
              <Textarea
                id="dr-description"
                name="description"
                required
                rows={6}
                minLength={10}
                maxLength={4000}
                placeholder={t(
                  'public.legal.dataRequestsForm.descriptionPlaceholder',
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('public.legal.dataRequestsForm.descriptionHint')}
              </p>
            </div>

            <Button type="submit" disabled={pending} className="w-full">
              {pending
                ? t('public.legal.dataRequestsForm.submitting')
                : t('public.legal.dataRequestsForm.submitCta')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('public.legal.dataRequestsForm.submitDisclaimer')}
            </p>
          </form>
        )}
      </div>

      <h2>Contact</h2>
      <p>
        For questions that are not FERPA records requests — sales, partner
        inquiries, press — use the general <Link to="/contact">contact form</Link>.
        Security researchers should follow the{' '}
        <Link to="/legal/responsible-disclosure">responsible-disclosure policy</Link>
        .
      </p>
    </>
  );
}
