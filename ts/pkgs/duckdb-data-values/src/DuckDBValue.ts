import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export type DuckDBValue =
  | null
  | boolean
  | number
  | string
  | bigint // TODO: Should types requiring bigint be SpecialDBValues?
  | SpecialDuckDBValue;
