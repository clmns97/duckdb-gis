import { expect, suite, test } from 'vitest';
import { DuckDBBlobValue } from '../src/DuckDBBlobValue';

suite('DuckDBBlobValue', () => {
  test('should render an empty byte array to the correct string', () => {
    expect(new DuckDBBlobValue(new Uint8Array([])).toString()).toStrictEqual(
      '',
    );
  });
  test('should render a byte array to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([0x41, 0x42, 0x43, 0x31, 0x32, 0x33]),
      ).toString(),
    ).toStrictEqual('ABC123');
  });
  test('should render a byte array containing single-digit non-printables to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([
          0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
          0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        ]),
      ).toString(),
    ).toStrictEqual(
      '\\x00\\x01\\x02\\x03\\x04\\x05\\x06\\x07\\x08\\x09\\x0A\\x0B\\x0C\\x0D\\x0E\\x0F',
    );
  });
  test('should render a byte array containing double-digit non-printables to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([
          0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a,
          0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
        ]),
      ).toString(),
    ).toStrictEqual(
      '\\x10\\x11\\x12\\x13\\x14\\x15\\x16\\x17\\x18\\x19\\x1A\\x1B\\x1C\\x1D\\x1E\\x1F',
    );
  });
  test('should render a byte array containing min printables (including single and double quotes) to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([
          0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a,
          0x2b, 0x2c, 0x2d, 0x2e, 0x2f,
        ]),
      ).toString(),
    ).toStrictEqual(' !\\x22#$%&\\x27()*+,-./');
  });
  test('should render a byte array containing max printables (including backspace) to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([
          0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a,
          0x7b, 0x7c, 0x7d, 0x7e, 0x7f,
        ]),
      ).toString(),
    ).toStrictEqual('pqrstuvwxyz{|}~\\x7F');
  });
  test('should render a byte array containing high non-printables to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([
          0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a,
          0x8b, 0x8c, 0x8d, 0x8e, 0x8f,
        ]),
      ).toString(),
    ).toStrictEqual(
      '\\x80\\x81\\x82\\x83\\x84\\x85\\x86\\x87\\x88\\x89\\x8A\\x8B\\x8C\\x8D\\x8E\\x8F',
    );
  });
  test('should render a byte array containing max non-printables to the correct string', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([
          0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
          0xfb, 0xfc, 0xfd, 0xfe, 0xff,
        ]),
      ).toString(),
    ).toStrictEqual(
      '\\xF0\\xF1\\xF2\\xF3\\xF4\\xF5\\xF6\\xF7\\xF8\\xF9\\xFA\\xFB\\xFC\\xFD\\xFE\\xFF',
    );
  });
  test('toJson', () => {
    expect(
      new DuckDBBlobValue(
        new Uint8Array([0x41, 0x42, 0x43, 0x31, 0x32, 0x33]),
      ).toJson(),
    ).toStrictEqual('ABC123');
  });
});
