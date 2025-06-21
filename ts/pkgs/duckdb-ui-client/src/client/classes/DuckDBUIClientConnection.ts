import { DuckDBUIHttpRequestQueue } from '../../http/classes/DuckDBUIHttpRequestQueue.js';
import {
  DuckDBUIHttpRequestHeaderOptions,
  makeDuckDBUIHttpRequestHeaders,
} from '../../http/functions/makeDuckDBUIHttpRequestHeaders.js';
import { sendDuckDBUIHttpRequest } from '../../http/functions/sendDuckDBUIHttpRequest.js';
import { randomString } from '../../util/functions/randomString.js';
import { materializedRunResultFromQueueResult } from '../functions/materializedRunResultFromQueueResult.js';
import { MaterializedRunResult } from '../types/MaterializedRunResult.js';

export class DuckDBUIClientConnection {
  private readonly connectionName = `connection_${randomString()}`;

  private readonly requestQueue: DuckDBUIHttpRequestQueue =
    new DuckDBUIHttpRequestQueue();

  public async run(
    sql: string,
    args?: unknown[],
  ): Promise<MaterializedRunResult> {
    const queueResult = await this.requestQueue.enqueueAndWait(
      '/ddb/run',
      sql,
      this.makeHeaders({ parameters: args }),
    );
    return materializedRunResultFromQueueResult(queueResult);
  }

  public enqueue(sql: string, args?: unknown[]): string {
    return this.requestQueue.enqueue(
      '/ddb/run',
      sql,
      this.makeHeaders({ parameters: args }),
    );
  }

  public cancel(
    id: string,
    errorMessage?: string,
    failure?: (reason: unknown) => void,
  ) {
    // Handle the rejected promise (with a no-op) in case nothing else is, to avoid a console error.
    this.requestQueue.enqueuedResult(id).catch(() => {});
    this.requestQueue.cancel(id, errorMessage);
    // If currently running, then interrupt it.
    if (this.requestQueue.isCurrent(id)) {
      // Don't await (but report any unexpected errors). Canceling should return synchronously.
      sendDuckDBUIHttpRequest('/ddb/interrupt', '', this.makeHeaders()).catch(
        failure,
      );
    }
    return true;
  }

  public async runQueued(id: string): Promise<MaterializedRunResult> {
    const queueResult = await this.requestQueue.enqueuedResult(id);
    return materializedRunResultFromQueueResult(queueResult);
  }

  public get queuedCount(): number {
    return this.requestQueue.length;
  }

  private makeHeaders(
    options: Omit<DuckDBUIHttpRequestHeaderOptions, 'connectionName'> = {},
  ): Headers {
    return makeDuckDBUIHttpRequestHeaders({
      ...options,
      connectionName: this.connectionName,
    });
  }
}
