import { expect, suite, test } from 'vitest';
import { makeDuckDBUIHttpRequestHeaders } from '../../../src/http/functions/makeDuckDBUIHttpRequestHeaders';

suite('makeDuckDBUIHttpRequestHeaders', () => {
  test('description', () => {
    expect([
      ...makeDuckDBUIHttpRequestHeaders({
        description: 'example description',
      }).entries(),
    ]).toEqual([['x-duckdb-ui-request-description', 'example description']]);
  });
  test('connection name', () => {
    expect([
      ...makeDuckDBUIHttpRequestHeaders({
        connectionName: 'example connection name',
      }).entries(),
    ]).toEqual([['x-duckdb-ui-connection-name', 'example connection name']]);
  });
  test('database name', () => {
    // should be base64 encoded
    expect([
      ...makeDuckDBUIHttpRequestHeaders({
        databaseName: 'example database name',
      }).entries(),
    ]).toEqual([['x-duckdb-ui-database-name', 'ZXhhbXBsZSBkYXRhYmFzZSBuYW1l']]);
  });
  test('parameters', () => {
    // values should be base64 encoded
    expect([
      ...makeDuckDBUIHttpRequestHeaders({
        parameters: ['first', 'second'],
      }).entries(),
    ]).toEqual([
      ['x-duckdb-ui-parameter-count', '2'],
      ['x-duckdb-ui-parameter-value-0', 'Zmlyc3Q='],
      ['x-duckdb-ui-parameter-value-1', 'c2Vjb25k'],
    ]);
  });
});
