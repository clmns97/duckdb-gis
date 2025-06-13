/**
 * Enables reading or peeking at values of a binary buffer.
 * Subsequent reads start from the end of the previous one.
 */
export class BinaryStreamReader {
  private dv: DataView;

  private offset: number;

  public constructor(buffer: ArrayBuffer) {
    this.dv = new DataView(buffer);
    this.offset = 0;
  }

  public getOffset() {
    return this.offset;
  }

  public peekUint8() {
    return this.dv.getUint8(this.offset);
  }

  public peekUint16(le: boolean) {
    return this.dv.getUint16(this.offset, le);
  }

  public consume(byteCount: number) {
    this.offset += byteCount;
  }

  private offsetBeforeConsume(byteCount: number) {
    const offsetBefore = this.offset;
    this.consume(byteCount);
    return offsetBefore;
  }

  public readUint8() {
    return this.dv.getUint8(this.offsetBeforeConsume(1));
  }

  public readData(length: number) {
    return new DataView(
      this.dv.buffer,
      this.offsetBeforeConsume(length),
      length,
    );
  }
}
