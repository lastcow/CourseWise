import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function PrivacyPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Privacy Policy"
        summary="How [COMPANY LEGAL NAME] handles personal information, education records, and the rights of the people they belong to."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Who we are</h2>
      <p>
        [COMPANY LEGAL NAME] (registered at [REGISTERED ADDRESS], [STATE], United
        States) operates the CourseWise platform, a software service that helps
        teachers author and assign reading material, run AI-graded discussion,
        and report on student understanding. We sell CourseWise to educational
        institutions such as schools, school districts, colleges, and
        universities. For most personal information that flows through the
        product, the institution is the data controller and [COMPANY LEGAL NAME]
        is its service provider (a "school official" under FERPA, and a
        processor for purposes of state privacy law). This policy describes the
        information we handle in both that role and our own role as the
        operator of the CourseWise website and marketing pages.
      </p>

      <h2>What we collect</h2>
      <p>
        We collect three broad categories of information, and we try to be
        specific about each because they are governed by different rules.
      </p>
      <h3>Information schools provide to us</h3>
      <p>
        When [INSTITUTION NAME] contracts with us, the institution provisions
        teacher accounts and may upload or sync student rosters, course
        enrollments, and class section data. Where rosters are involved we
        typically receive student names, the institution's own student
        identifier, grade level or course section, and the email address the
        institution has assigned. We do not require home addresses, phone
        numbers, dates of birth, government identifiers, or biometric data, and
        we ask schools not to send them.
      </p>
      <h3>Information generated through use of the product</h3>
      <p>
        As students and teachers use CourseWise we record what is necessary to
        operate the service: the reading materials assigned to a class, student
        responses to AI-graded prompts and discussion questions, the
        AI-generated feedback returned to those responses, scores and progress
        indicators, and timestamps for activity. Teachers can also upload
        source documents (for example a PDF excerpt) that we process to
        generate questions and reading material.
      </p>
      <h3>Information collected automatically</h3>
      <p>
        Like most web applications, CourseWise records technical information
        needed to deliver and secure the service: IP address, browser and
        device type, pages requested, error traces, and request timing. On the
        public marketing pages we use a minimal set of cookies described in our{' '}
        <Link to="/legal/cookies">Cookies notice</Link>. We do not use
        third-party advertising trackers anywhere in the product or on the
        marketing site.
      </p>

      <h2>Why we collect it</h2>
      <p>
        We use information only for purposes that are necessary to provide the
        service the institution has asked us to provide, to keep that service
        secure and available, and to improve it within the limits described
        below. Specifically, we use information to:
      </p>
      <ul>
        <li>
          Authenticate users, route them to the correct class, and display the
          right material to the right student.
        </li>
        <li>
          Generate AI feedback, grades, and analytics that the teacher and
          institution have configured the product to produce.
        </li>
        <li>
          Detect, investigate, and respond to abuse, fraud, and security
          incidents.
        </li>
        <li>
          Diagnose bugs, measure performance, and plan capacity. Diagnostic
          telemetry uses the minimum data needed and is access-controlled.
        </li>
        <li>
          Communicate with administrators and teachers about their account,
          billing, scheduled maintenance, and material security events.
        </li>
      </ul>
      <p>
        We do not sell personal information. We do not use student data to
        train third-party AI models, and our contracts with AI subprocessors
        prohibit them from doing so on data we send through them on behalf of
        schools.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We share information with a small set of vetted subprocessors that
        provide the infrastructure CourseWise runs on. The current list is
        published at{' '}
        <Link to="/legal/subprocessors">/legal/subprocessors</Link> and includes
        our cloud hosting and storage provider, our managed Postgres database
        provider, and the provider of the large language model we use for
        AI-generated feedback. Each subprocessor is bound by a written data
        processing agreement that restricts use of the data to the services
        they perform for us.
      </p>
      <p>
        We may also share information with the institution that owns the
        account (for example, returning a teacher's roster or a student's work
        to their school), with auditors and counsel under confidentiality, and
        with law enforcement when we are required to do so by valid legal
        process. Before we disclose information in response to legal process
        we attempt, where lawful, to notify the institution so it can object.
      </p>

      <h2>Retention</h2>
      <p>
        For information processed on behalf of an institution, the institution
        sets the retention schedule in its agreement with us. By default we
        retain active-account data for the duration of the contract and for a
        short period afterward to permit export. On contract termination we
        delete or return institutional data within the period set in the
        agreement (typically thirty to ninety days), excluding backups that age
        out on their own schedule and information we are required by law to
        retain. Operational logs are retained for a shorter window (typically
        thirty to ninety days) and are not used to build long-term profiles of
        individual users.
      </p>

      <h2>Children's data</h2>
      <p>
        CourseWise is designed for use inside a school. When a school assigns
        CourseWise to a class that includes children under thirteen, the school
        acts in loco parentis and provides consent on the parent's behalf
        consistent with the operator exception under COPPA, and we limit our
        use of that information to the educational purpose authorized by the
        school. Our specific commitments around younger students are described
        in our <Link to="/legal/coppa">COPPA notice</Link> and our{' '}
        <Link to="/legal/ferpa">FERPA statement</Link>.
      </p>

      <h2>Your rights</h2>
      <p>
        If you are a student, parent, teacher, or other individual whose
        information we process on behalf of a school, your rights to access,
        correct, or delete that information are administered by the school as
        the controller of the data. We will support the school in responding
        to your request. If you are unsure who to contact, start with the
        school's privacy officer or registrar.
      </p>
      <p>
        If you are a visitor to our marketing site, a teacher who has signed up
        directly without an institutional contract, or otherwise interacting
        with us outside a school relationship, you may contact us directly to
        access, correct, or delete the limited information we hold about you.
        Where state privacy law (for example in California, Colorado,
        Connecticut, or Virginia) gives you specific rights, we honor them at
        the level the law requires.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about this policy, to exercise your rights, or to file a
        request on behalf of a student, please use our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>. Requests are
        routed to [COMPANY LEGAL NAME]'s privacy team and acknowledged within
        the timeframe required by applicable law.
      </p>
    </>
  );
}
