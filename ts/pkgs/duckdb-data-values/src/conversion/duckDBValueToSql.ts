import { DuckDBValue } from '../DuckDBValue.js';
import { SpecialDuckDBValue } from '../SpecialDuckDBValue.js';

/** Converts a DuckDBValue to a valid SQL string. */
export function duckDBValueToSql(value: DuckDBValue): string {
  if (value == null) {
    return 'NULL';
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof SpecialDuckDBValue) {
    return value.toSql();
  }
  return String(value);
}
