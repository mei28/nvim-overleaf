// Hash-based write echo prevention.
// When we write a file to disk, the file watcher fires.
// The guard stores hashes of our own writes to skip re-processing.

export class EchoGuard {
  /** path -> hash of content we just wrote */
  private writes = new Map<string, string>();

  /** Register a write we initiated (call before writing). */
  register(path: string, content: string): void {
    this.writes.set(path, fastHash(content));
  }

  /** Check if a file change was our own write. Consumes the entry. */
  isOwnWrite(path: string, content: string): boolean {
    const expected = this.writes.get(path);
    if (expected === undefined) return false;
    this.writes.delete(path);
    return expected === fastHash(content);
  }
}

/** Simple FNV-1a hash for fast comparison (not cryptographic). */
function fastHash(s: string): string {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}
