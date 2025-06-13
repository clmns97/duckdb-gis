import { getUInt64 } from './dataViewReaders.js';

export function isRowValid(validity: DataView | null, row: number): boolean {
  if (!validity) return true;
  const bigint = getUInt64(validity, Math.floor(row / 64) * 8);
  return (bigint & (1n << BigInt(row % 64))) !== 0n;
}
