import { getDuckDBTimeStringFromMicrosecondsInDay } from './conversion/dateTimeStringConversion.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBTimeValue extends SpecialDuckDBValue {
  public readonly microseconds: bigint;

  constructor(microseconds: bigint) {
    super();
    this.microseconds = microseconds;
  }

  public toDuckDBString(): string {
    return getDuckDBTimeStringFromMicrosecondsInDay(this.microseconds);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
