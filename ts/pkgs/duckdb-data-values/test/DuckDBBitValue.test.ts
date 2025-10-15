import { expect, suite, test } from 'vitest';
import { DuckDBBitValue } from '../src/DuckDBBitValue';

suite('DuckDBBitValue', () => {
  test('should render an empty byte array to the correct string', () => {
    expect(new DuckDBBitValue(new Uint8Array([])).toString()).toStrictEqual('');
  });
  test('should render bit string with no padding to the correct string', () => {
    expect(
      new DuckDBBitValue(new Uint8Array([0x00, 0xf1, 0xe2, 0xd3])).toString(),
    ).toStrictEqual('111100011110001011010011');
  });
  test('should render bit string with padding to the correct string', () => {
    expect(
      new DuckDBBitValue(new Uint8Array([0x03, 0xf1, 0xe2, 0xd3])).toString(),
    ).toStrictEqual('100011110001011010011');
  });
  test('should round-trip bit string with no padding', () => {
    expect(
      DuckDBBitValue.fromString('111100011110001011010011').toString(),
    ).toStrictEqual('111100011110001011010011');
  });
  test('should round-trip bit string with padding', () => {
    expect(
      DuckDBBitValue.fromString('100011110001011010011').toString(),
    ).toStrictEqual('100011110001011010011');
  });
  test('toJson', () => {
    expect(
      DuckDBBitValue.fromString('100011110001011010011').toJson(),
    ).toStrictEqual('100011110001011010011');
  });

  suite('toSql', () => {
    test('should render bit string to SQL', () => {
      const bitValue = DuckDBBitValue.fromString('10101');
      expect(bitValue.toSql()).toStrictEqual("'10101'::BITSTRING");
    });

    test('should render empty bit string to SQL', () => {
      const bitValue = DuckDBBitValue.fromString('');
      expect(bitValue.toSql()).toStrictEqual("''::BITSTRING");
    });

    test('should render bit string with no padding to SQL', () => {
      const bitValue = DuckDBBitValue.fromString('111100011110001011010011');
      expect(bitValue.toSql()).toStrictEqual(
        "'111100011110001011010011'::BITSTRING",
      );
    });

    test('should render bit string with padding to SQL', () => {
      const bitValue = DuckDBBitValue.fromString('100011110001011010011');
      expect(bitValue.toSql()).toStrictEqual(
        "'100011110001011010011'::BITSTRING",
      );
    });
  });
});
