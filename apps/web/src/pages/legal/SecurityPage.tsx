import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function SecurityPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Security & Trust"
        summary="How [COMPANY LEGAL NAME] protects the data that flows through CourseWise."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Encryption</h2>
      <p>
        All traffic between end users and CourseWise is encrypted in transit
        using TLS 1.2 or above, terminated at the Cloudflare edge in front of
        our application. Internal traffic between the application and our
        managed Postgres database (Neon) is also encrypted in transit. Data
        is encrypted at rest in the database, in object storage (Cloudflare
        R2), and in our key-value cache, using the AES-256 disk encryption
        provided by each platform. Secrets that the application needs at
        runtime (database connection strings, API keys for the Anthropic
        Claude API and other services) are held as encrypted Worker secrets
        and are never written to source control or to client-side bundles.
      </p>

      <h2>Access control</h2>
      <p>
        Within the application, access is enforced server-side by role
        (institution administrator, teacher, student) and scoped to the
        institution that owns the record. A user cannot reach another
        institution's data through the API, and teachers cannot reach the
        records of students they do not teach. When CourseWise is operating
        as a FERPA "school official," the additional confidentiality and
        purpose-limitation rules in that section of the{' '}
        <Link to="/legal/ferpa">FERPA statement</Link> apply.
      </p>
      <p>
        Internal administrative access to production systems is limited to a
        small set of engineers on the basis of least privilege and documented
        need. Production access uses single sign-on, multi-factor
        authentication, and short-lived credentials. Direct production
        database access is exceptional, logged, and approved in advance; the
        normal path for engineering work uses non-production environments
        with synthetic or de-identified data.
      </p>

      <h2>Audit logging</h2>
      <p>
        The application records security-relevant events including
        authentication, role assignment, permission changes, content
        creation and deletion, and administrative actions. Logs include the
        actor, the institution, the affected record, and a timestamp. We
        retain operational logs for a window sufficient to investigate
        incidents (typically thirty to ninety days) and longer where required
        by contract or law. Logs are access-controlled and are not used to
        build long-term profiles of individual users. Institutions may
        request a report of administrative or access events affecting their
        own records through the support channel.
      </p>

      <h2>Backup and recovery</h2>
      <p>
        Our managed Postgres provider performs continuous physical backups of
        the primary database, supporting point-in-time recovery within the
        retention window configured for each environment. Object storage in
        Cloudflare R2 is durably replicated across the provider's storage
        infrastructure. We rehearse restore procedures periodically and
        verify that a recovered database is consistent with the application.
        Backups are encrypted at rest and access to restore operations is
        limited to designated on-call engineers.
      </p>

      <h2>Vulnerability management</h2>
      <p>
        We track third-party dependency advisories through automated scanning
        on every change to the codebase and on a periodic schedule
        independent of changes. Identified vulnerabilities are triaged on a
        severity-based timeline: critical issues are addressed without delay,
        high-severity issues within days, and lower-severity issues within
        the normal release cadence. We perform internal review of
        security-sensitive changes (authentication, authorization, data
        export, AI prompt assembly) and arrange independent penetration
        testing of the platform on a periodic basis appropriate to its risk
        profile. Security researchers who identify issues are welcome to
        report them through our{' '}
        <Link to="/legal/responsible-disclosure">
          responsible-disclosure policy
        </Link>
        .
      </p>

      <h2>Incident response</h2>
      <p>
        We maintain a written incident-response plan with defined roles,
        severity levels, and communication paths. On detection of a suspected
        security incident affecting customer data we contain the incident,
        preserve evidence, and investigate root cause. If an incident
        involves unauthorized access to or disclosure of customer personal
        information, we notify the affected institutional customer without
        undue delay and consistent with the timeline set out in the
        agreement, with the information then known to us. We supplement that
        notice with a fuller report as the investigation progresses. Our
        contractual incident-notification commitments to customers flow down
        to our subprocessors so that we receive prompt notice of incidents in
        the systems they operate on our behalf.
      </p>

      <h2>Compliance status</h2>
      <p>
        CourseWise is designed to support institutional compliance with FERPA
        and applicable state student-privacy laws (for example, New York
        Education Law § 2-d, California SOPIPA, Illinois SOPPA, and Colorado
        HB 16-1423), and to honor the "school authorization" approach to
        COPPA for students under thirteen. [COMPANY LEGAL NAME] is working
        toward an independent SOC 2 Type II attestation and will publish the
        report through its trust process when available. Institutions with
        specific control-mapping or audit requests may request our current
        security questionnaire response and architecture documentation under
        NDA.
      </p>

      <h2>Contact</h2>
      <p>
        For security questions, to request our questionnaire response, or to
        coordinate an audit, please use our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>. To report a
        suspected vulnerability, follow our{' '}
        <Link to="/legal/responsible-disclosure">
          responsible-disclosure policy
        </Link>
        .
      </p>
    </>
  );
}
