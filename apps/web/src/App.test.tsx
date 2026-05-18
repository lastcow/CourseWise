import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@coursewise/shared';

describe('shared constants', () => {
  it('exposes the app name', () => {
    expect(APP_NAME).toBe('CourseWise');
  });
});
