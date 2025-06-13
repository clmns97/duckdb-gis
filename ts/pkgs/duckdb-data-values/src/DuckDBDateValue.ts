import { getDuckDBDateStringFromDays } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBDateValue extends SpecialDuckDBValue {
  public readonly days: number;

  constructor(days: number) {
    super();
    this.days = days;
  }

  public toDuckDBString(): string {
    return getDuckDBDateStringFromDays(this.days);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
