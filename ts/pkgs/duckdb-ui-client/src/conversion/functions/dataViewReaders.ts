// DuckDB's physical storage and binary serialization format is little endian.
const littleEndian = true;

export function getInt8(dataView: DataView, offset: number): number {
  return dataView.getInt8(offset);
}

export function getUInt8(dataView: DataView, offset: number): number {
  return dataView.getUint8(offset);
}

export function getInt16(dataView: DataView, offset: number): number {
  return dataView.getInt16(offset, littleEndian);
}

export function getUInt16(dataView: DataView, offset: number): number {
  return dataView.getUint16(offset, littleEndian);
}

export function getInt32(dataView: DataView, offset: number): number {
  return dataView.getInt32(offset, littleEndian);
}

export function getUInt32(dataView: DataView, offset: number): number {
  return dataView.getUint32(offset, littleEndian);
}

export function getInt64(dataView: DataView, offset: number): bigint {
  return dataView.getBigInt64(offset, littleEndian);
}

export function getUInt64(dataView: DataView, offset: number): bigint {
  return dataView.getBigUint64(offset, littleEndian);
}

export function getFloat32(dataView: DataView, offset: number): number {
  return dataView.getFloat32(offset, littleEndian);
}

export function getFloat64(dataView: DataView, offset: number): number {
  return dataView.getFloat64(offset, littleEndian);
}

export function getInt128(dataView: DataView, offset: number): bigint {
  const lower = getUInt64(dataView, offset);
  const upper = getInt64(dataView, offset + 8);
  return (upper << BigInt(64)) + lower;
}

export function getUInt128(dataView: DataView, offset: number): bigint {
  const lower = getUInt64(dataView, offset);
  const upper = getUInt64(dataView, offset + 8);
  return (BigInt.asUintN(64, upper) << BigInt(64)) | BigInt.asUintN(64, lower);
}

export function getBoolean(dataView: DataView, offset: number): boolean {
  return getUInt8(dataView, offset) !== 0;
}
