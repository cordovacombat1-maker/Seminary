import { describe, expect, it } from 'vitest';
import { loadCourses, validateCourses } from '../scripts/curriculum-lib';

describe('curriculum', () => {
  const list = loadCourses();
  it('every course file is complete and valid', () => {
    expect(validateCourses(list)).toEqual([]);
  });
  it('contains all 28 courses', () => {
    expect(list.length).toBe(28);
  });
});
