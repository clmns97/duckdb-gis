import { DuckDBValue } from '../DuckDBValue.js';
import { Json } from '../Json.js';
import { SpecialDuckDBValue } from '../SpecialDuckDBValue.js';

export function jsonFromDuckDBValue(value: DuckDBValue): Json {
  if (value === null) {
    return null;
  }
  if (typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof SpecialDuckDBValue) {
    return value.toJson();
  }
  return value;
}
