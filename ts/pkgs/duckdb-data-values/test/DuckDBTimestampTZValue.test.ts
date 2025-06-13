import { expect, suite, test } from 'vitest';
import { DuckDBTimestampTZValue } from '../src/DuckDBTimestampTZValue';

suite('DuckDBTimestampTZValue', () => {
  test('should render a timestamp tz value with no timezone offset to the correct string', () => {
    expect(
      new DuckDBTimestampTZValue(1612325106007800n).toDuckDBString(),
    ).toStrictEqual('2021-02-03 04:05:06.0078+00'); // defaults to UTC
  });
  test('should render a timestamp tz value with a zero timezone offset to the correct string', () => {
    expect(
      new DuckDBTimestampTZValue(1612325106007800n).toDuckDBString({
        timezoneOffsetInMinutes: 0,
      }),
    ).toStrictEqual('2021-02-03 04:05:06.0078+00');
  });
  test('should render a timestamp tz value with a positive timezone offset to the correct string', () => {
    expect(
      new DuckDBTimestampTZValue(1612325106007800n).toDuckDBString({
        timezoneOffsetInMinutes: 300,
      }),
    ).toStrictEqual('2021-02-03 09:05:06.0078+05');
  });
  test('should render a timestamp tz value with a negative timezone offset to the correct string', () => {
    expect(
      new DuckDBTimestampTZValue(1612325106007800n).toDuckDBString({
        timezoneOffsetInMinutes: -300,
      }),
    ).toStrictEqual('2021-02-02 23:05:06.0078-05');
  });
  test('should render a timestamp tz value with a timezone offset containing minutes to the correct string', () => {
    expect(
      new DuckDBTimestampTZValue(1612325106007800n).toDuckDBString({
        timezoneOffsetInMinutes: 330,
      }),
    ).toStrictEqual('2021-02-03 09:35:06.0078+05:30');
  });
});
