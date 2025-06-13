import { displayStringForDuckDBValue } from './conversion/displayStringForDuckDBValue.js';
import { jsonFromDuckDBValue } from './conversion/jsonFromDuckDBValue.js';
import { DuckDBValue } from './DuckDBValue.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBArrayValue extends SpecialDuckDBValue {
  public readonly values: readonly DuckDBValue[];

  constructor(values: readonly DuckDBValue[]) {
    super();
    this.values = values;
  }

  public toDuckDBString(): string {
    const valueStrings = this.values.map(displayStringForDuckDBValue);
    return `[${valueStrings.join(', ')}]`;
  }

  public toJson(): Json {
    return this.values.map(jsonFromDuckDBValue);
  }
}
