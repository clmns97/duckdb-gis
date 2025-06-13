export function randomString(
  length: number = 12,
  chars: string = '$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
): string {
  return Array.from({ length })
    .map((_) => chars[Math.floor(Math.random() * chars.length)])
    .join('');
}
