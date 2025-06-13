import { stringFromBlob } from './conversion/stringFromBlob.js';
import { Json } from './Json.js';
import { SpecialDuckDBValue } from './SpecialDuckDBValue.js';

export class DuckDBBlobValue extends SpecialDuckDBValue {
  public readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    super();
    this.bytes = bytes;
  }

  public toDuckDBString(): string {
    return stringFromBlob(this.bytes);
  }

  public toJson(): Json {
    return this.toDuckDBString();
  }
}
