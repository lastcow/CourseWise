import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { mobileDevices, notificationPreferences } from '../db/schema';
import type { AppBindings } from '../types';

export type PushCategory =
  | 'announcements'
  | 'messages'
  | 'assignments'
  | 'quizzes'
  | 'grades'
  | 'attendance'
  | 'riskAlerts';

export interface PushJob {
  userIds: string[];
  category: PushCategory;
  title: string;
  body: string;
  url?: string;
  sensitive?: boolean;
}

type DeviceRow = typeof mobileDevices.$inferSelect;
type PreferencesRow = typeof notificationPreferences.$inferSelect;

let cachedProviderToken: { value: string; expiresAt: number; cacheKey: string } | undefined;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function encodedJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function providerToken(env: AppBindings): Promise<string> {
  if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) {
    throw new Error('APNs credentials are not configured');
  }
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = `${env.APNS_TEAM_ID}:${env.APNS_KEY_ID}`;
  if (cachedProviderToken?.cacheKey === cacheKey && cachedProviderToken.expiresAt > now) {
    return cachedProviderToken.value;
  }
  const header = encodedJson({ alg: 'ES256', kid: env.APNS_KEY_ID });
  const payload = encodedJson({ iss: env.APNS_TEAM_ID, iat: now });
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBytes(env.APNS_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsigned),
  );
  const value = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  cachedProviderToken = { value, expiresAt: now + 50 * 60, cacheKey };
  return value;
}

function preferenceEnabled(preferences: PreferencesRow | null, category: PushCategory): boolean {
  return preferences?.[category] ?? true;
}

function localTime(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function isQuietHours(preferences: PreferencesRow | null): boolean {
  if (!preferences?.quietHoursStart || !preferences.quietHoursEnd) return false;
  try {
    const current = localTime(preferences.timezone);
    const { quietHoursStart: start, quietHoursEnd: end } = preferences;
    return start < end ? current >= start && current < end : current >= start || current < end;
  } catch {
    return false;
  }
}

function safePreview(device: DeviceRow, preferences: PreferencesRow | null, job: PushJob) {
  if (!job.sensitive || preferences?.sensitivePreviews) {
    return { title: job.title, body: job.body };
  }
  return device.locale === 'zh-CN'
    ? { title: 'CourseWise 有新动态', body: '打开 CourseWise 查看详情。' }
    : { title: 'New CourseWise update', body: 'Open CourseWise to view the details.' };
}

async function sendToDevice(
  db: Db,
  env: AppBindings,
  device: DeviceRow,
  preferences: PreferencesRow | null,
  job: PushJob,
): Promise<void> {
  if (!env.APNS_TOPIC) throw new Error('APNS_TOPIC is not configured');
  const token = await providerToken(env);
  const preview = safePreview(device, preferences, job);
  const host =
    device.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const response = await fetch(`https://${host}/3/device/${device.apnsToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'apns-topic': env.APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      ...(job.url ? { 'apns-collapse-id': `${job.category}:${job.url}`.slice(0, 64) } : {}),
    },
    body: JSON.stringify({
      aps: {
        alert: preview,
        sound: 'default',
        'thread-id': job.category,
      },
      category: job.category,
      url: job.url,
    }),
  });
  if (response.ok) return;
  const failure = (await response.json().catch(() => ({}))) as { reason?: string };
  if (response.status === 410 || failure.reason === 'BadDeviceToken') {
    await db
      .delete(mobileDevices)
      .where(and(eq(mobileDevices.id, device.id), eq(mobileDevices.apnsToken, device.apnsToken)));
    return;
  }
  throw new Error(`APNs ${response.status}: ${failure.reason ?? 'unknown error'}`);
}

export async function deliverPushJob(db: Db, env: AppBindings, job: PushJob): Promise<void> {
  const userIds = [...new Set(job.userIds)].slice(0, 500);
  if (userIds.length === 0) return;
  const rows = await db
    .select({ device: mobileDevices, preferences: notificationPreferences })
    .from(mobileDevices)
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, mobileDevices.userId))
    .where(inArray(mobileDevices.userId, userIds));

  const results = await Promise.allSettled(
    rows
      .filter(
        ({ preferences }) =>
          preferenceEnabled(preferences, job.category) && !isQuietHours(preferences),
      )
      .map(({ device, preferences }) => sendToDevice(db, env, device, preferences, job)),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) throw new Error(`${failures.length} APNs deliveries failed`);
}

export async function enqueuePush(env: AppBindings, job: PushJob): Promise<void> {
  if (!env.PUSH_QUEUE || job.userIds.length === 0) return;
  await env.PUSH_QUEUE.send(job, { contentType: 'json' });
}
