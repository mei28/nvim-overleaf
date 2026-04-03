// SHA1 hash in git blob format, matching Overleaf's integrity verification.
// Format: sha1("blob " + byte_length + "\0" + content)

const encoder = new TextEncoder();

/** Compute SHA1 hash in git blob format for OT content verification. */
export async function computeHash(content: string): Promise<string> {
  const contentBytes = encoder.encode(content);
  const header = encoder.encode(`blob ${contentBytes.length}\0`);
  const combined = new Uint8Array(header.length + contentBytes.length);
  combined.set(header, 0);
  combined.set(contentBytes, header.length);

  const hashBuffer = await crypto.subtle.digest('SHA-1', combined);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map((b) => b.toString(16).padStart(2, '0')).join('');
}
