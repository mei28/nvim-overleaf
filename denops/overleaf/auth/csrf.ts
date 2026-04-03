// Extract CSRF token and metadata from Overleaf's HTML page.
// Overleaf embeds data in <meta> tags with "ol-" prefixed names.

export interface PageMeta {
  csrfToken: string;
  userId?: string;
}

/** Extract CSRF token from Overleaf HTML response. */
export function extractCsrfToken(html: string): string {
  const match = html.match(/<meta\s+name="ol-csrfToken"\s+content="([^"]+)"/);
  if (!match) {
    throw new Error('CSRF token not found in page. Is the cookie valid?');
  }
  return match[1];
}

/** Extract user ID from Overleaf HTML response. */
export function extractUserId(html: string): string | undefined {
  const match = html.match(/<meta\s+name="ol-user_id"\s+content="([^"]+)"/);
  return match?.[1];
}

/** Extract all relevant meta tags. */
export function extractPageMeta(html: string): PageMeta {
  return {
    csrfToken: extractCsrfToken(html),
    userId: extractUserId(html),
  };
}
