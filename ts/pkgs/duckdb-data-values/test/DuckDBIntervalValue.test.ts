import { expect, suite, test } from 'vitest';
import { DuckDBIntervalValue } from '../src/DuckDBIntervalValue';

const MICROS_IN_SEC = 1000000n;
const MICROS_IN_MIN = 60n * MICROS_IN_SEC;
const MICROS_IN_HR = 60n * MICROS_IN_MIN;
const MAX_INT32 = 2n ** 31n - 1n;

suite('DuckDBIntervalValue', () => {
  test('should render an empty interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 0, 0n).toString()).toStrictEqual(
      '00:00:00',
    );
  });

  test('should render a one month interval to the correct string', () => {
    expect(new DuckDBIntervalValue(1, 0, 0n).toString()).toStrictEqual(
      '1 month',
    );
  });
  test('should render a negative one month interval to the correct string', () => {
    expect(new DuckDBIntervalValue(-1, 0, 0n).toString()).toStrictEqual(
      '-1 months',
    );
  });
  test('should render a two month interval to the correct string', () => {
    expect(new DuckDBIntervalValue(2, 0, 0n).toString()).toStrictEqual(
      '2 months',
    );
  });
  test('should render a negative two month interval to the correct string', () => {
    expect(new DuckDBIntervalValue(-2, 0, 0n).toString()).toStrictEqual(
      '-2 months',
    );
  });
  test('should render a one year interval to the correct string', () => {
    expect(new DuckDBIntervalValue(12, 0, 0n).toString()).toStrictEqual(
      '1 year',
    );
  });
  test('should render a negative one year interval to the correct string', () => {
    expect(new DuckDBIntervalValue(-12, 0, 0n).toString()).toStrictEqual(
      '-1 years',
    );
  });
  test('should render a two year interval to the correct string', () => {
    expect(new DuckDBIntervalValue(24, 0, 0n).toString()).toStrictEqual(
      '2 years',
    );
  });
  test('should render a negative two year interval to the correct string', () => {
    expect(new DuckDBIntervalValue(-24, 0, 0n).toString()).toStrictEqual(
      '-2 years',
    );
  });
  test('should render a two year, three month interval to the correct string', () => {
    expect(new DuckDBIntervalValue(24 + 3, 0, 0n).toString()).toStrictEqual(
      '2 years 3 months',
    );
  });
  test('should render a negative two year, three month interval to the correct string', () => {
    expect(new DuckDBIntervalValue(-(24 + 3), 0, 0n).toString()).toStrictEqual(
      '-2 years -3 months',
    );
  });

  test('should render a one day interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 1, 0n).toString()).toStrictEqual('1 day');
  });
  test('should render a negative one day interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, -1, 0n).toString()).toStrictEqual(
      '-1 days',
    );
  });
  test('should render a two day interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 2, 0n).toString()).toStrictEqual(
      '2 days',
    );
  });
  test('should render a negative two day interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, -2, 0n).toString()).toStrictEqual(
      '-2 days',
    );
  });
  test('should render a 30 day interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 30, 0n).toString()).toStrictEqual(
      '30 days',
    );
  });
  test('should render a 365 day interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 365, 0n).toString()).toStrictEqual(
      '365 days',
    );
  });

  test('should render a one microsecond interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 0, 1n).toString()).toStrictEqual(
      '00:00:00.000001',
    );
  });
  test('should render a negative one microsecond interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 0, -1n).toString()).toStrictEqual(
      '-00:00:00.000001',
    );
  });
  test('should render a large microsecond interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 0, 987654n).toString()).toStrictEqual(
      '00:00:00.987654',
    );
  });
  test('should render a large negative microsecond interval to the correct string', () => {
    expect(new DuckDBIntervalValue(0, 0, -987654n).toString()).toStrictEqual(
      '-00:00:00.987654',
    );
  });
  test('should render a one second interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, MICROS_IN_SEC).toString(),
    ).toStrictEqual('00:00:01');
  });
  test('should render a negative one second interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -MICROS_IN_SEC).toString(),
    ).toStrictEqual('-00:00:01');
  });
  test('should render a 59 second interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, 59n * MICROS_IN_SEC).toString(),
    ).toStrictEqual('00:00:59');
  });
  test('should render a -59 second interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -59n * MICROS_IN_SEC).toString(),
    ).toStrictEqual('-00:00:59');
  });
  test('should render a one minute interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, MICROS_IN_MIN).toString(),
    ).toStrictEqual('00:01:00');
  });
  test('should render a negative one minute interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -MICROS_IN_MIN).toString(),
    ).toStrictEqual('-00:01:00');
  });
  test('should render a 59 minute interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, 59n * MICROS_IN_MIN).toString(),
    ).toStrictEqual('00:59:00');
  });
  test('should render a -59 minute interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -59n * MICROS_IN_MIN).toString(),
    ).toStrictEqual('-00:59:00');
  });
  test('should render a one hour interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, MICROS_IN_HR).toString(),
    ).toStrictEqual('01:00:00');
  });
  test('should render a negative one hour interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -MICROS_IN_HR).toString(),
    ).toStrictEqual('-01:00:00');
  });
  test('should render a 24 hour interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, 24n * MICROS_IN_HR).toString(),
    ).toStrictEqual('24:00:00');
  });
  test('should render a -24 hour interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -24n * MICROS_IN_HR).toString(),
    ).toStrictEqual('-24:00:00');
  });
  test('should render a very large interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, MAX_INT32 * MICROS_IN_HR).toString(),
    ).toStrictEqual('2147483647:00:00');
  });
  test('should render a very large negative interval to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, -MAX_INT32 * MICROS_IN_HR).toString(),
    ).toStrictEqual('-2147483647:00:00');
  });
  test('should render a very large interval with microseconds to the correct string', () => {
    expect(
      new DuckDBIntervalValue(0, 0, MAX_INT32 * MICROS_IN_HR + 1n).toString(),
    ).toStrictEqual('2147483647:00:00.000001');
  });
  test('should render a very large negative interval with microseconds to the correct string', () => {
    expect(
      new DuckDBIntervalValue(
        0,
        0,
        -(MAX_INT32 * MICROS_IN_HR + 1n),
      ).toString(),
    ).toStrictEqual('-2147483647:00:00.000001');
  });

  test('should render a interval with multiple parts to the correct string', () => {
    expect(
      new DuckDBIntervalValue(
        24 + 3,
        5,
        7n * MICROS_IN_HR + 11n * MICROS_IN_MIN + 13n * MICROS_IN_SEC + 17n,
      ).toString(),
    ).toStrictEqual('2 years 3 months 5 days 07:11:13.000017');
  });
  test('should render a negative interval with multiple parts to the correct string', () => {
    expect(
      new DuckDBIntervalValue(
        -(24 + 3),
        -5,
        -(7n * MICROS_IN_HR + 11n * MICROS_IN_MIN + 13n * MICROS_IN_SEC + 17n),
      ).toString(),
    ).toStrictEqual('-2 years -3 months -5 days -07:11:13.000017');
  });

  suite('toSql', () => {
    test('should render interval value to SQL', () => {
      const interval = new DuckDBIntervalValue(12, 5, 123456n);
      expect(interval.toSql()).toStrictEqual(
        "INTERVAL '1 year 5 days 00:00:00.123456'",
      );
    });

    test('should render interval with months only to SQL', () => {
      const interval = new DuckDBIntervalValue(24, 0, 0n);
      expect(interval.toSql()).toStrictEqual("INTERVAL '2 years'");
    });

    test('should render interval with days only to SQL', () => {
      const interval = new DuckDBIntervalValue(0, 7, 0n);
      expect(interval.toSql()).toStrictEqual("INTERVAL '7 days'");
    });
  });
});
