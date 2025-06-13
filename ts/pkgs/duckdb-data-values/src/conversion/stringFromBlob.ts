/** Matches BLOB-to-VARCHAR conversion behavior of DuckDB. */
export function stringFromBlob(bytes: Uint8Array): string {
  let result = '';
  for (const byte of bytes) {
    if (
      byte <= 0x1f ||
      byte === 0x22 /* single quote */ ||
      byte === 0x27 /* double quote */ ||
      byte >= 0x7f
    ) {
      result += `\\x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      result += String.fromCharCode(byte);
    }
  }
  return result;
}
