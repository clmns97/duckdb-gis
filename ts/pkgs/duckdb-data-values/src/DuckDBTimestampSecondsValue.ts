import { getDuckDBTimestampStringFromSeconds } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBTimestampSecondsValue extends SpecialDuckDBValue {
  public readonly seconds: bigint;

  constructor(seconds: bigint) {
    super();
    this.seconds = seconds;
  }

  public toDuckDBString(): string {
    return getDuckDBTimestampStringFromSeconds(this.seconds);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
