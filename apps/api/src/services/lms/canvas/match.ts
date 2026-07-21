// Identity-matching ladder (docs/plans/2026-07-04-canvas-sync-v2 §6.3).
// Pure functions: given the Canvas roster reference and the CW enrollees,
// produce SUGGESTIONS only — nothing here ever writes a link. Two iron rules
// (§6.1): no link without human confirmation, and no orphan on either side
// may be silently swallowed. Name similarity is deliberately absent: it may
// order lists in the UI, never generate a suggestion.

export type SuggestionMethod = 'sis' | 'email' | 'login_id';

export interface MatchRosterEntry {
  id: string;
  canvasUserId: string;
  name: string;
  email: string | null;
  loginId: string | null;
  sisUserId: string | null;
}

export interface MatchStudent {
  userId: string;
  name: string;
  email: string;
  studentNumber: string | null;
}

export interface MatchSuggestion {
  rosterEntryId: string;
  canvasUserId: string;
  studentId: string;
  method: SuggestionMethod;
}

export interface MatchResult {
  suggestions: MatchSuggestion[];
  // Entries/students that matched MORE than one counterpart (at any ladder
  // level): suggestions are suppressed for them, manual linking only (§6.3).
  ambiguousRosterEntryIds: string[];
  ambiguousStudentIds: string[];
}

const norm = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t.toLowerCase() : null;
};

// Ladder, confidence-descending. Level ① uses studentNumber, which is the
// student's own claim (self-filled on their profile) — that IS the §6.3 ④
// claim signal cross-validated against Canvas sis/login ids.
export function computeSuggestions(
  entries: MatchRosterEntry[],
  students: MatchStudent[],
): MatchResult {
  const studentsByNumber = new Map<string, MatchStudent[]>();
  const studentsByEmail = new Map<string, MatchStudent[]>();
  for (const s of students) {
    const num = norm(s.studentNumber);
    if (num) {
      studentsByNumber.set(num, [...(studentsByNumber.get(num) ?? []), s]);
    }
    const email = norm(s.email);
    if (email) {
      studentsByEmail.set(email, [...(studentsByEmail.get(email) ?? []), s]);
    }
  }

  // Collect every (entry, student) candidate pair with its best (highest)
  // ladder level, then resolve ambiguity over the whole candidate graph.
  const candidates = new Map<string, { entry: MatchRosterEntry; student: MatchStudent; method: SuggestionMethod }>();
  const addCandidate = (
    entry: MatchRosterEntry,
    matched: MatchStudent[] | undefined,
    method: SuggestionMethod,
  ) => {
    for (const student of matched ?? []) {
      const key = `${entry.id}|${student.userId}`;
      // First writer wins: levels run in confidence order.
      if (!candidates.has(key)) candidates.set(key, { entry, student, method });
    }
  };

  for (const entry of entries) {
    const sis = norm(entry.sisUserId);
    if (sis) addCandidate(entry, studentsByNumber.get(sis), 'sis');
    const email = norm(entry.email);
    if (email) addCandidate(entry, studentsByEmail.get(email), 'email');
    // login_id is frequently the school email or the student number.
    const login = norm(entry.loginId);
    if (login) {
      addCandidate(entry, studentsByEmail.get(login), 'login_id');
      addCandidate(entry, studentsByNumber.get(login), 'login_id');
    }
  }

  const perEntry = new Map<string, Set<string>>();
  const perStudent = new Map<string, Set<string>>();
  for (const { entry, student } of candidates.values()) {
    perEntry.set(entry.id, (perEntry.get(entry.id) ?? new Set()).add(student.userId));
    perStudent.set(student.userId, (perStudent.get(student.userId) ?? new Set()).add(entry.id));
  }

  // Ambiguity infects the whole connected component: when any node in a
  // candidate cluster matched more than one counterpart, no pair inside that
  // cluster is safe to suggest, and BOTH sides are flagged so the UI can say
  // "part of an ambiguous match" on each of them.
  const ambiguousEntries = new Set(
    [...perEntry.entries()].filter(([, set]) => set.size > 1).map(([id]) => id),
  );
  const ambiguousStudents = new Set(
    [...perStudent.entries()].filter(([, set]) => set.size > 1).map(([id]) => id),
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (const { entry, student } of candidates.values()) {
      if (ambiguousEntries.has(entry.id) && !ambiguousStudents.has(student.userId)) {
        ambiguousStudents.add(student.userId);
        changed = true;
      }
      if (ambiguousStudents.has(student.userId) && !ambiguousEntries.has(entry.id)) {
        ambiguousEntries.add(entry.id);
        changed = true;
      }
    }
  }

  const suggestions: MatchSuggestion[] = [];
  for (const { entry, student, method } of candidates.values()) {
    if (ambiguousEntries.has(entry.id) || ambiguousStudents.has(student.userId)) continue;
    suggestions.push({
      rosterEntryId: entry.id,
      canvasUserId: entry.canvasUserId,
      studentId: student.userId,
      method,
    });
  }

  return {
    suggestions,
    ambiguousRosterEntryIds: [...ambiguousEntries],
    ambiguousStudentIds: [...ambiguousStudents],
  };
}
