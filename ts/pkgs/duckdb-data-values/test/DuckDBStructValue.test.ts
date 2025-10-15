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

  suite('toSql', () => {
    test('should throw error for empty struct', () => {
      expect(() => new DuckDBStructValue([]).toSql()).toThrow(
        'Empty structs cannot be represented as SQL literals',
      );
    });

    test('should render single-entry struct to SQL', () => {
      expect(
        new DuckDBStructValue([{ key: 'x', value: 1 }]).toSql(),
      ).toStrictEqual("{'x': 1}");
    });

    test('should render multi-entry struct to SQL', () => {
      expect(
        new DuckDBStructValue([
          { key: 'x', value: 1 },
          { key: 'y', value: 2 },
          { key: 'z', value: 3 },
        ]).toSql(),
      ).toStrictEqual("{'x': 1, 'y': 2, 'z': 3}");
    });

    test('should render struct with different value types to SQL', () => {
      expect(
        new DuckDBStructValue([
          { key: 'str', value: 'hello' },
          { key: 'num', value: 42 },
          { key: 'bool', value: true },
          { key: 'null', value: null },
        ]).toSql(),
      ).toStrictEqual(
        "{'str': 'hello', 'num': 42, 'bool': TRUE, 'null': NULL}",
      );
    });

    test('should escape single quotes in struct keys and values', () => {
      expect(
        new DuckDBStructValue([
          { key: "it's", value: "can't" },
          { key: 'say', value: "don't" },
        ]).toSql(),
      ).toStrictEqual("{'it''s': 'can''t', 'say': 'don''t'}");
    });

    test('should render struct with empty string keys to SQL', () => {
      expect(
        new DuckDBStructValue([
          { key: '', value: 1 },
          { key: '', value: 2 },
        ]).toSql(),
      ).toStrictEqual("{'': 1, '': 2}");
    });

    test('should render nested structs to SQL', () => {
      expect(
        new DuckDBStructValue([
          {
            key: 'outer',
            value: new DuckDBStructValue([{ key: 'inner', value: 42 }]),
          },
        ]).toSql(),
      ).toStrictEqual("{'outer': {'inner': 42}}");
    });

    test('should render struct with complex nested values to SQL', () => {
      expect(
        new DuckDBStructValue([
          {
            key: 'person',
            value: new DuckDBStructValue([
              { key: 'name', value: 'Alice' },
              { key: 'age', value: 30 },
              {
                key: 'address',
                value: new DuckDBStructValue([
                  { key: 'city', value: 'NYC' },
                  { key: 'zip', value: 10001 },
                ]),
              },
            ]),
          },
        ]).toSql(),
      ).toStrictEqual(
        "{'person': {'name': 'Alice', 'age': 30, 'address': {'city': 'NYC', 'zip': 10001}}}",
      );
    });

    test('should throw error when struct contains empty nested struct', () => {
      expect(() =>
        new DuckDBStructValue([
          { key: 'empty', value: new DuckDBStructValue([]) },
        ]).toSql(),
      ).toThrow('Empty structs cannot be represented as SQL literals');
    });

    test('should render struct with map values to SQL', () => {
      expect(
        new DuckDBStructValue([
          {
            key: 'data',
            value: new DuckDBMapValue([
              { key: 'a', value: 1 },
              { key: 'b', value: 2 },
            ]),
          },
        ]).toSql(),
      ).toStrictEqual("{'data': MAP {'a': 1, 'b': 2}}");
    });
  });
});
