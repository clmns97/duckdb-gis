import { expect, suite, test } from 'vitest';
import { DuckDBTimestampNanosecondsValue } from '../src/DuckDBTimestampNanosecondsValue';

suite('DuckDBTimestampNanosecondsValue', () => {
  test('should render a normal timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampNanosecondsValue(1612325106007891000n).toString(),
    ).toStrictEqual('2021-02-03 04:05:06.007891');
  });
  test('should render a zero timestamp value to the correct string', () => {
    expect(new DuckDBTimestampNanosecondsValue(0n).toString()).toStrictEqual(
      '1970-01-01 00:00:00',
    );
  });
  test('should render a negative timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampNanosecondsValue(-7000n).toString(),
    ).toStrictEqual('1969-12-31 23:59:59.999993');
  });
  test('should render a large positive timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampNanosecondsValue(8857641599999123000n).toString(),
    ).toStrictEqual('2250-09-08 23:59:59.999123');
  });
  test('should render a large negative timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampNanosecondsValue(-8495881076543211000n).toString(),
    ).toStrictEqual('1700-10-11 01:02:03.456789');
  });
  test('should render the max timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampNanosecondsValue(9223372036854775806n).toString(),
    ).toStrictEqual('2262-04-11 23:47:16.854775');
  });
  test('should render the min timestamp value to the correct string', () => {
    expect(
      new DuckDBTimestampNanosecondsValue(-9223372036854775806n).toString(),
    ).toStrictEqual('1677-09-21 00:12:43.145225');
  });
});
