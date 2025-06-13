import { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';

export async function mockRequests(
  handlers: RequestHandler[],
  func: () => Promise<void>,
) {
  const server = setupServer(...handlers);
  try {
    server.listen();
    await func();
  } finally {
    server.close();
  }
}
