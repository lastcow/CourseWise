import type { Db } from './db/client';
import type { AuthContext } from './middleware/types';

export interface AppBindings {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  CORS_ORIGIN: string;
  BCRYPT_ROUNDS?: string;
  GIT_SHA?: string;
  BUILT_AT?: string;
  RATE_LIMIT_KV?: KVNamespace;
}

export interface AppVariables {
  db: Db;
  auth: AuthContext;
  validated: unknown;
}

export interface AppEnv {
  Bindings: AppBindings;
  Variables: AppVariables;
}
