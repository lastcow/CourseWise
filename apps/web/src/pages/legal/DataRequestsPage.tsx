import { useState } from 'react';
import { Link } from 'react-router-dom';
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

const REQUESTER_LABEL: Record<RequesterType, string> = {
  parent: 'Parent or legal guardian',
  eligible_student: 'Eligible student (18+ or in postsecondary)',
  records_officer: 'Institutional records officer',
  other: 'Other',
};

const CATEGORY_LABEL: Record<RecordCategory, string> = {
  education_records: 'Education records (coursework, scores, progress)',
  ai_generation_history: 'AI generation history (prompts, responses)',
  account: 'Account information (name, email, role)',
  discussion_posts: 'Discussion posts and comments',
  other: 'Other (describe below)',
};

const ACTION_LABEL: Record<ActionRequested, string> = {
  inspect: 'Inspect / get a copy',
  amend: 'Amend or correct',
  delete: 'Delete',
};

export function DataRequestsPage(): JSX.Element {
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
      toast.push({ title: 'Please provide your name and email.', tone: 'error' });
      return;
    }
    if (categories.size === 0) {
      toast.push({ title: 'Select at least one record category.', tone: 'error' });
      return;
    }
    if (description.length < 10) {
      toast.push({ title: 'Please describe the request in more detail (10+ characters).', tone: 'error' });
      return;
    }
    if (description.length > 4000) {
      toast.push({ title: 'Description is too long (max 4000 characters).', tone: 'error' });
      return;
    }

    const payload = {
      requesterType,
      relationship,
      recordCategories: Array.from(categories),
      action,
      description,
    };

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
          message: JSON.stringify(payload),
        },
        auth: false,
      });
      setDone(true);
    } catch {
      toast.push({ title: 'Something went wrong. Please try again or email us.', tone: 'error' });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <LegalPageHeader
        title="Data Requests"
        summary="How to submit a FERPA records request, and how [COMPANY LEGAL NAME] handles it."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Who can submit</h2>
      <p>
        Under the Family Educational Rights and Privacy Act, the right to
        inspect, amend, or restrict the disclosure of a student's education
        records rests with the institution that maintains those records. The
        appropriate intake for most requests is the registrar or privacy
        officer at [INSTITUTION NAME]. The form below is for requests
        directed to [COMPANY LEGAL NAME] in its role as a school official, or
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
            <h3 className="text-lg font-semibold">Request received.</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We respond within 7 calendar days and will email a receipt.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <div className="text-sm font-semibold">Your contact information</div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="dr-first">First name</Label>
                  <Input id="dr-first" name="firstName" required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="dr-last">Last name</Label>
                  <Input id="dr-last" name="lastName" required maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="dr-email">Email</Label>
                  <Input id="dr-email" name="email" type="email" required maxLength={200} />
                </div>
                <div>
                  <Label htmlFor="dr-institution">Institution</Label>
                  <Input id="dr-institution" name="institution" maxLength={200} />
                </div>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold">Requester type</legend>
              <div className="mt-3 space-y-2">
                {(Object.keys(REQUESTER_LABEL) as RequesterType[]).map((value) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="requesterType"
                      value={value}
                      checked={requesterType === value}
                      onChange={() => setRequesterType(value)}
                      className="mt-1"
                    />
                    <span>{REQUESTER_LABEL[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="dr-relationship">Relationship to the institution</Label>
              <Input
                id="dr-relationship"
                name="relationship"
                placeholder="e.g. Parent of student Jane Doe, 10th grade"
                maxLength={300}
              />
            </div>

            <fieldset>
              <legend className="text-sm font-semibold">Record category (select all that apply)</legend>
              <div className="mt-3 space-y-2">
                {ALL_RECORD_CATEGORIES.map((c) => (
                  <label key={c} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categories.has(c)}
                      onChange={() => toggleCategory(c)}
                      className="mt-1"
                    />
                    <span>{CATEGORY_LABEL[c]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">Action requested</legend>
              <div className="mt-3 space-y-2">
                {(Object.keys(ACTION_LABEL) as ActionRequested[]).map((value) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="action"
                      value={value}
                      checked={action === value}
                      onChange={() => setAction(value)}
                      className="mt-1"
                    />
                    <span>{ACTION_LABEL[value]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="dr-description">Description</Label>
              <Textarea
                id="dr-description"
                name="description"
                required
                rows={6}
                minLength={10}
                maxLength={4000}
                placeholder="Identify the student(s), the time window, and any specific records or events you are asking us to inspect, amend, or delete."
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Between 10 and 4000 characters.
              </p>
            </div>

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'Submitting…' : 'Submit request'}
            </Button>
            <p className="text-xs text-muted-foreground">
              By submitting, you confirm that the information above is accurate. We will
              email a receipt and follow up about verification.
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
