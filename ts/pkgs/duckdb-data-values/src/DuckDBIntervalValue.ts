import { getDuckDBIntervalString } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBIntervalValue extends SpecialDuckDBValue {
  public readonly months: number;

  public readonly days: number;

  public readonly microseconds: bigint;

  constructor(months: number, days: number, microseconds: bigint) {
    super();
    this.months = months;
    this.days = days;
    this.microseconds = microseconds;
  }

  public toDuckDBString(): string {
    return getDuckDBIntervalString(this.months, this.days, this.microseconds);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
