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
  resultChunkLimit,
  resultDatabaseName,
  resultSchemaName,
  resultTableName,
  resultTableChunkLimit,
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
  if (resultChunkLimit !== undefined) {
    headers.append('X-DuckDB-UI-Result-Chunk-Limit', String(resultChunkLimit));
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
  if (resultTableChunkLimit !== undefined) {
    headers.append(
      'X-DuckDB-UI-Result-Table-Chunk-Limit',
      String(resultTableChunkLimit),
    );
  }
  if (errorsAsJson) {
    headers.append('X-DuckDB-UI-Errors-As-JSON', 'true');
  }
  return headers;
}
