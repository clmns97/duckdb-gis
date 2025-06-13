import 'core-js/actual/promise/with-resolvers.js';
import { randomString } from '../../util/functions/randomString.js';
import { sendDuckDBUIHttpRequest } from '../functions/sendDuckDBUIHttpRequest.js';

export interface DuckDBUIHttpRequestQueueResult {
  buffer: ArrayBuffer;
  startTimeMs: number;
  endTimeMs: number;
}

export interface DuckDBUIHttpRequestQueueEntry {
  id: string;
  url: string;
  body: string;
  headers?: Headers;
  deferredResult: PromiseWithResolvers<DuckDBUIHttpRequestQueueResult>;
  canceled?: boolean;
}

export class DuckDBUIHttpRequestQueue {
  /**
   * Invariants: The first entry in the queue has been sent and we're waiting for its response. If the first entry is
   * canceled, it remains in the queue until its response is received. If an entry other than the first is canceled, it
   * remains in the queue until it comes to the front, at which point it is removed without being sent.
   */
  private entries: DuckDBUIHttpRequestQueueEntry[] = [];

  public get length() {
    return this.entries.length;
  }

  public enqueueAndWait(
    url: string,
    body: string,
    headers?: Headers,
  ): Promise<DuckDBUIHttpRequestQueueResult> {
    return this.internalEnqueue(url, body, headers).deferredResult.promise;
  }

  public enqueue(url: string, body: string, headers?: Headers): string {
    return this.internalEnqueue(url, body, headers).id;
  }

  public enqueuedResult(id: string): Promise<DuckDBUIHttpRequestQueueResult> {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index < 0) {
      throw new Error(`Invalid id: ${id}`);
    }
    return this.entries[index].deferredResult.promise;
  }

  public cancel(id: string, errorMessage?: string) {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      // Mark the entry as canceled and reject its promise. If it was already sent, then we'll remove it from the queue
      // when we get its response. If not, then we'll remove it when the (non-canceled) request before it completes. The
      // caller may or may not arrange for the response to return early with an error, for example, by interrupting it;
      // whether that happens doesn't change how the queue operates.
      this.entries[index].canceled = true;
      this.entries[index].deferredResult.reject(
        new Error(errorMessage ?? 'query was canceled'),
      );
    } else {
      console.warn(`Couldn't cancel; no entry found for id: ${id}`);
    }
  }

  /**
   * Returns true if the given entry id is the front of the queue.
   * Note that it may be canceled.
   */
  public isCurrent(id: string): boolean {
    return this.entries.length > 0 && this.entries[0].id === id;
  }

  private internalEnqueue(
    url: string,
    body: string,
    headers?: Headers,
  ): DuckDBUIHttpRequestQueueEntry {
    const id = randomString();
    const deferredResult =
      Promise.withResolvers<DuckDBUIHttpRequestQueueResult>();
    const entry: DuckDBUIHttpRequestQueueEntry = {
      id,
      url,
      body,
      headers,
      deferredResult,
    };
    this.entries.push(entry);
    // If the new entry is the first in our queue, then send it.
    if (this.entries.length === 1) {
      this.sendRequest(this.entries[0]);
    }
    return entry;
  }

  private handleResponse(
    entryId: string,
    startTimeMs: number,
    buffer: ArrayBuffer | undefined,
    reason?: unknown,
  ) {
    if (this.entries.length === 0) {
      console.warn(
        `DuckDBUIHttpRequestQueue.handleResponse(entryId=${entryId}): queue unexpectedly empty`,
      );
      return;
    }
    if (this.entries[0].id !== entryId) {
      console.warn(
        `DuckDBUIHttpRequestQueue.handleResponse(entryId=${entryId}): front of queue doesn't match response`,
      );
      return;
    }
    // Remove the entry corresponding to this response.
    const entry = this.entries.shift();
    // There should always be an entry because of the length check above, but we need to appease the compiler.
    // If the entry was canceled, we've already rejected the promise, so there's nothing more to do.
    if (entry && !entry.canceled) {
      if (buffer) {
        const endTimeMs = performance.now();
        // If the entry has a valid buffer, then resolve its promise to it.
        entry.deferredResult.resolve({ buffer, startTimeMs, endTimeMs });
      } else {
        // Otherwise, reject it with the provided reason.
        entry.deferredResult.reject(reason);
      }
    }
    // Send the next request (if there are any).
    this.sendNextInQueue();
  }

  /** If there are any entries in our queue that aren't canceled, send the first one. */
  private sendNextInQueue() {
    // Remove any unsent canceled entries from the front of the queue.
    while (this.entries.length > 0 && this.entries[0].canceled) {
      this.entries.shift();
    }
    // If there's an uncanceled entry left, send it.
    if (this.entries.length > 0) {
      this.sendRequest(this.entries[0]);
    }
  }

  private sendRequest(entry: DuckDBUIHttpRequestQueueEntry) {
    const startTimeMs = performance.now();
    sendDuckDBUIHttpRequest(entry.url, entry.body, entry.headers)
      .then((buffer) => this.handleResponse(entry.id, startTimeMs, buffer))
      .catch((reason) =>
        this.handleResponse(entry.id, startTimeMs, undefined, reason),
      );
  }
}
