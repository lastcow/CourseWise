import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function CookiesPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Cookies Statement"
        summary="What [COMPANY LEGAL NAME] stores in your browser and why."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <h2>Essential cookies</h2>
      <p>
        CourseWise relies on a small set of essential, first-party cookies
        and browser storage values to operate. They keep you signed in
        across pages, remember your language choice, and protect the
        application from cross-site request forgery. We treat these as
        strictly necessary: without them the Service cannot deliver its
        core functionality, so we do not present a consent banner for
        them, consistent with the "strictly necessary" exemption common to
        US state and EU cookie rules.
      </p>

      <h2>Optional analytics</h2>
      <p>
        CourseWise does not currently load third-party advertising,
        cross-site tracking, or behavioral-analytics pixels. We may at
        some point introduce a privacy-respecting product-analytics tool
        to understand which parts of the product are used. Before doing
        so we will update this page, list the tool and the cookies or
        identifiers it sets, give a plain explanation of the data
        collected, and where the law requires consent we will ask for it
        on the first visit and remember the choice. Analytics will never
        be enabled inside an institution's tenant without that
        institution's authorization.
      </p>

      <h2>Opt-out</h2>
      <p>
        Because the cookies we set today are strictly necessary, there is
        no in-product toggle to disable them; clearing them logs you out
        and resets your language preference. Browsers offer their own
        controls to block or clear cookies and storage; using those
        controls will prevent CourseWise from working until you sign in
        again. If we add optional analytics in the future, that toggle
        will appear in your account settings.
      </p>

      <h2>List of cookies</h2>
      <p>
        The current set is short and we keep it that way. The table below
        lists what may be stored in your browser when you use CourseWise.
      </p>

      <div className="not-prose my-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Purpose</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Expires</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b align-top">
              <td className="px-3 py-2 font-mono text-xs">coursewise.accessToken</td>
              <td className="px-3 py-2">Short-lived access token used to authenticate API requests for the signed-in user.</td>
              <td className="px-3 py-2">First-party, localStorage</td>
              <td className="px-3 py-2">On sign-out or token rotation</td>
            </tr>
            <tr className="border-b align-top">
              <td className="px-3 py-2 font-mono text-xs">coursewise.refreshToken</td>
              <td className="px-3 py-2">Long-lived refresh token used to mint a new access token without re-entering a password.</td>
              <td className="px-3 py-2">First-party, localStorage</td>
              <td className="px-3 py-2">On sign-out or revocation</td>
            </tr>
            <tr className="border-b align-top">
              <td className="px-3 py-2 font-mono text-xs">coursewise.user</td>
              <td className="px-3 py-2">Minimal profile (id, role, preferred language) so the UI renders correctly before the first API call returns.</td>
              <td className="px-3 py-2">First-party, localStorage</td>
              <td className="px-3 py-2">On sign-out</td>
            </tr>
            <tr className="align-top">
              <td className="px-3 py-2 font-mono text-xs">i18nextLng</td>
              <td className="px-3 py-2">Remembers the language you selected for the interface.</td>
              <td className="px-3 py-2">First-party, localStorage</td>
              <td className="px-3 py-2">Until you clear browser storage</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        We do not set CSRF cookies because the API uses a bearer-token
        scheme over fetch with same-origin and explicit Authorization
        headers; if that changes we will list the new cookie here.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about what we store, or a request to clear data
        associated with your account, can be sent through the{' '}
        <Link to="/legal/data-requests">Data Requests page</Link>.
      </p>
    </>
  );
}
