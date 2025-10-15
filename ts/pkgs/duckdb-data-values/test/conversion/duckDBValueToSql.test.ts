import { expect, suite, test } from 'vitest';
import { duckDBValueToSql } from '../../src/conversion/duckDBValueToSql';

// tests primitives
suite('duckDBValueToSql', () => {
  suite('null', () => {
    test('should convert null to NULL', () => {
      expect(duckDBValueToSql(null)).toStrictEqual('NULL');
    });
  });

  suite('string', () => {
    test('should wrap simple string in single quotes', () => {
      expect(duckDBValueToSql('hello')).toStrictEqual("'hello'");
    });

    test('should escape single quotes by doubling them', () => {
      expect(duckDBValueToSql("it's")).toStrictEqual("'it''s'");
    });

    test('should handle multiple single quotes', () => {
      expect(duckDBValueToSql("don't say 'no'")).toStrictEqual(
        "'don''t say ''no'''",
      );
    });

    test('should wrap empty string in single quotes', () => {
      expect(duckDBValueToSql('')).toStrictEqual("''");
    });

    test('should handle strings with special characters', () => {
      expect(duckDBValueToSql('hello\nworld')).toStrictEqual("'hello\nworld'");
    });
  });

  suite('number', () => {
    test('should convert integer to string', () => {
      expect(duckDBValueToSql(123)).toStrictEqual('123');
    });

    test('should convert float to string', () => {
      expect(duckDBValueToSql(123.456)).toStrictEqual('123.456');
    });

    test('should convert negative number to string', () => {
      expect(duckDBValueToSql(-42)).toStrictEqual('-42');
    });

    test('should convert zero to string', () => {
      expect(duckDBValueToSql(0)).toStrictEqual('0');
    });

    test('should handle scientific notation', () => {
      expect(duckDBValueToSql(1.23e5)).toStrictEqual('123000');
    });

    test('should handle very small numbers', () => {
      expect(duckDBValueToSql(0.00001)).toStrictEqual('0.00001');
    });
  });

  suite('boolean', () => {
    test('should convert true to TRUE', () => {
      expect(duckDBValueToSql(true)).toStrictEqual('TRUE');
    });

    test('should convert false to FALSE', () => {
      expect(duckDBValueToSql(false)).toStrictEqual('FALSE');
    });
  });

  suite('bigint', () => {
    test('should convert small bigint to string', () => {
      expect(duckDBValueToSql(123n)).toStrictEqual('123');
    });

    test('should convert large bigint to string', () => {
      expect(duckDBValueToSql(9007199254740991n)).toStrictEqual(
        '9007199254740991',
      );
    });

    test('should convert very large bigint beyond Number.MAX_SAFE_INTEGER', () => {
      expect(duckDBValueToSql(12345678901234567890n)).toStrictEqual(
        '12345678901234567890',
      );
    });

    test('should convert negative bigint to string', () => {
      expect(duckDBValueToSql(-999n)).toStrictEqual('-999');
    });
  });
});
