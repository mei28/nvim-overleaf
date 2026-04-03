// Overleaf authentication orchestrator.
// Handles: cookie validation, CSRF token extraction, GCLB cookie acquisition.

import { CookieStore } from './cookie_store.ts';
import { extractPageMeta, type PageMeta } from './csrf.ts';
import { logger } from '../util/logger.ts';

const OVERLEAF_URL = 'https://www.overleaf.com';

/** Authenticated identity for making Overleaf API calls. */
export interface Identity {
  cookieStore: CookieStore;
  csrfToken: string;
  userId?: string;
  serverUrl: string;
}

export interface AuthOptions {
  /** The overleaf_session2 cookie value (or full cookie string). */
  cookie: string;
  /** Server URL. Defaults to https://www.overleaf.com */
  serverUrl?: string;
}

/** Normalize cookie input: accept bare value, key=value, or full cookie string. */
function normalizeCookie(raw: string): string {
  const trimmed = raw.trim();
  // User passed just the value (starts with s%3A or s:)
  if (trimmed.startsWith('s%3A') || trimmed.startsWith('s:')) {
    return `overleaf_session2=${trimmed}`;
  }
  // User passed key=value without the cookie name
  if (!trimmed.includes('=')) {
    return `overleaf_session2=${trimmed}`;
  }
  return trimmed;
}

/** Authenticate with Overleaf using a session cookie. */
export async function authenticate(opts: AuthOptions): Promise<Identity> {
  const serverUrl = opts.serverUrl ?? OVERLEAF_URL;
  const cookie = normalizeCookie(opts.cookie);
  logger.debug('Cookie: %s...', cookie.substring(0, 40));
  const cookieStore = new CookieStore(cookie);

  // Step 1: Validate cookie by fetching the project listing page
  logger.info('Authenticating with %s', serverUrl);
  const projectResp = await fetch(`${serverUrl}/project`, {
    headers: { Cookie: cookieStore.toString() },
    redirect: 'manual',
  });

  // If redirected, the cookie is invalid/expired
  if (projectResp.status >= 300 && projectResp.status < 400) {
    await projectResp.body?.cancel();
    throw new Error('Session cookie is invalid or expired (got redirect to login)');
  }

  if (!projectResp.ok) {
    const body = await projectResp.text();
    throw new Error(`Authentication failed (${projectResp.status}): ${body.substring(0, 200)}`);
  }

  // Merge any Set-Cookie headers (session refresh)
  cookieStore.mergeFromResponse(projectResp);

  // Step 2: Extract CSRF token from HTML
  const html = await projectResp.text();
  let meta: PageMeta;
  try {
    meta = extractPageMeta(html);
  } catch {
    throw new Error('Failed to extract page metadata. The page format may have changed.');
  }

  logger.info('Authenticated as user %s', meta.userId ?? 'unknown');

  // Step 3: Acquire GCLB cookie (Google Cloud Load Balancer sticky session)
  // This is needed for www.overleaf.com to maintain WebSocket affinity
  if (serverUrl === OVERLEAF_URL || serverUrl.includes('overleaf.com')) {
    await acquireGclbCookie(serverUrl, cookieStore);
  }

  return {
    cookieStore,
    csrfToken: meta.csrfToken,
    userId: meta.userId,
    serverUrl,
  };
}

/** Fetch the Socket.IO JS to get the GCLB load balancer cookie. */
async function acquireGclbCookie(serverUrl: string, cookieStore: CookieStore): Promise<void> {
  try {
    const resp = await fetch(`${serverUrl}/socket.io/socket.io.js`, {
      headers: { Cookie: cookieStore.toString() },
    });
    cookieStore.mergeFromResponse(resp);
    await resp.body?.cancel();

    if (cookieStore.has('GCLB')) {
      logger.debug('Acquired GCLB cookie');
    } else {
      logger.debug('No GCLB cookie returned (may not be needed for this server)');
    }
  } catch (err) {
    logger.warn('Failed to acquire GCLB cookie: %s', err);
    // Non-fatal: some setups don't need GCLB
  }
}
