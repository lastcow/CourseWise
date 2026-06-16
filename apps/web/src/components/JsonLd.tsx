/**
 * Renders a JSON-LD <script> for structured data. Inlined in the component tree
 * (valid in <body> per schema.org), so the build-time prerender captures it in
 * the static HTML crawlers receive. Use for page-specific structured data such
 * as FAQPage; site-level Organization/SoftwareApplication lives in index.html.
 */
export function JsonLd({ data }: { data: unknown }): JSX.Element {
  return (
    <script
      type="application/ld+json"
      // Pre-serialized JSON; React would otherwise HTML-escape the string.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
