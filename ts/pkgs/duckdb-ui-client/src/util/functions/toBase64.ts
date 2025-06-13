const encoder = new TextEncoder();

export function toBase64(input: string): string {
  const encoded = encoder.encode(input);
  // For the reason behind this step, see https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa#unicode_strings
  const binaryString = Array.from(encoded, (codePoint) =>
    String.fromCodePoint(codePoint),
  ).join('');
  return btoa(binaryString);
}
