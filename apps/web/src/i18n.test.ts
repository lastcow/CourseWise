import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBMISSION_STATUSES, QUIZ_ATTEMPT_STATUSES } from '@coursewise/shared';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { zhCN } from './locales/zh-CN';

// Locales are independent `as const` objects (no `satisfies typeof en`), so a
// missing/renamed key isn't a compile error — it only shows as raw key text at
// runtime. These tests are the guard rail: locale parity + every static
// `t('...')` key resolving in en.

const SRC = dirname(fileURLToPath(import.meta.url));
// i18next plural suffixes; zh-CN only needs `_other`, so compare base keys.
const PLURAL = /_(zero|one|two|few|many|other)$/;

type Dict = { [k: string]: unknown };

function flatten(obj: Dict, prefix = '', out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v as Dict, key, out);
    else out.add(key);
  }
  return out;
}
const exactKeys = (res: { translation: Dict }): Set<string> => flatten(res.translation);
const baseKeys = (res: { translation: Dict }): Set<string> =>
  new Set([...exactKeys(res)].map((k) => k.replace(PLURAL, '')));

const EN_EXACT = exactKeys(en);
const EN = baseKeys(en);
const FR = baseKeys(fr);
const ZH = baseKeys(zhCN);

describe('i18n locale parity', () => {
  it('fr has exactly the same keys as en', () => {
    expect({
      missingInFr: [...EN].filter((k) => !FR.has(k)).sort(),
      extraInFr: [...FR].filter((k) => !EN.has(k)).sort(),
    }).toEqual({ missingInFr: [], extraInFr: [] });
  });

  it('zh-CN has exactly the same keys as en', () => {
    expect({
      missingInZh: [...EN].filter((k) => !ZH.has(k)).sort(),
      extraInZh: [...ZH].filter((k) => !EN.has(k)).sort(),
    }).toEqual({ missingInZh: [], extraInZh: [] });
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'locales' && e.name !== 'node_modules') sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

describe('i18n key usage', () => {
  it('every static t("...") key exists in en', () => {
    const re = /\bt\(\s*(['"])([A-Za-z0-9_.]+)\1/g;
    const missing: Record<string, string> = {};
    for (const file of sourceFiles(SRC)) {
      const txt = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt)) !== null) {
        const key = m[2]!;
        if (!EN.has(key.replace(PLURAL, '')) && !(key in missing)) {
          missing[key] = relative(SRC, file);
        }
      }
    }
    // Map of unresolved key -> first file that uses it.
    expect(missing).toEqual({});
  });

  // Spot-check the most common dynamic `t(`prefix.${enumValue}`)` families,
  // whose key-construction is deterministic, against the enum source of truth.
  it('status enums map to existing keys', () => {
    const cap = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
    const expected = [
      ...SUBMISSION_STATUSES.map((s) => `submissions.status${cap(s)}`),
      ...QUIZ_ATTEMPT_STATUSES.map((s) => `quizzes.attemptStatus.${s}`),
    ];
    expect(expected.filter((k) => !EN_EXACT.has(k))).toEqual([]);
  });
});
