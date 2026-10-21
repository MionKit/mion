/** Stand-in for your own session store, so the examples compile as written. */

export type SessionInfo = {
  userId: string;
  role: 'admin' | 'user';
  expiresAt: Date;
};

/** Finds the session behind the HttpOnly `session` cookie the browser sent */
export function getSession(
  cookieHeader: string | null | undefined
): SessionInfo | undefined {
  const sessionId = cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  if (!sessionId) return undefined;
  return {
    userId: 'USER-123',
    role: 'admin',
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}
