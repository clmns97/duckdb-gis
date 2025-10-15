import { expect, suite, test } from 'vitest';
import { DuckDBListValue } from '../../src';
import { jsonFromDuckDBValue } from '../../src/conversion/jsonFromDuckDBValue';

suite('jsonFromDuckDBValue', () => {
  test('null', () => {
    expect(jsonFromDuckDBValue(null)).toStrictEqual(null);
  });
  test('boolean', () => {
    expect(jsonFromDuckDBValue(true)).toStrictEqual(true);
  });
  test('number', () => {
    expect(jsonFromDuckDBValue(42)).toStrictEqual(42);
  });
  test('bigint', () => {
    expect(jsonFromDuckDBValue(12345n)).toStrictEqual('12345');
  });
  test('string', () => {
    expect(jsonFromDuckDBValue('foo')).toStrictEqual('foo');
  });
  test('special', () => {
    expect(jsonFromDuckDBValue(new DuckDBListValue([1, 2, 3]))).toStrictEqual([
      1, 2, 3,
    ]);
  });
});
