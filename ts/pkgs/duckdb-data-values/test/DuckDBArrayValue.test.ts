import { expect, suite, test } from 'vitest';
import { DuckDBArrayValue } from '../src/DuckDBArrayValue';
import { DuckDBMapValue } from '../src/DuckDBMapValue';

suite('DuckDBArrayValue', () => {
  test('should render an empty array to the correct string', () => {
    expect(new DuckDBArrayValue([]).toString()).toStrictEqual('[]');
  });
  test('should render a single element array to the correct string', () => {
    expect(new DuckDBArrayValue([123]).toString()).toStrictEqual('[123]');
  });
  test('should render a multi-element array to the correct string', () => {
    expect(
      new DuckDBArrayValue(['abc', null, true, '']).toString(),
    ).toStrictEqual(`['abc', NULL, true, '']`);
  });
  test('should render an array with nested arrays to the correct string', () => {
    expect(
      new DuckDBArrayValue([
        new DuckDBArrayValue([]),
        null,
        new DuckDBArrayValue([123, null, 'xyz']),
      ]).toString(),
    ).toStrictEqual(`[[], NULL, [123, NULL, 'xyz']]`);
  });
  test('toJson array with basic values', () => {
    expect(new DuckDBArrayValue([123, 'abc', null]).toJson()).toStrictEqual([
      123,
      'abc',
      null,
    ]);
  });
  test('toJson array with complex values', () => {
    expect(
      new DuckDBArrayValue([
        new DuckDBMapValue([
          { key: 'foo', value: 123 },
          { key: 'bar', value: 'abc' },
        ]),
        new DuckDBArrayValue([123, null, 'xyz']),
        null,
      ]).toJson(),
    ).toStrictEqual([
      { "'foo'": 123, "'bar'": 'abc' },
      [123, null, 'xyz'],
      null,
    ]);
  });
});
