import { expect, suite, test } from 'vitest';
import { DuckDBListValue } from '../src/DuckDBListValue';
import { DuckDBMapValue } from '../src/DuckDBMapValue';

suite('DuckDBMapValue', () => {
  test('should render an empty map to the correct string', () => {
    expect(new DuckDBMapValue([]).toString()).toStrictEqual('{}');
  });
  test('should render a single-entry map to the correct string', () => {
    expect(
      new DuckDBMapValue([{ key: 'x', value: 1 }]).toString(),
    ).toStrictEqual(`{'x': 1}`);
  });
  test('should render a multi-entry map to the correct string', () => {
    expect(
      new DuckDBMapValue([
        { key: 1, value: 42.001 },
        { key: 5, value: -32.1 },
        { key: 3, value: null },
      ]).toString(),
    ).toStrictEqual(`{1: 42.001, 5: -32.1, 3: NULL}`);
  });
  test('should render a multi-entry map with complex key types to the correct string', () => {
    expect(
      new DuckDBMapValue([
        {
          key: new DuckDBListValue(['a', 'b']),
          value: new DuckDBListValue([1.1, 2.2]),
        },
        {
          key: new DuckDBListValue(['c', 'd']),
          value: new DuckDBListValue([3.3, 4.4]),
        },
      ]).toString(),
    ).toStrictEqual(`{['a', 'b']: [1.1, 2.2], ['c', 'd']: [3.3, 4.4]}`);
  });
  test('should render a map with nested maps to the correct string', () => {
    expect(
      new DuckDBMapValue([
        { key: new DuckDBMapValue([]), value: new DuckDBMapValue([]) },
        {
          key: new DuckDBMapValue([{ key: 'key1', value: 'value1' }]),
          value: new DuckDBMapValue([
            { key: 1, value: 42.001 },
            { key: 5, value: -32.1 },
            { key: 3, value: null },
          ]),
        },
      ]).toString(),
    ).toStrictEqual(
      `{{}: {}, {'key1': 'value1'}: {1: 42.001, 5: -32.1, 3: NULL}}`,
    );
  });
  test('toJson basics', () => {
    expect(
      new DuckDBMapValue([
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
        { key: 'c', value: 3 },
      ]).toJson(),
    ).toStrictEqual({ "'a'": 1, "'b'": 2, "'c'": 3 });
  });
  test('toJson with complex keys and values', () => {
    expect(
      new DuckDBMapValue([
        {
          key: new DuckDBListValue(['a', 'b']),
          value: new DuckDBListValue([1.1, 2.2]),
        },
        {
          key: new DuckDBListValue(['c', 'd']),
          value: new DuckDBListValue([3.3, 4.4]),
        },
      ]).toJson(),
    ).toStrictEqual({ "['a', 'b']": [1.1, 2.2], "['c', 'd']": [3.3, 4.4] });
  });
});
