import { http, HttpResponse } from 'msw';
import { expect, suite, test } from 'vitest';
import { sendDuckDBUIHttpRequest } from '../../../src/http/functions/sendDuckDBUIHttpRequest';
import { makeBuffer } from '../../helpers/makeBuffer';
import { mockRequests } from '../../helpers/mockRequests';

suite('sendDuckDBUIHttpRequest', () => {
  test('basic', async () => {
    return mockRequests(
      [
        http.post('http://localhost/example/path', () => {
          return HttpResponse.arrayBuffer(makeBuffer([17, 42]));
        }),
      ],
      async () => {
        await expect(
          sendDuckDBUIHttpRequest(
            'http://localhost/example/path',
            'example body',
          ),
        ).resolves.toEqual(makeBuffer([17, 42]));
      },
    );
  });
  test('headers', async () => {
    return mockRequests(
      [
        http.post('http://localhost/example/path', ({ request }) => {
          if (
            request.headers.get('X-Example-Header-1') !==
              'example-header-1-value' ||
            request.headers.get('X-Example-Header-2') !==
              'example-header-2-value'
          ) {
            return HttpResponse.error();
          }
          return HttpResponse.arrayBuffer(makeBuffer([17, 42]));
        }),
      ],
      async () => {
        const headers = new Headers();
        headers.append('X-Example-Header-1', 'example-header-1-value');
        headers.append('X-Example-Header-2', 'example-header-2-value');
        await expect(
          sendDuckDBUIHttpRequest(
            'http://localhost/example/path',
            'example body',
            headers,
          ),
        ).resolves.toEqual(makeBuffer([17, 42]));
      },
    );
  });
});
