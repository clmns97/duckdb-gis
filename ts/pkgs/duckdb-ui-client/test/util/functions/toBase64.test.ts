import { expect, suite, test } from 'vitest';
import { toBase64 } from '../../../src/util/functions/toBase64';

suite('toBase64', () => {
  test('basic', () => {
    expect(atob(toBase64('duck'))).toBe('duck');
  });
  test('unicode', () => {
    expect(atob(toBase64('🦆'))).toBe('\xF0\x9F\xA6\x86');
  });
});
