import { displayStringForDuckDBValue } from './conversion/displayStringForDuckDBValue.js';
import { jsonFromDuckDBValue } from './conversion/jsonFromDuckDBValue.js';
import { DuckDBStructEntry } from './DuckDBStructEntry.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBStructValue extends SpecialDuckDBValue {
  public readonly entries: readonly DuckDBStructEntry[];

  constructor(entries: readonly DuckDBStructEntry[]) {
    super();
    this.entries = entries;
  }

  public toDuckDBString(): string {
    const entryStrings = this.entries.map(
      ({ key, value }) =>
        `${displayStringForDuckDBValue(key)}: ${displayStringForDuckDBValue(
          value,
        )}`,
    );
    return `{${entryStrings.join(', ')}}`;
  }

  public toJson(): Json {
    const result: Json = {};
    for (const { key, value } of this.entries) {
      const keyString = displayStringForDuckDBValue(key);
      result[keyString] = jsonFromDuckDBValue(value);
    }
    return result;
  }
}
