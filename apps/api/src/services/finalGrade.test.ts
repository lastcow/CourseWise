import { describe, expect, it } from 'vitest';
import { computeWeightedScore, isFinalProjectTitle } from './finalGrade';
import { DEFAULT_GRADING_POLICY } from '@coursewise/shared';

interface CategoryAgg {
  attendance: { sessionsCount: number; presentCount: number; rate: number | null };
  assignments: { regular: Array<{ score: number; maxScore: number }>; average: number | null };
  quizzes: { attempts: Array<{ score: number; maxScore: number }>; average: number | null };
  discussion: { grades: Array<{ score: number; maxScore: number }>; average: number | null };
  finalProject: { items: Array<{ score: number; maxScore: number }>; average: number | null };
}

function withAllCategories(): CategoryAgg {
  return {
    attendance: { sessionsCount: 10, presentCount: 9, rate: 0.9 },
    assignments: {
      regular: [
        { score: 90, maxScore: 100 },
        { score: 80, maxScore: 100 },
      ],
      average: 85,
    },
    quizzes: {
      attempts: [{ score: 70, maxScore: 100 }],
      average: 70,
    },
    discussion: {
      grades: [{ score: 100, maxScore: 100 }],
      average: 100,
    },
    finalProject: {
      items: [{ score: 88, maxScore: 100 }],
      average: 88,
    },
  };
}

describe('computeWeightedScore', () => {
  it('computes the weighted final score using default policy', () => {
    const { score, breakdown } = computeWeightedScore(withAllCategories(), {
      attendance: DEFAULT_GRADING_POLICY.attendance,
      assignments: DEFAULT_GRADING_POLICY.assignments,
      quizzes: DEFAULT_GRADING_POLICY.quizzes,
      discussion: DEFAULT_GRADING_POLICY.discussion,
      finalProject: DEFAULT_GRADING_POLICY.finalProject,
    });
    // 90*0.10 + 85*0.35 + 70*0.30 + 100*0.10 + 88*0.15 = 9 + 29.75 + 21 + 10 + 13.2 = 82.95
    expect(score).toBeCloseTo(82.95, 2);
    expect(breakdown.attendance.weighted).toBeCloseTo(9, 2);
    expect(breakdown.assignments.weighted).toBeCloseTo(29.75, 2);
    expect(breakdown.finalProject.weighted).toBeCloseTo(13.2, 2);
  });

  it('redistributes weight if a category has no data', () => {
    const agg = withAllCategories();
    agg.quizzes = { attempts: [], average: null };
    const { score } = computeWeightedScore(agg, {
      attendance: 10,
      assignments: 35,
      quizzes: 30,
      discussion: 10,
      finalProject: 15,
    });
    // present weight = 70; expected = (90*10 + 85*35 + 100*10 + 88*15) / 70
    // = (900 + 2975 + 1000 + 1320) / 70 = 6195 / 70 = 88.5
    expect(score).toBeCloseTo(88.5, 1);
  });

  it('returns 0 when all categories are missing data', () => {
    const empty = {
      attendance: { sessionsCount: 0, presentCount: 0, rate: null },
      assignments: { regular: [], average: null },
      quizzes: { attempts: [], average: null },
      discussion: { grades: [], average: null },
      finalProject: { items: [], average: null },
    };
    const { score } = computeWeightedScore(empty, {
      attendance: 10,
      assignments: 35,
      quizzes: 30,
      discussion: 10,
      finalProject: 15,
    });
    expect(score).toBe(0);
  });

  it('skips zero-weight categories even if they have data', () => {
    const agg = withAllCategories();
    const { score, breakdown } = computeWeightedScore(agg, {
      attendance: 0,
      assignments: 50,
      quizzes: 50,
      discussion: 0,
      finalProject: 0,
    });
    // (85*50 + 70*50) / 100 = (4250 + 3500) / 100 = 77.5
    expect(score).toBeCloseTo(77.5, 1);
    expect(breakdown.attendance.weight).toBe(0);
  });
});

describe('isFinalProjectTitle', () => {
  it('detects English keyword', () => {
    expect(isFinalProjectTitle('Course final project')).toBe(true);
    expect(isFinalProjectTitle('final_project')).toBe(true);
  });
  it('detects Chinese keyword', () => {
    expect(isFinalProjectTitle('期末作业')).toBe(true);
    expect(isFinalProjectTitle('结业项目')).toBe(true);
  });
  it('returns false for regular assignments', () => {
    expect(isFinalProjectTitle('Week 1 reading')).toBe(false);
    expect(isFinalProjectTitle(null)).toBe(false);
  });
});
