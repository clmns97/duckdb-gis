import { toBase64 } from '../../util/functions/toBase64.js';

export interface DuckDBUIHttpRequestHeaderOptions {
  description?: string;
  connectionName?: string;
  databaseName?: string;
  parameters?: unknown[];
}

export function makeDuckDBUIHttpRequestHeaders({
  description,
  connectionName,
  databaseName,
  parameters,
}: DuckDBUIHttpRequestHeaderOptions): Headers {
  const headers = new Headers();
  if (description) {
    headers.append('X-DuckDB-UI-Request-Description', description);
  }
  if (connectionName) {
    headers.append('X-DuckDB-UI-Connection-Name', connectionName);
  }
  if (databaseName) {
    // base64 encode the value because it can contain characters invalid in an HTTP header
    headers.append('X-DuckDB-UI-Database-Name', toBase64(databaseName));
  }
  if (parameters) {
    headers.append('X-DuckDB-UI-Parameter-Count', String(parameters.length));
    for (let i = 0; i < parameters.length; i++) {
      // base64 encode the value because it can contain characters invalid in an HTTP header
      // TODO: support non-string parameters?
      headers.append(
        `X-DuckDB-UI-Parameter-Value-${i}`,
        toBase64(String(parameters[i])),
      );
    }
  }
  return headers;
}
