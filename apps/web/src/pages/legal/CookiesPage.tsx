import { Link } from 'react-router-dom';
import { LegalPageHeader } from '@/components/legal/LegalPageHeader';

export function CookiesPage(): JSX.Element {
  return (
    <>
      <LegalPageHeader
        title="Cookies and local storage"
        summary="What [COMPANY LEGAL NAME] stores in your browser — cookies and local storage — and why."
        lastUpdated="2026-05-19"
        version="v0.1-draft"
      />

      <p>
        CourseWise today does not set any HTTP cookies of its own. The
        signed-in session, the cached profile, and your language preference
        are all kept in your browser's <code>localStorage</code>, which the
        application reads on each page load. We use the word "cookies" in
        this page's title because that is the term most readers expect, but
        the items listed below are storage entries, not cookies. We include
        this distinction because clearing cookies in your browser will not
        always remove these values; you may need to clear site data or sign
        out to remove them.
      </p>

      <h2>Essential storage items</h2>
      <p>
        CourseWise relies on a small set of essential, first-party storage
        items to operate. They keep you signed in across pages, remember
        your language choice, and let the UI render correctly before the
        first API call returns. We treat these as strictly necessary:
        without them the Service cannot deliver its core functionality, so
        we do not present a consent banner for them, consistent with the
        "strictly necessary" exemption common to US state and EU cookie
        rules.
      </p>

      <h2>Optional analytics</h2>
      <p>
        CourseWise does not currently load third-party advertising,
        cross-site tracking, or behavioral-analytics pixels. We may at
        some point introduce a privacy-respecting product-analytics tool
        to understand which parts of the product are used. Before doing
        so we will update this page, list the tool and the cookies,
        storage items, or identifiers it sets, give a plain explanation
        of the data collected, and where the law requires consent we
        will ask for it on the first visit and remember the choice.
        Analytics will never be enabled inside an institution's tenant
        without that institution's authorization.
      </p>

      <h2>Opt-out</h2>
      <p>
        Because the storage items we set today are strictly necessary,
        there is no in-product toggle to disable them; clearing them logs
        you out and resets your language preference. Browsers offer their
        own controls to block or clear cookies and site storage; using
        those controls will prevent CourseWise from working until you sign
        in again. If we add optional analytics in the future, that toggle
        will appear in your account settings.
      </p>

      <h2>List of cookies and local storage</h2>
      <p>
        The current set is short and we keep it that way. The table below
        lists what may be stored in your browser when you use CourseWise,
        and whether each item is a cookie or a <code>localStorage</code>{' '}
        entry.
      </p>

      <div className="not-prose my-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Storage</th>
              <th className="px-3 py-2 font-semibold">Purpose</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Expires</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b align-top">
              <td className="px-3 py-2 font-mono text-xs">coursewise.accessToken</td>
              <td className="px-3 py-2">localStorage</td>
              <td className="px-3 py-2">Short-lived access token used to authenticate API requests for the signed-in user.</td>
              <td className="px-3 py-2">First-party, essential</td>
              <td className="px-3 py-2">Persists until logout, token rotation, or you clear site storage</td>
            </tr>
            <tr className="border-b align-top">
              <td className="px-3 py-2 font-mono text-xs">coursewise.refreshToken</td>
              <td className="px-3 py-2">localStorage</td>
              <td className="px-3 py-2">Long-lived refresh token used to mint a new access token without re-entering a password.</td>
              <td className="px-3 py-2">First-party, essential</td>
              <td className="px-3 py-2">Persists until logout, revocation, or you clear site storage</td>
            </tr>
            <tr className="border-b align-top">
              <td className="px-3 py-2 font-mono text-xs">coursewise.user</td>
              <td className="px-3 py-2">localStorage</td>
              <td className="px-3 py-2">Minimal profile (id, role, preferred language) so the UI renders correctly before the first API call returns.</td>
              <td className="px-3 py-2">First-party, essential</td>
              <td className="px-3 py-2">Persists until logout or you clear site storage</td>
            </tr>
            <tr className="align-top">
              <td className="px-3 py-2 font-mono text-xs">i18nextLng</td>
              <td className="px-3 py-2">localStorage</td>
              <td className="px-3 py-2">Remembers the language you selected for the interface.</td>
              <td className="px-3 py-2">First-party, essential</td>
              <td className="px-3 py-2">Persists until you clear site storage</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        We do not currently set any HTTP cookies. The API uses a
        bearer-token scheme over <code>fetch</code> with same-origin
        requests and an explicit <code>Authorization</code> header, so no
        session cookie or CSRF cookie is required. If that ever changes —
        for example, if we move to cookie-backed sessions — we will list
        each cookie in the table above, including its name, scope,
        attributes (<code>HttpOnly</code>, <code>Secure</code>,{' '}
        <code>SameSite</code>), and lifetime.
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
