export function makeBuffer(bytes: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.length);
  const dv = new DataView(buffer);
  for (let offset = 0; offset < bytes.length; offset++) {
    dv.setUint8(offset, bytes[offset]);
  }
  return buffer;
}
