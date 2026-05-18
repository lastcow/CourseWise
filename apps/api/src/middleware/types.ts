import type { UserRole, UserStatus, Locale } from '@coursewise/shared';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  preferredLanguage: Locale;
}

export type AuthMethod = 'jwt' | 'api_token';

export interface AuthContext {
  user: AuthenticatedUser;
  method: AuthMethod;
  /**
   * Scopes granted to this caller. Static scopes match the `ApiTokenScope`
   * literal union; dynamic `course:<courseId>` scopes are also allowed so
   * tokens can be narrowed to a single course at mint time.
   */
  scopes: string[];
  tokenId?: string;
}
