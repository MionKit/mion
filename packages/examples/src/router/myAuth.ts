/** Stand-in for your own auth module, so the router examples compile as written. */

export interface AuthUser {
  id: number;
  name: string;
  roles: string[];
}

/** Resolves the user behind a token (and optionally a user id header) */
export async function getAuthUser(
  token?: string,
  userId?: string
): Promise<AuthUser | undefined> {
  if (!token) return undefined;
  return {id: Number(userId ?? 1), name: 'John', roles: ['user']};
}

/** True when the resolved user may proceed */
export function isAuthorized(user: AuthUser | undefined): boolean {
  return !!user && user.roles.length > 0;
}
