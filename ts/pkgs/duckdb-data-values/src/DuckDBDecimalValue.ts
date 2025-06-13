import {
  DuckDBDecimalFormatOptions,
  stringFromDecimal,
} from './conversion/stringFromDecimal.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBDecimalValue extends SpecialDuckDBValue {
  public readonly scaledValue: bigint;

  public readonly scale: number;

  constructor(scaledValue: bigint, scale: number) {
    super();
    this.scaledValue = scaledValue;
    this.scale = scale;
  }

  public toDuckDBString(): string {
    return stringFromDecimal(this.scaledValue, this.scale);
  }

  /** Returns a string representation appropriate to the host environment's current locale. */

  public toLocaleString(
    locales?: string | string[],
    options?: DuckDBDecimalFormatOptions,
  ): string {
    return stringFromDecimal(this.scaledValue, this.scale, {
      locales,
      options,
    });
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
