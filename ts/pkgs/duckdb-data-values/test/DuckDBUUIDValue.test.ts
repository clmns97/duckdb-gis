import { expect, suite, test } from 'vitest';
import { DuckDBUUIDValue } from '../src/DuckDBUUIDValue';

suite('DuckDBUUIDValue', () => {
  test('should render all zero bytes to the correct string', () => {
    expect(
      new DuckDBUUIDValue(
        new Uint8Array([
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00,
        ]),
      ).toString(),
    ).toStrictEqual('00000000-0000-0000-0000-000000000000');
  });
  test('should render all max bytes to the correct string', () => {
    expect(
      new DuckDBUUIDValue(
        new Uint8Array([
          0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
          0xff, 0xff, 0xff, 0xff, 0xff,
        ]),
      ).toString(),
    ).toStrictEqual('ffffffff-ffff-ffff-ffff-ffffffffffff');
  });
  test('should render arbitrary bytes to the correct string', () => {
    expect(
      new DuckDBUUIDValue(
        new Uint8Array([
          0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0xfe, 0xdc, 0xba,
          0x98, 0x76, 0x54, 0x32, 0x10,
        ]),
      ).toString(),
    ).toStrictEqual('f0e1d2c3-b4a5-9687-fedc-ba9876543210');
  });
  test('should render a uint128 to the correct string', () => {
    expect(
      DuckDBUUIDValue.fromUint128(
        0xf0e1d2c3b4a59687fedcba9876543210n,
      ).toString(),
    ).toStrictEqual('f0e1d2c3-b4a5-9687-fedc-ba9876543210');
  });
  test('should render a stored hugeint to the correct string', () => {
    expect(
      DuckDBUUIDValue.fromStoredHugeint(
        0x70e1d2c3b4a59687fedcba9876543210n, // note the flipped MSB
      ).toString(),
    ).toStrictEqual('f0e1d2c3-b4a5-9687-fedc-ba9876543210');
  });

  suite('toSql', () => {
    test('should render UUID to SQL', () => {
      const uuid =
        DuckDBUUIDValue.fromUint128(0x123e4567e89b12d3a456426614174000n);
      expect(uuid.toSql()).toMatch(/^'.{36}'::UUID$/);
    });

    test('should render UUID with proper format to SQL', () => {
      const uuid =
        DuckDBUUIDValue.fromUint128(0x550e8400e29b41d4a716446655440000n);
      expect(uuid.toSql()).toStrictEqual(
        "'550e8400-e29b-41d4-a716-446655440000'::UUID",
      );
    });
  });
});
