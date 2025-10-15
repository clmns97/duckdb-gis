import { expect, suite, test } from 'vitest';
import { displayStringForDuckDBValue } from '../../src/conversion/displayStringForDuckDBValue';

// tests primitives
suite('displayStringForDuckDBValue', () => {
  suite('null', () => {
    test('should convert null to NULL', () => {
      expect(displayStringForDuckDBValue(null)).toStrictEqual('NULL');
    });
  });

  suite('string', () => {
    test('should wrap simple string in single quotes', () => {
      expect(displayStringForDuckDBValue('hello')).toStrictEqual("'hello'");
    });

    test('should escape single quotes by doubling them', () => {
      expect(displayStringForDuckDBValue("it's")).toStrictEqual("'it''s'");
    });

    test('should handle multiple single quotes', () => {
      expect(displayStringForDuckDBValue("don't say 'goose'")).toStrictEqual(
        "'don''t say ''goose'''",
      );
    });

    test('should wrap empty string in single quotes', () => {
      expect(displayStringForDuckDBValue('')).toStrictEqual("''");
    });
  });

  suite('number', () => {
    test('should convert integer to string', () => {
      expect(displayStringForDuckDBValue(123)).toStrictEqual('123');
    });

    test('should convert float to string', () => {
      expect(displayStringForDuckDBValue(123.456)).toStrictEqual('123.456');
    });

    test('should convert negative number to string', () => {
      expect(displayStringForDuckDBValue(-42)).toStrictEqual('-42');
    });
  });

  suite('boolean', () => {
    test('should convert true to string', () => {
      expect(displayStringForDuckDBValue(true)).toStrictEqual('true');
    });

    test('should convert false to string', () => {
      expect(displayStringForDuckDBValue(false)).toStrictEqual('false');
    });
  });

  suite('bigint', () => {
    test('should convert bigint to string', () => {
      expect(displayStringForDuckDBValue(123n)).toStrictEqual('123');
    });

    test('should convert large bigint to string', () => {
      expect(displayStringForDuckDBValue(9007199254740991n)).toStrictEqual(
        '9007199254740991',
      );
    });
  });
});
