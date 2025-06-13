import { expect, suite, test } from 'vitest';
import { DuckDBTimeTZValue } from '../src/DuckDBTimeTZValue';

suite('DuckDBTimeTZValue', () => {
  test('should render a normal time value with a positive offset to the correct string', () => {
    expect(
      new DuckDBTimeTZValue(
        ((12n * 60n + 34n) * 60n + 56n) * 1000000n + 789012n,
        (13 * 60 + 24) * 60 + 57,
      ).toString(),
    ).toStrictEqual('12:34:56.789012+13:24:57');
  });
  test('should render a normal time value with millisecond precision with an offset in minutes to the correct string', () => {
    expect(
      new DuckDBTimeTZValue(
        ((12n * 60n + 34n) * 60n + 56n) * 1000000n + 789000n,
        (13 * 60 + 24) * 60,
      ).toString(),
    ).toStrictEqual('12:34:56.789+13:24');
  });
  test('should render a normal time value with second precision with an offset in hours to the correct string', () => {
    expect(
      new DuckDBTimeTZValue(
        ((12n * 60n + 34n) * 60n + 56n) * 1000000n,
        (13 * 60 + 0) * 60,
      ).toString(),
    ).toStrictEqual('12:34:56+13');
  });
  test('should render a zero time value with a zero offset to the correct string', () => {
    expect(new DuckDBTimeTZValue(0n, 0).toString()).toStrictEqual(
      '00:00:00+00',
    );
  });
  test('should render the max value to the correct string', () => {
    expect(
      new DuckDBTimeTZValue(
        ((24n * 60n + 0n) * 60n + 0n) * 1000000n,
        -((15 * 60 + 59) * 60 + 59),
      ).toString(),
    ).toStrictEqual('24:00:00-15:59:59');
  });
  test('should render the min value to the correct string', () => {
    expect(
      new DuckDBTimeTZValue(0n, (15 * 60 + 59) * 60 + 59).toString(),
    ).toStrictEqual('00:00:00+15:59:59');
  });
  test('should construct the correct value from bits', () => {
    expect(DuckDBTimeTZValue.fromBits(0n).toString()).toStrictEqual(
      '00:00:00+15:59:59',
    );
  });
  test('should construct the correct value from bits', () => {
    expect(
      DuckDBTimeTZValue.fromBits(
        (BigInt.asUintN(40, ((24n * 60n + 0n) * 60n + 0n) * 1000000n) << 24n) |
          BigInt.asUintN(24, (31n * 60n + 59n) * 60n + 58n),
      ).toString(),
    ).toStrictEqual('24:00:00-15:59:59');
  });
});
