// UTF-8 byte offset <-> Unicode character offset conversion.
// Neovim reports byte offsets in on_bytes, but Overleaf OT uses character offsets.

/** Convert byte offset to character offset in a string. */
export function byteToChar(content: string, byteOffset: number): number {
  const bytes = new TextEncoder().encode(content);
  const prefix = bytes.slice(0, byteOffset);
  const decoded = new TextDecoder().decode(prefix);
  return Array.from(decoded).length;
}

/** Convert character offset to byte offset in a string. */
export function charToByte(content: string, charOffset: number): number {
  const chars = Array.from(content);
  const prefix = chars.slice(0, charOffset).join('');
  return new TextEncoder().encode(prefix).length;
}
