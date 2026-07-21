import { describe, expect, it } from 'vitest';
import { computeSuggestions, type MatchRosterEntry, type MatchStudent } from './match';

const entry = (over: Partial<MatchRosterEntry> & { id: string }): MatchRosterEntry => ({
  canvasUserId: `c-${over.id}`,
  name: 'Someone',
  email: null,
  loginId: null,
  sisUserId: null,
  ...over,
});

const student = (over: Partial<MatchStudent> & { userId: string }): MatchStudent => ({
  name: 'Someone',
  email: `${over.userId}@example.edu`,
  studentNumber: null,
  ...over,
});

describe('computeSuggestions ladder', () => {
  it('suggests by student number (sis) at highest confidence', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', sisUserId: 'S123', email: 'other@x.edu' })],
      [student({ userId: 'u1', studentNumber: 's123', email: 'unrelated@x.edu' })],
    );
    expect(res.suggestions).toEqual([
      { rosterEntryId: 'e1', canvasUserId: 'c-e1', studentId: 'u1', method: 'sis' },
    ]);
  });

  it('suggests by email, case-insensitively, when sis is absent', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', email: 'Jane.Doe@School.EDU' })],
      [student({ userId: 'u1', email: 'jane.doe@school.edu' })],
    );
    expect(res.suggestions[0]?.method).toBe('email');
  });

  it('sis outranks email when both hit the same pair', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', sisUserId: 'S1', email: 'j@x.edu' })],
      [student({ userId: 'u1', studentNumber: 'S1', email: 'j@x.edu' })],
    );
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0]?.method).toBe('sis');
  });

  it('matches login_id against both email and student number', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', loginId: 'j@x.edu' }), entry({ id: 'e2', loginId: '20260001' })],
      [
        student({ userId: 'u1', email: 'j@x.edu' }),
        student({ userId: 'u2', email: 'k@x.edu', studentNumber: '20260001' }),
      ],
    );
    const methods = new Map(res.suggestions.map((s) => [s.rosterEntryId, s.method]));
    expect(methods.get('e1')).toBe('login_id');
    expect(methods.get('e2')).toBe('login_id');
  });

  it('never suggests from names alone', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', name: 'Jane Doe' })],
      [student({ userId: 'u1', name: 'Jane Doe' })],
    );
    expect(res.suggestions).toHaveLength(0);
    expect(res.ambiguousRosterEntryIds).toHaveLength(0);
  });

  it('suppresses one-entry-to-many-students matches as ambiguous', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', email: 'shared@x.edu' })],
      [
        student({ userId: 'u1', email: 'shared@x.edu' }),
        student({ userId: 'u2', email: 'shared@x.edu' }),
      ],
    );
    expect(res.suggestions).toHaveLength(0);
    expect(res.ambiguousRosterEntryIds).toEqual(['e1']);
    expect(new Set(res.ambiguousStudentIds)).toEqual(new Set(['u1', 'u2']));
  });

  it('suppresses many-entries-to-one-student matches as ambiguous, keeping unrelated pairs', () => {
    const res = computeSuggestions(
      [
        entry({ id: 'e1', sisUserId: 'S1' }),
        entry({ id: 'e2', loginId: 'S1' }),
        entry({ id: 'e3', email: 'clean@x.edu' }),
      ],
      [
        student({ userId: 'u1', studentNumber: 'S1' }),
        student({ userId: 'u2', email: 'clean@x.edu' }),
      ],
    );
    expect(res.ambiguousStudentIds).toEqual(['u1']);
    expect(new Set(res.ambiguousRosterEntryIds)).toEqual(new Set(['e1', 'e2']));
    expect(res.suggestions).toEqual([
      { rosterEntryId: 'e3', canvasUserId: 'c-e3', studentId: 'u2', method: 'email' },
    ]);
  });

  it('ignores blank/whitespace identifiers', () => {
    const res = computeSuggestions(
      [entry({ id: 'e1', sisUserId: '  ', email: '' })],
      [student({ userId: 'u1', studentNumber: '', email: 'x@x.edu' })],
    );
    expect(res.suggestions).toHaveLength(0);
  });
});
