/** Stand-in for your own auth module, so the router examples compile as written. */

export interface AuthUser {
  id: number;
  name: string;
  roles: string[];
}

/** Resolves the user behind the HttpOnly `session` cookie the browser sent */
export async function getSessionUser(
  cookieHeader: string | null | undefined
): Promise<AuthUser | undefined> {
  const sessionId = cookieHeader?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
  if (!sessionId) return undefined;
  return {id: 1, name: 'John', roles: ['user']};
}
