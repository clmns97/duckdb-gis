import {
  ArrayTypeInfo,
  DecimalTypeInfo,
  EnumTypeInfo,
  ListTypeInfo,
  StructTypeInfo,
  TypeIdAndInfo,
  TypeInfo,
} from '../../serialization/types/TypeInfo.js';

export function getArrayTypeInfo(
  typeInfo: TypeInfo | undefined,
): ArrayTypeInfo {
  if (!typeInfo) {
    throw new Error(`ARRAY has no typeInfo!`);
  }
  if (typeInfo.kind !== 'array') {
    throw new Error(`ARRAY has unexpected typeInfo.kind: ${typeInfo.kind}`);
  }
  return typeInfo;
}

export function getDecimalTypeInfo(
  typeInfo: TypeInfo | undefined,
): DecimalTypeInfo {
  if (!typeInfo) {
    throw new Error(`DECIMAL has no typeInfo!`);
  }
  if (typeInfo.kind !== 'decimal') {
    throw new Error(`DECIMAL has unexpected typeInfo.kind: ${typeInfo.kind}`);
  }
  return typeInfo;
}

export function getEnumTypeInfo(typeInfo: TypeInfo | undefined): EnumTypeInfo {
  if (!typeInfo) {
    throw new Error(`ENUM has no typeInfo!`);
  }
  if (typeInfo.kind !== 'enum') {
    throw new Error(`ENUM has unexpected typeInfo.kind: ${typeInfo.kind}`);
  }
  return typeInfo;
}

export function getListTypeInfo(typeInfo: TypeInfo | undefined): ListTypeInfo {
  if (!typeInfo) {
    throw new Error(`LIST has no typeInfo!`);
  }
  if (typeInfo.kind !== 'list') {
    throw new Error(`LIST has unexpected typeInfo.kind: ${typeInfo.kind}`);
  }
  return typeInfo;
}

export function getStructTypeInfo(
  typeInfo: TypeInfo | undefined,
): StructTypeInfo {
  if (!typeInfo) {
    throw new Error(`STRUCT has no typeInfo!`);
  }
  if (typeInfo.kind !== 'struct') {
    throw new Error(`STRUCT has unexpected typeInfo.kind: ${typeInfo.kind}`);
  }
  return typeInfo;
}

export function getMapTypeInfos(typeInfo: TypeInfo | undefined): {
  keyType: TypeIdAndInfo;
  valueType: TypeIdAndInfo;
} {
  // MAP = LIST(STRUCT(key KEY_TYPE, value VALUE_TYPE))
  const { childType } = getListTypeInfo(typeInfo);
  const { childTypes } = getStructTypeInfo(childType.typeInfo);
  if (childTypes.length !== 2) {
    throw new Error(
      `MAP childType has unexpected childTypes length: ${childTypes.length}`,
    );
  }
  if (childTypes[0].length !== 2) {
    throw new Error(
      `MAP childType has unexpected childTypes[0] length: ${childTypes[0].length}`,
    );
  }
  if (childTypes[1].length !== 2) {
    throw new Error(
      `MAP childType has unexpected childTypes[1] length: ${childTypes[1].length}`,
    );
  }
  return {
    keyType: childTypes[0][1],
    valueType: childTypes[1][1],
  };
}
