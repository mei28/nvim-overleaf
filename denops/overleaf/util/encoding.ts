// Latin-1 to UTF-8 decoding.
// Overleaf's real-time service sends document lines encoded in Latin-1.
// Multi-byte UTF-8 characters (e.g. Japanese) arrive as sequences of Latin-1 code points
// representing the raw UTF-8 bytes. We need to re-interpret them.
//
// Example: '日' (UTF-8: E6 97 A5) arrives as three Latin-1 chars: \u00E6 \u0097 \u00A5

/** Decode a Latin-1 encoded string back to UTF-8. */
export function decodeLatin1(s: string): string {
  // Each char's code point is a raw byte value. Collect them and decode as UTF-8.
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** Decode an array of Latin-1 encoded lines. */
export function decodeLines(lines: string[]): string[] {
  return lines.map(decodeLatin1);
}
