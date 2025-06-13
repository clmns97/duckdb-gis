import { expect, suite, test } from 'vitest';
import { DuckDBMapValue } from '../src';
import { DuckDBListValue } from '../src/DuckDBListValue';

suite('DuckDBListValue', () => {
  test('should render an empty list to the correct string', () => {
    expect(new DuckDBListValue([]).toString()).toStrictEqual('[]');
  });
  test('should render a single element list to the correct string', () => {
    expect(new DuckDBListValue([123]).toString()).toStrictEqual('[123]');
  });
  test('should render a multi-element list to the correct string', () => {
    expect(
      new DuckDBListValue(['abc', null, true, '']).toString(),
    ).toStrictEqual(`['abc', NULL, true, '']`);
  });
  test('should render a list with nested lists to the correct string', () => {
    expect(
      new DuckDBListValue([
        new DuckDBListValue([]),
        null,
        new DuckDBListValue([123, null, 'xyz']),
      ]).toString(),
    ).toStrictEqual(`[[], NULL, [123, NULL, 'xyz']]`);
  });
  test('toJson with complex values', () => {
    expect(
      new DuckDBListValue([
        new DuckDBMapValue([
          { key: 'foo', value: 123 },
          { key: 'bar', value: 'abc' },
        ]),
        null,
        new DuckDBMapValue([
          { key: 'foo', value: null },
          { key: 'bar', value: 'xyz' },
        ]),
      ]).toJson(),
    ).toStrictEqual([
      { "'foo'": 123, "'bar'": 'abc' },
      null,
      { "'foo'": null, "'bar'": 'xyz' },
    ]);
  });
});
