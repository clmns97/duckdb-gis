import { getDuckDBTimestampStringFromNanoseconds } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBTimestampNanosecondsValue extends SpecialDuckDBValue {
  public readonly nanoseconds: bigint;

  constructor(nanoseconds: bigint) {
    super();
    this.nanoseconds = nanoseconds;
  }

  public toDuckDBString(): string {
    return getDuckDBTimestampStringFromNanoseconds(this.nanoseconds);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
