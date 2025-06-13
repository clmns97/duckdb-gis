import { sendDuckDBUIHttpRequest } from '../../http/functions/sendDuckDBUIHttpRequest.js';
import { tokenizeResultFromBuffer } from '../../serialization/functions/tokenizeResultFromBuffer.js';
import type { TokenizeResult } from '../../serialization/types/TokenizeResult.js';
import { DuckDBUIClientConnection } from './DuckDBUIClientConnection.js';

export { DuckDBUIClientConnection };
export type { TokenizeResult };

export class DuckDBUIClient {
  private readonly eventSource: EventSource;

  private defaultConnection: DuckDBUIClientConnection | undefined;

  private constructor() {
    this.eventSource = new EventSource('/localEvents');
  }

  public addOpenEventListener(listener: (event: Event) => void) {
    this.eventSource.addEventListener('open', listener);
  }

  public removeOpenEventListener(listener: (event: Event) => void) {
    this.eventSource.removeEventListener('open', listener);
  }

  public addErrorEventListener(listener: (event: Event) => void) {
    this.eventSource.addEventListener('error', listener);
  }

  public removeErrorEventListener(listener: (event: Event) => void) {
    this.eventSource.removeEventListener('error', listener);
  }

  public addMessageEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ) {
    this.eventSource.addEventListener(type, listener);
  }

  public removeMessageEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ) {
    this.eventSource.removeEventListener(type, listener);
  }

  public connect() {
    return new DuckDBUIClientConnection();
  }

  public get connection(): DuckDBUIClientConnection {
    if (!this.defaultConnection) {
      this.defaultConnection = this.connect();
    }
    return this.defaultConnection;
  }

  public async tokenize(text: string): Promise<TokenizeResult> {
    const buffer = await sendDuckDBUIHttpRequest('/ddb/tokenize', text);
    return tokenizeResultFromBuffer(buffer);
  }

  private static singletonInstance: DuckDBUIClient;

  public static get singleton(): DuckDBUIClient {
    if (!DuckDBUIClient.singletonInstance) {
      DuckDBUIClient.singletonInstance = new DuckDBUIClient();
    }
    return DuckDBUIClient.singletonInstance;
  }
}
