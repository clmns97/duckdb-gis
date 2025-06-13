import { expect, suite, test } from 'vitest';
import { DuckDBMapValue } from '../src/DuckDBMapValue';
import { DuckDBStructValue } from '../src/DuckDBStructValue';

suite('DuckDBStructValue', () => {
  test('should render an empty struct to the correct string', () => {
    expect(new DuckDBStructValue([]).toString()).toStrictEqual('{}');
  });
  test('should render a single-entry struct to the correct string', () => {
    expect(
      new DuckDBStructValue([{ key: 'x', value: 1 }]).toString(),
    ).toStrictEqual(`{'x': 1}`);
  });
  test('should render a multi-entry struct to the correct string', () => {
    expect(
      new DuckDBStructValue([
        { key: 'x', value: 1 },
        { key: 'y', value: 2 },
        { key: 'z', value: 3 },
      ]).toString(),
    ).toStrictEqual(`{'x': 1, 'y': 2, 'z': 3}`);
  });
  test('should render a multi-entry struct with different value types to the correct string', () => {
    expect(
      new DuckDBStructValue([
        { key: 'key1', value: 'string' },
        { key: 'key2', value: 1 },
        { key: 'key3', value: 12.345 },
        { key: 'key0', value: null },
      ]).toString(),
    ).toStrictEqual(
      `{'key1': 'string', 'key2': 1, 'key3': 12.345, 'key0': NULL}`,
    );
  });
  test('should render a multi-entry struct with empty keys to the correct string', () => {
    expect(
      new DuckDBStructValue([
        { key: '', value: 2 },
        { key: '', value: 1 },
        { key: '', value: 3 },
      ]).toString(),
    ).toStrictEqual(`{'': 2, '': 1, '': 3}`);
  });
  test('should render a struct with nested structs to the correct string', () => {
    expect(
      new DuckDBStructValue([
        { key: 'empty_struct', value: new DuckDBStructValue([]) },
        {
          key: 'struct',
          value: new DuckDBStructValue([
            { key: 'key1', value: 'string' },
            { key: 'key2', value: 1 },
            { key: 'key3', value: 12.345 },
          ]),
        },
      ]).toString(),
    ).toStrictEqual(
      `{'empty_struct': {}, 'struct': {'key1': 'string', 'key2': 1, 'key3': 12.345}}`,
    );
  });
  test('toJson with simple keys and values', () => {
    expect(
      new DuckDBStructValue([
        { key: 'x', value: 1 },
        { key: 'y', value: 2 },
        { key: 'z', value: 3 },
      ]).toJson(),
    ).toStrictEqual({ "'x'": 1, "'y'": 2, "'z'": 3 });
  });
  test('toJson with nested struct values', () => {
    expect(
      new DuckDBStructValue([
        { key: 'empty_struct', value: new DuckDBStructValue([]) },
        {
          key: 'struct',
          value: new DuckDBStructValue([
            { key: 'key1', value: 'string' },
            { key: 'key2', value: 1 },
            { key: 'key3', value: 12.345 },
          ]),
        },
      ]).toJson(),
    ).toStrictEqual({
      "'empty_struct'": {},
      "'struct'": { "'key1'": 'string', "'key2'": 1, "'key3'": 12.345 },
    });
  });
  test('toJson with nested complex values', () => {
    expect(
      new DuckDBStructValue([
        { key: 'empty_struct', value: new DuckDBStructValue([]) },
        {
          key: 'struct',
          value: new DuckDBStructValue([
            {
              key: 'key1',
              value: new DuckDBMapValue([
                { key: 'foo', value: null },
                { key: 'bar', value: 'xyz' },
              ]),
            },
          ]),
        },
      ]).toJson(),
    ).toStrictEqual({
      "'empty_struct'": {},
      "'struct'": { "'key1'": { "'foo'": null, "'bar'": 'xyz' } },
    });
  });
});
