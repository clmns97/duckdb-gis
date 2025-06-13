import { BinaryDeserializer } from '../classes/BinaryDeserializer.js';
import { BinaryStreamReader } from '../classes/BinaryStreamReader.js';

export function deserializerFromBuffer(
  buffer: ArrayBuffer,
): BinaryDeserializer {
  const streamReader = new BinaryStreamReader(buffer);
  const deserializer = new BinaryDeserializer(streamReader);
  return deserializer;
}
