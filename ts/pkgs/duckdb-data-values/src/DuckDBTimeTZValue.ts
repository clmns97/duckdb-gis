import {
  getDuckDBTimeStringFromMicrosecondsInDay,
  getOffsetStringFromSeconds,
} from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBTimeTZValue extends SpecialDuckDBValue {
  public readonly micros: bigint;
  public readonly offset: number;

  constructor(micros: bigint, offset: number) {
    super();
    this.micros = micros;
    this.offset = offset;
  }

  public toDuckDBString(): string {
    return `${getDuckDBTimeStringFromMicrosecondsInDay(
      this.micros,
    )}${getOffsetStringFromSeconds(this.offset)}`;
  }

  public toSql(): string {
    return `TIMETZ '${this.toDuckDBString()}'`;
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }

  private static TimeBits = 40;
  private static OffsetBits = 24;
  private static MaxOffset = 16 * 60 * 60 - 1; // ±15:59:59 = 57599 seconds

  public static fromBits(bits: bigint): DuckDBTimeTZValue {
    const micros = BigInt.asUintN(
      DuckDBTimeTZValue.TimeBits,
      bits >> BigInt(DuckDBTimeTZValue.OffsetBits),
    );
    const offset =
      DuckDBTimeTZValue.MaxOffset -
      Number(BigInt.asUintN(DuckDBTimeTZValue.OffsetBits, bits));
    return new DuckDBTimeTZValue(micros, offset);
  }
}
