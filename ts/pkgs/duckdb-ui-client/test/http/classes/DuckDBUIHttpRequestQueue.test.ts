import { http, HttpResponse } from 'msw';
import { expect, suite, test } from 'vitest';
import { DuckDBUIHttpRequestQueue } from '../../../src/http/classes/DuckDBUIHttpRequestQueue';
import { makeBuffer } from '../../helpers/makeBuffer';
import { mockRequests } from '../../helpers/mockRequests';

suite('DuckDBUIHttpRequestQueue', () => {
  test('single request', () => {
    return mockRequests(
      [
        http.post('http://localhost/example/path', () => {
          return HttpResponse.arrayBuffer(makeBuffer([17, 42]));
        }),
      ],
      async () => {
        const queue = new DuckDBUIHttpRequestQueue();
        const id = queue.enqueue(
          'http://localhost/example/path',
          'example body',
        );
        expect(queue.length).toBe(1);
        expect(queue.isCurrent(id)).toBe(true);

        const result = await queue.enqueuedResult(id);
        expect(result.buffer).toEqual(makeBuffer([17, 42]));
      },
    );
  });
  test('multiple requests', () => {
    return mockRequests(
      [
        http.post('http://localhost/example/path', async ({ request }) => {
          const body = await request.text();
          const value = parseInt(body.split(' ')[0], 10);
          return HttpResponse.arrayBuffer(makeBuffer([value]));
        }),
      ],
      async () => {
        const queue = new DuckDBUIHttpRequestQueue();
        const id1 = queue.enqueue(
          'http://localhost/example/path',
          '11 example body',
        );
        const id2 = queue.enqueue(
          'http://localhost/example/path',
          '22 example body',
        );
        expect(queue.length).toBe(2);
        expect(queue.isCurrent(id1)).toBe(true);

        const result1 = await queue.enqueuedResult(id1);
        expect(result1.buffer).toEqual(makeBuffer([11]));

        expect(queue.length).toBe(1);
        expect(queue.isCurrent(id2)).toBe(true);

        const result2 = await queue.enqueuedResult(id2);
        expect(result2.buffer).toEqual(makeBuffer([22]));
      },
    );
  });
  test('cancel (first request)', () => {
    return mockRequests(
      [
        http.post('http://localhost/example/path', async ({ request }) => {
          const body = await request.text();
          const value = parseInt(body.split(' ')[0], 10);
          return HttpResponse.arrayBuffer(makeBuffer([value]));
        }),
      ],
      async () => {
        const queue = new DuckDBUIHttpRequestQueue();
        const id1 = queue.enqueue(
          'http://localhost/example/path',
          '11 example body',
        );
        const id2 = queue.enqueue(
          'http://localhost/example/path',
          '22 example body',
        );
        expect(queue.length).toBe(2);
        expect(queue.isCurrent(id1)).toBe(true);

        queue.cancel(id1);
        await expect(queue.enqueuedResult(id1)).rejects.toEqual(
          new Error('query was canceled'),
        );

        const result2 = await queue.enqueuedResult(id2);
        expect(result2.buffer).toEqual(makeBuffer([22]));
      },
    );
  });
  test('cancel (second request)', () => {
    return mockRequests(
      [
        http.post('http://localhost/example/path', async ({ request }) => {
          const body = await request.text();
          const value = parseInt(body.split(' ')[0], 10);
          return HttpResponse.arrayBuffer(makeBuffer([value]));
        }),
      ],
      async () => {
        const queue = new DuckDBUIHttpRequestQueue();
        const id1 = queue.enqueue(
          'http://localhost/example/path',
          '11 example body',
        );
        const id2 = queue.enqueue(
          'http://localhost/example/path',
          '22 example body',
        );
        const id3 = queue.enqueue(
          'http://localhost/example/path',
          '33 example body',
        );
        expect(queue.length).toBe(3);
        expect(queue.isCurrent(id1)).toBe(true);

        const promise2 = queue.enqueuedResult(id2);
        queue.cancel(id2, 'example error message');

        const result1 = await queue.enqueuedResult(id1);
        expect(result1.buffer).toEqual(makeBuffer([11]));

        expect(queue.length).toBe(1);
        expect(queue.isCurrent(id3)).toBe(true);

        await expect(promise2).rejects.toEqual(
          new Error('example error message'),
        );

        const result3 = await queue.enqueuedResult(id3);
        expect(result3.buffer).toEqual(makeBuffer([33]));
      },
    );
  });
});
