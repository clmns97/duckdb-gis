import { expect, suite, test } from 'vitest';
import { DuckDBMapValue } from '../src';
import { DuckDBListValue } from '../src/DuckDBListValue';
import { DuckDBStructValue } from '../src/DuckDBStructValue';

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

  suite('toSql', () => {
    test('should render empty list', () => {
      expect(new DuckDBListValue([]).toSql()).toStrictEqual('[]');
    });

    test('should render list with mixed types', () => {
      expect(
        new DuckDBListValue([123, 'abc', null, true]).toSql(),
      ).toStrictEqual("[123, 'abc', NULL, TRUE]");
    });

    test('should render nested lists', () => {
      expect(
        new DuckDBListValue([
          new DuckDBListValue([1, 2]),
          null,
          new DuckDBListValue([3, 4]),
        ]).toSql(),
      ).toStrictEqual('[[1, 2], NULL, [3, 4]]');
    });

    test('should render list of structs', () => {
      expect(
        new DuckDBListValue([
          new DuckDBStructValue([
            { key: 'id', value: 1 },
            { key: 'name', value: 'Alice' },
          ]),
          new DuckDBStructValue([
            { key: 'id', value: 2 },
            { key: 'name', value: 'Bob' },
          ]),
        ]).toSql(),
      ).toStrictEqual("[{'id': 1, 'name': 'Alice'}, {'id': 2, 'name': 'Bob'}]");
    });
  });
});
