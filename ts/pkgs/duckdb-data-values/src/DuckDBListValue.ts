import { displayStringForDuckDBValue } from './conversion/displayStringForDuckDBValue.js';
import { jsonFromDuckDBValue } from './conversion/jsonFromDuckDBValue.js';
import { duckDBValueToSql } from './conversion/duckDBValueToSql.js';
import { DuckDBValue } from './DuckDBValue.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBListValue extends SpecialDuckDBValue {
  public readonly values: readonly DuckDBValue[];

  constructor(values: readonly DuckDBValue[]) {
    super();
    this.values = values;
  }

  public toDuckDBString(): string {
    const valueStrings = this.values.map(displayStringForDuckDBValue);
    return `[${valueStrings.join(', ')}]`;
  }

  public toSql(): string {
    const valueStrings = this.values.map((v) => duckDBValueToSql(v));
    return `[${valueStrings.join(', ')}]`;
  }

  public toJson(): Json {
    return this.values.map(jsonFromDuckDBValue);
  }
}
