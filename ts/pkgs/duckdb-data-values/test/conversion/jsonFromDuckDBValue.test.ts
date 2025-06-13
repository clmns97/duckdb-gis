import { expect, suite, test } from 'vitest';
import { DuckDBListValue } from '../../src';
import { jsonFromDuckDBValue } from '../../src/conversion/jsonFromDuckDBValue';

suite('jsonFromDuckDBValue', () => {
  test('null', () => {
    expect(jsonFromDuckDBValue(null)).toBe(null);
  });
  test('boolean', () => {
    expect(jsonFromDuckDBValue(true)).toBe(true);
  });
  test('number', () => {
    expect(jsonFromDuckDBValue(42)).toBe(42);
  });
  test('bigint', () => {
    expect(jsonFromDuckDBValue(12345n)).toBe('12345');
  });
  test('string', () => {
    expect(jsonFromDuckDBValue('foo')).toBe('foo');
  });
  test('special', () => {
    expect(jsonFromDuckDBValue(new DuckDBListValue([1, 2, 3]))).toStrictEqual([
      1, 2, 3,
    ]);
  });
});
