import { expect, suite, test } from 'vitest';
import { DuckDBTimestampMicrosecondsValue } from '../src/DuckDBTimestampMicrosecondsValue';

suite('DuckDBTimestampMicrosecondsValue', () => {
  test('should render a normal timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(1612325106007800n).toString(),
    ).toStrictEqual('2021-02-03 04:05:06.0078');
  });
  test('should render a zero timestamp value to the correct string', () => {
    expect(new DuckDBTimestampMicrosecondsValue(0n).toString()).toStrictEqual(
      '1970-01-01 00:00:00',
    );
  });
  test('should render a negative timestamp value to the correct string', () => {
    expect(new DuckDBTimestampMicrosecondsValue(-7n).toString()).toStrictEqual(
      '1969-12-31 23:59:59.999993',
    );
  });
  test('should render a large positive timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(2353318271999999000n).toString(),
    ).toStrictEqual('76543-09-08 23:59:59.999');
  });
  test('should render a large negative (AD) timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(-58261244276543211n).toString(),
    ).toStrictEqual('0123-10-11 01:02:03.456789');
  });
  test('should render a large negative (BC) timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(-65992661876543211n).toString(),
    ).toStrictEqual('0123-10-11 (BC) 01:02:03.456789');
  });
  test('should render the max timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(9223372036854775806n).toString(),
    ).toStrictEqual('294247-01-10 04:00:54.775806');
  });
  test('should render the min timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(-9223372022400000000n).toString(),
    ).toStrictEqual('290309-12-22 (BC) 00:00:00');
  });
  test('should render the positive infinity timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(9223372036854775807n).toString(),
    ).toStrictEqual('infinity');
  });
  test('should render the negative infinity timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampMicrosecondsValue(-9223372036854775807n).toString(),
    ).toStrictEqual('-infinity');
  });

  suite('toSql', () => {
    test('should render timestamp to SQL', () => {
      const timestamp = new DuckDBTimestampMicrosecondsValue(
        BigInt(1697212800) * 1000000n,
      );
      expect(timestamp.toSql()).toMatch(/^TIMESTAMP '.+'$/);
    });

    test('should render epoch to SQL', () => {
      expect(new DuckDBTimestampMicrosecondsValue(0n).toSql()).toStrictEqual(
        "TIMESTAMP '1970-01-01 00:00:00'",
      );
    });
  });
});
