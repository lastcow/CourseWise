import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function SubprocessorsPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Subprocessors"
        summary="The third-party vendors that [COMPANY LEGAL NAME] uses to deliver CourseWise, and how we change the list."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Current subprocessors</h2>
      <p>
        The vendors below process limited categories of customer data on
        [COMPANY LEGAL NAME]'s instructions to deliver specific parts of the
        Service. Each is bound by a written data processing agreement that
        restricts use of the data to the service performed and prohibits
        further disclosure.
      </p>

      <div className="not-prose my-6 overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 font-medium">Region</th>
              <th className="px-3 py-2 font-medium">Purpose</th>
              <th className="px-3 py-2 font-medium">DPA</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="px-3 py-3 font-medium">Cloudflare</td>
              <td className="px-3 py-3">Workers, R2, AI Gateway, KV</td>
              <td className="px-3 py-3">Global (edge)</td>
              <td className="px-3 py-3">
                Application hosting, file storage, AI provider gateway,
                rate-limit cache
              </td>
              <td className="px-3 py-3">
                <a
                  href="https://www.cloudflare.com/cloudflare-customer-dpa/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-700 underline"
                >
                  DPA
                </a>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-3 font-medium">Neon</td>
              <td className="px-3 py-3">Postgres</td>
              <td className="px-3 py-3">us-east-1 (configurable)</td>
              <td className="px-3 py-3">Primary database</td>
              <td className="px-3 py-3">
                <a
                  href="https://neon.tech/dpa"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-700 underline"
                >
                  DPA
                </a>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-3 font-medium">Anthropic</td>
              <td className="px-3 py-3">Claude API</td>
              <td className="px-3 py-3">United States</td>
              <td className="px-3 py-3">
                Generative AI for material authoring and AI-graded responses
              </td>
              <td className="px-3 py-3">
                <a
                  href="https://www.anthropic.com/legal/dpa"
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-700 underline"
                >
                  DPA
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Notification of changes</h2>
      <p>
        Before we add or replace a subprocessor that will process customer
        personal information, we update this page and notify institutional
        customers at least thirty days in advance through the contact on file.
        Institutions that have objection rights in their agreement may object
        in writing during the notice period, and we will work in good faith to
        offer a commercially reasonable alternative or, failing that, to honor
        the termination rights set out in the contract.
      </p>

      <h2>Subprocessor assessment criteria</h2>
      <p>
        We evaluate each prospective subprocessor against, at minimum:
      </p>
      <ul>
        <li>
          A current independent security attestation (for example SOC 2 Type
          II, ISO 27001) or an equivalent program we can review.
        </li>
        <li>
          A data processing agreement on terms that flow down the
          confidentiality, security, sub-processing, and incident-notification
          commitments we make to our customers.
        </li>
        <li>
          Hosting region and data-residency controls that match what we promise
          customers, and that support institutional restrictions on
          cross-border transfer.
        </li>
        <li>
          A documented incident response process, including a defined
          notification timeline back to us as the customer of the
          subprocessor.
        </li>
        <li>
          A contractual prohibition on using customer data to train the
          vendor's own models or for any purpose beyond delivering the
          service.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        For questions about this list, to request a copy of a subprocessor's
        DPA, or to file an objection to a planned change, please use our{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
