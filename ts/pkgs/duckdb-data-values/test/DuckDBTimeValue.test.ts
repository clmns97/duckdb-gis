import { expect, suite, test } from 'vitest';
import { DuckDBTimeValue } from '../src/DuckDBTimeValue';

suite('DuckDBTimeValue', () => {
  test('should render a normal time value to the correct string', () => {
    expect(new DuckDBTimeValue(45296000000n).toString()).toStrictEqual(
      '12:34:56',
    );
  });
  test('should render the max time value to the correct string', () => {
    expect(new DuckDBTimeValue(86399999999n).toString()).toStrictEqual(
      '23:59:59.999999',
    );
  });
  test('should render the min time value to the correct string', () => {
    expect(new DuckDBTimeValue(0n).toString()).toStrictEqual('00:00:00');
  });
});
