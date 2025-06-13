import { getDuckDBTimestampStringFromMicroseconds } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBTimestampMicrosecondsValue extends SpecialDuckDBValue {
  public readonly microseconds: bigint;

  constructor(microseconds: bigint) {
    super();
    this.microseconds = microseconds;
  }

  public toDuckDBString(): string {
    return getDuckDBTimestampStringFromMicroseconds(this.microseconds);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}

export type DuckDBTimestamp = DuckDBTimestampMicrosecondsValue;
