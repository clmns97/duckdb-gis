export async function sendDuckDBUIHttpRequest(
  url: string,
  body: string,
  headers?: Headers,
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });
  const buffer = await response.arrayBuffer();
  return buffer;
}
