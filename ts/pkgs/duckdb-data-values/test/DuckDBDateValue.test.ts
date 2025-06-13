import { expect, suite, test } from 'vitest';
import { DuckDBDateValue } from '../src/DuckDBDateValue';

suite('DuckDBDateValue', () => {
  test('should render a normal date value to the correct string', () => {
    expect(new DuckDBDateValue(19643).toString()).toStrictEqual('2023-10-13');
  });
  test('should render the max date value to the correct string', () => {
    expect(new DuckDBDateValue(2 ** 31 - 2).toString()).toStrictEqual(
      '5881580-07-10',
    );
  });
  test('should render the min date value to the correct string', () => {
    expect(new DuckDBDateValue(-(2 ** 31) + 2).toString()).toStrictEqual(
      '5877642-06-25 (BC)',
    );
  });
});
