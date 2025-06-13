export function hexFromBlob(
  blob: Uint8Array,
  start: number | undefined,
  end: number | undefined,
): string {
  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = blob.length;
  }
  let hex = '';

  for (let i = start; i < end; i++) {
    const byte = blob[i];
    // Ensure each byte is 2 hex characters
    hex += (byte < 16 ? '0' : '') + byte.toString(16);
  }
  return hex;
}
