import { hexFromBlob } from './conversion/hexFromBlob.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBUUIDValue extends SpecialDuckDBValue {
  public readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    super();
    this.bytes = bytes;
  }

  public toDuckDBString(): string {
    if (this.bytes.length !== 16) {
      throw new Error('Invalid UUID bytes length');
    }

    // Insert dashes to format the UUID
    return `${hexFromBlob(this.bytes, 0, 4)}-${hexFromBlob(this.bytes, 4, 6)}-${hexFromBlob(this.bytes, 6, 8)}-${hexFromBlob(this.bytes, 8, 10)}-${hexFromBlob(this.bytes, 10, 16)}`;
  }

  public toSql(): string {
    return `'${this.toDuckDBString()}'::UUID`;
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }

  /**
   * Create a DuckDBUUIDValue value from a HUGEINT as stored by DuckDB.
   *
   * UUID values are stored with their MSB flipped so their numeric ordering matches their string ordering.
   */
  public static fromStoredHugeint(hugeint: bigint): DuckDBUUIDValue {
    // Flip the MSB and truncate to 128 bits to extract the represented unsigned 128-bit value.
    const uint128 =
      (hugeint ^ 0x80000000000000000000000000000000n) &
      0xffffffffffffffffffffffffffffffffn;
    return DuckDBUUIDValue.fromUint128(uint128);
  }

  /** Create a DuckDBUUIDValue value from an unsigned 128-bit integer in a JS BigInt. */
  public static fromUint128(uint128: bigint): DuckDBUUIDValue {
    const bytes = new Uint8Array(16);
    const dv = new DataView(bytes.buffer);
    // Write the unsigned 128-bit integer to the buffer in big endian format.
    dv.setBigUint64(0, BigInt.asUintN(64, uint128 >> BigInt(64)), false);
    dv.setBigUint64(8, BigInt.asUintN(64, uint128), false);
    return new DuckDBUUIDValue(bytes);
  }
}
