import { describe, expect, it } from 'vitest';
import { loadCourses, validateCourses } from '../scripts/curriculum-lib';

describe('curriculum', () => {
  const list = loadCourses();
  it('every course file is complete and valid', () => {
    expect(validateCourses(list)).toEqual([]);
  });
  it('contains all 36 courses', () => {
    expect(list.length).toBe(36);
  });
});
