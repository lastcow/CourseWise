import { type ChildCounts } from '@coursewise/shared';
import { describe, expect, it } from 'vitest';

describe('courseChildCounts (shape)', () => {
  it('serializes the expected keys', () => {
    const sample: ChildCounts = {
      enrollments: 0,
      modules: 0,
      readingMaterials: 0,
      assignments: 0,
      submissions: 0,
      quizzes: 0,
      quizAttempts: 0,
      discussionTopics: 0,
      discussionPosts: 0,
      attendanceSessions: 0,
      fileCount: 0,
      fileBytes: 0,
    };
    expect(Object.keys(sample).sort()).toEqual([
      'assignments',
      'attendanceSessions',
      'discussionPosts',
      'discussionTopics',
      'enrollments',
      'fileBytes',
      'fileCount',
      'modules',
      'quizAttempts',
      'quizzes',
      'readingMaterials',
      'submissions',
    ]);
  });
});
