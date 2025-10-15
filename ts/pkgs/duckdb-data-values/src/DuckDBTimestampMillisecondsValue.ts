import { getDuckDBTimestampStringFromMilliseconds } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBTimestampMillisecondsValue extends SpecialDuckDBValue {
  public readonly milliseconds: bigint;

  constructor(milliseconds: bigint) {
    super();
    this.milliseconds = milliseconds;
  }

  public toDuckDBString(): string {
    return getDuckDBTimestampStringFromMilliseconds(this.milliseconds);
  }

  public toSql(): string {
    return `TIMESTAMP_MS '${this.toDuckDBString()}'`;
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
