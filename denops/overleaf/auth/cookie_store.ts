// Cookie management for Overleaf authentication.
// Stores session cookies in memory and merges Set-Cookie headers.

export class CookieStore {
  private cookies = new Map<string, string>();

  constructor(initialCookie?: string) {
    if (initialCookie) {
      this.parseCookieString(initialCookie);
    }
  }

  /** Parse a Cookie header string ("key=value; key2=value2") into the store. */
  private parseCookieString(cookieStr: string): void {
    for (const part of cookieStr.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      const name = part.substring(0, eq).trim();
      const value = part.substring(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  /** Merge Set-Cookie headers from a fetch Response. */
  mergeFromResponse(response: Response): void {
    // response.headers.getSetCookie() returns all Set-Cookie values
    for (const setCookie of response.headers.getSetCookie()) {
      // Set-Cookie format: "name=value; Path=/; ..."
      // We only care about the name=value part
      const firstSemi = setCookie.indexOf(';');
      const nameValue = firstSemi !== -1 ? setCookie.substring(0, firstSemi) : setCookie;
      const eq = nameValue.indexOf('=');
      if (eq === -1) continue;
      const name = nameValue.substring(0, eq).trim();
      const value = nameValue.substring(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  /** Get the Cookie header string for requests. */
  toString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  /** Check if a specific cookie exists. */
  has(name: string): boolean {
    return this.cookies.has(name);
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}
