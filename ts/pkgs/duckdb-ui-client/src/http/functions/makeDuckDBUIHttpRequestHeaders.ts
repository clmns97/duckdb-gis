import { DuckDBUIRunOptions } from '../../client/types/DuckDBUIRunOptions.js';
import { toBase64 } from '../../util/functions/toBase64.js';

export interface DuckDBUIHttpRequestHeaderOptions extends DuckDBUIRunOptions {
  connectionName?: string;
}

export function makeDuckDBUIHttpRequestHeaders({
  description,
  connectionName,
  databaseName,
  schemaName,
  errorsAsJson,
  parameters,
  resultRowLimit,
  resultDatabaseName,
  resultSchemaName,
  resultTableName,
  resultTableRowLimit,
}: DuckDBUIHttpRequestHeaderOptions): Headers {
  const headers = new Headers();
  // We base64 encode some values because they can contain characters invalid in an HTTP header.
  if (description) {
    headers.append('X-DuckDB-UI-Request-Description', description);
  }
  if (connectionName) {
    headers.append('X-DuckDB-UI-Connection-Name', connectionName);
  }
  if (databaseName) {
    headers.append('X-DuckDB-UI-Database-Name', toBase64(databaseName));
  }
  if (schemaName) {
    headers.append('X-DuckDB-UI-Schema-Name', toBase64(schemaName));
  }
  if (parameters) {
    headers.append('X-DuckDB-UI-Parameter-Count', String(parameters.length));
    for (let i = 0; i < parameters.length; i++) {
      // TODO: support non-string parameters?
      headers.append(
        `X-DuckDB-UI-Parameter-Value-${i}`,
        toBase64(String(parameters[i])),
      );
    }
  }
  if (resultRowLimit !== undefined) {
    headers.append('X-DuckDB-UI-Result-Row-Limit', String(resultRowLimit));
  }
  if (resultDatabaseName) {
    headers.append(
      'X-DuckDB-UI-Result-Database-Name',
      toBase64(resultDatabaseName),
    );
  }
  if (resultSchemaName) {
    headers.append(
      'X-DuckDB-UI-Result-Schema-Name',
      toBase64(resultSchemaName),
    );
  }
  if (resultTableName) {
    headers.append('X-DuckDB-UI-Result-Table-Name', toBase64(resultTableName));
  }
  if (resultTableRowLimit !== undefined) {
    headers.append(
      'X-DuckDB-UI-Result-Table-Row-Limit',
      String(resultTableRowLimit),
    );
  }
  if (errorsAsJson) {
    headers.append('X-DuckDB-UI-Errors-As-JSON', 'true');
  }
  return headers;
}
