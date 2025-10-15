import { DuckDBToStringOptions } from './DuckDBToStringOptions.js';
import { Json } from './Json.js';

export abstract class SpecialDuckDBValue {
  // The presence of this function can be used to identify SpecialDuckDBValue objects.
  public abstract toDuckDBString(
    toStringOptions?: DuckDBToStringOptions,
  ): string;

  // Convert this value to a SQL-compatible representation.
  public abstract toSql(): string;

  public toString(): string {
    return this.toDuckDBString();
  }

  public abstract toJson(): Json;
}
