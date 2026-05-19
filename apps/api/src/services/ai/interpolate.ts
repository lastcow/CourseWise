const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Replace `{{name}}` occurrences in `template` with values from `vars`.
 * - Variable names not in `vars` substitute to '' and emit one console.warn.
 * - Empty-string values pass through as ''.
 * - No conditionals, no escapes, no nested templates.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const out = template.replace(PLACEHOLDER_RE, (_, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name] ?? '';
    missing.add(name);
    return '';
  });
  if (missing.size > 0) {
    console.warn('interpolate: unknown variables', { missing: Array.from(missing) });
  }
  return out;
}
