import { expect, suite, test } from 'vitest';
import { randomString } from '../../../src/util/functions/randomString';

suite('randomString', () => {
  test('default length', () => {
    expect(randomString().length).toBe(12);
  });
  test('custom length', () => {
    expect(randomString(5).length).toBe(5);
  });
  test('custom chars', () => {
    expect(randomString(3, 'xy')).toMatch(/[xy][xy][xy]/);
  });
});
