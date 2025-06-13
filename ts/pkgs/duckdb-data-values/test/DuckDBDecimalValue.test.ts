import { expect, suite, test } from 'vitest';
import { DuckDBDecimalValue } from '../src/DuckDBDecimalValue';

suite('DuckDBDecimalValue', () => {
  test('should render a scaled value of zero with a scale of zero to the correct string', () => {
    expect(new DuckDBDecimalValue(0n, 0).toString()).toStrictEqual('0');
  });
  test('should render a small positive scaled value with a scale of zero to the correct string', () => {
    expect(new DuckDBDecimalValue(7n, 0).toString()).toStrictEqual('7');
  });
  test('should render a small negative scaled value with a scale of zero to the correct string', () => {
    expect(new DuckDBDecimalValue(-7n, 0).toString()).toStrictEqual('-7');
  });
  test('should render a large positive scaled value with a scale of zero to the correct string', () => {
    expect(
      new DuckDBDecimalValue(987654321098765432109876543210n, 0).toString(),
    ).toStrictEqual('987654321098765432109876543210');
  });
  test('should render a large negative scaled value with a scale of zero to the correct string', () => {
    expect(
      new DuckDBDecimalValue(-987654321098765432109876543210n, 0).toString(),
    ).toStrictEqual('-987654321098765432109876543210');
  });
  test('should render the maximum positive scaled value with a scale of zero to the correct string', () => {
    expect(
      new DuckDBDecimalValue(
        99999999999999999999999999999999999999n,
        0,
      ).toString(),
    ).toStrictEqual('99999999999999999999999999999999999999');
  });
  test('should render the maximum negative scaled value with a scale of zero to the correct string', () => {
    expect(
      new DuckDBDecimalValue(
        -99999999999999999999999999999999999999n,
        0,
      ).toString(),
    ).toStrictEqual('-99999999999999999999999999999999999999');
  });

  test('should render a scaled value of zero with a non-zero scale to the correct string', () => {
    expect(new DuckDBDecimalValue(0n, 3).toString()).toStrictEqual('0.000');
  });
  test('should render a small positive scaled value with a non-zero scale to the correct string', () => {
    expect(new DuckDBDecimalValue(12345n, 3).toString()).toStrictEqual(
      '12.345',
    );
  });
  test('should render a small negative scaled value with a non-zero scale to the correct string', () => {
    expect(new DuckDBDecimalValue(-12345n, 3).toString()).toStrictEqual(
      '-12.345',
    );
  });
  test('should render a large positive scaled value with a non-zero scale to the correct string', () => {
    expect(
      new DuckDBDecimalValue(987654321098765432109876543210n, 10).toString(),
    ).toStrictEqual('98765432109876543210.9876543210');
  });
  test('should render a large negative scaled value with a non-zero scale to the correct string', () => {
    expect(
      new DuckDBDecimalValue(-987654321098765432109876543210n, 10).toString(),
    ).toStrictEqual('-98765432109876543210.9876543210');
  });
  test('should render leading and trailing zeros in the fractional part of value greater than one correctly', () => {
    expect(new DuckDBDecimalValue(120034500n, 7).toString()).toStrictEqual(
      '12.0034500',
    );
  });
  test('should render leading and trailing zeros in the fractional part of value less than negative one correctly', () => {
    expect(new DuckDBDecimalValue(-120034500n, 7).toString()).toStrictEqual(
      '-12.0034500',
    );
  });
  test('should render leading and trailing zeros in the fractional part of value between zero and one correctly', () => {
    expect(new DuckDBDecimalValue(34500n, 7).toString()).toStrictEqual(
      '0.0034500',
    );
  });
  test('should render leading and trailing zeros in the fractional part of value between zero and negative one correctly', () => {
    expect(new DuckDBDecimalValue(-34500n, 7).toString()).toStrictEqual(
      '-0.0034500',
    );
  });
  test('should render a small positive scaled value with a the maximum scale to the correct string', () => {
    expect(new DuckDBDecimalValue(1n, 38).toString()).toStrictEqual(
      '0.00000000000000000000000000000000000001',
    );
  });
  test('should render a small negative scaled value with a the maximum scale to the correct string', () => {
    expect(new DuckDBDecimalValue(-1n, 38).toString()).toStrictEqual(
      '-0.00000000000000000000000000000000000001',
    );
  });
  test('should render the maximum positive scaled value with a the maximum scale to the correct string', () => {
    expect(
      new DuckDBDecimalValue(
        99999999999999999999999999999999999999n,
        38,
      ).toString(),
    ).toStrictEqual('0.99999999999999999999999999999999999999');
  });
  test('should render the maximum negative scaled value with a the maximum scale to the correct string', () => {
    expect(
      new DuckDBDecimalValue(
        -99999999999999999999999999999999999999n,
        38,
      ).toString(),
    ).toStrictEqual('-0.99999999999999999999999999999999999999');
  });

  test('should render a locale string with grouping by default', () => {
    expect(
      new DuckDBDecimalValue(9876543210n, 0).toLocaleString(),
    ).toStrictEqual('9,876,543,210');
  });

  test('should render a European locale with . for grouping', () => {
    expect(
      new DuckDBDecimalValue(9876543210n, 0).toLocaleString('de-DE'),
    ).toStrictEqual('9.876.543.210');
  });

  test('should render a locale string with a specified minimum fraction digits', () => {
    expect(
      new DuckDBDecimalValue(12345n, 3).toLocaleString(undefined, {
        minimumFractionDigits: 5,
      }),
    ).toStrictEqual('12.34500');
  });

  test('should render a locale string with a specified maximum fraction digits', () => {
    expect(
      new DuckDBDecimalValue(12345n, 3).toLocaleString(undefined, {
        maximumFractionDigits: 1,
      }),
    ).toStrictEqual('12.3');
  });

  test('should render a decimal with a large whole part and fractional part in a European locale with the correct grouping and decimal', () => {
    expect(
      new DuckDBDecimalValue(98765432109876543210n, 10).toLocaleString(
        'de-DE',
        {
          useGrouping: true,
          maximumFractionDigits: 5,
        },
      ),
    ).toStrictEqual('9.876.543.210,98765');
  });
});
