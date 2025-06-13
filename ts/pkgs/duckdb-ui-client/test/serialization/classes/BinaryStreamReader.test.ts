import { expect, suite, test } from 'vitest';
import { BinaryStreamReader } from '../../../src/serialization/classes/BinaryStreamReader';
import { makeBuffer } from '../../helpers/makeBuffer';

suite('BinaryStreamReader', () => {
  test('basic', () => {
    const reader = new BinaryStreamReader(
      makeBuffer([11, 22, 33, 44, 0x12, 0x34]),
    );

    expect(reader.getOffset()).toBe(0);
    expect(reader.peekUint8()).toBe(11);
    expect(reader.readUint8()).toBe(11);

    expect(reader.getOffset()).toBe(1);
    expect(reader.peekUint8()).toBe(22);
    expect(reader.readUint8()).toBe(22);

    expect(reader.getOffset()).toBe(2);
    reader.consume(2);
    expect(reader.getOffset()).toBe(4);
    expect(reader.peekUint16(false)).toBe(0x1234);
    expect(reader.peekUint16(true)).toBe(0x3412);

    const dv = reader.readData(2);
    expect(dv.byteLength).toBe(2);
    expect(dv.getUint8(0)).toBe(0x12);
    expect(dv.getUint8(1)).toBe(0x34);
  });
});
