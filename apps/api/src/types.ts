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
  // R2 / S3-compatible storage. The bucket can also be bound directly as
  // `COURSE_FILES` (used for HEAD checks and deletes); presigning needs the
  // S3 credentials below.
  COURSE_FILES?: R2Bucket;
  R2_BUCKET?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_PUBLIC_ENDPOINT?: string;
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
