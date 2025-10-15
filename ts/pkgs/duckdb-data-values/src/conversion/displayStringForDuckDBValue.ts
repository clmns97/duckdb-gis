import { DuckDBValue } from '../DuckDBValue.js';

export function displayStringForDuckDBValue(value: DuckDBValue): string {
  if (value == null) {
    return 'NULL';
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  return String(value);
}
