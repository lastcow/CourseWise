import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasClient } from './client';
import {
  assignmentRemoteFingerprint,
  cwMarker,
  extractCwMarker,
  fingerprintComparable,
  isPendingExternalId,
  moduleRemoteFingerprint,
  pendingAttemptedName,
  pendingExternalId,
} from './pushCourse';

const BASE_URL = 'https://school.instructure.com';
const LOCAL_ID = '4f9c1d2e-8a3b-4c5d-9e6f-0a1b2c3d4e5f';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('cwMarker / extractCwMarker', () => {
  it('round-trips a local id through a description', () => {
    const description = [cwMarker(LOCAL_ID), '<p>Body</p>'].join('\n');
    expect(extractCwMarker(description)).toBe(LOCAL_ID);
  });

  it('survives Canvas-style attribute reordering around the marker span', () => {
    const rewritten = `<span style="display:none" data-coursewise-id="${LOCAL_ID}" class="x"></span>`;
    expect(extractCwMarker(rewritten)).toBe(LOCAL_ID);
  });

  it('returns null for missing/malformed markers', () => {
    expect(extractCwMarker(null)).toBeNull();
    expect(extractCwMarker(undefined)).toBeNull();
    expect(extractCwMarker('<p>no marker</p>')).toBeNull();
    expect(extractCwMarker('data-coursewise-id="not-a-uuid"')).toBeNull();
  });
});

describe('pending-intent module rows', () => {
  it('mints recognizable pending ids that carry the attempted name', () => {
    const pending = pendingExternalId('Week 1');
    expect(isPendingExternalId(pending)).toBe(true);
    expect(pendingAttemptedName(pending)).toBe('Week 1');
    expect(isPendingExternalId('12345')).toBe(false);
    expect(isPendingExternalId('104~12345')).toBe(false);
  });
});

describe('remote fingerprints', () => {
  it('carries a scheme prefix so future scheme changes read as incomparable, not as edits', async () => {
    const fp = await moduleRemoteFingerprint({ id: 1, name: 'Week 1' });
    expect(fp.startsWith('v1:')).toBe(true);
    expect(fingerprintComparable(fp)).toBe(true);
    expect(fingerprintComparable(null)).toBe(false);
    expect(fingerprintComparable('deadbeef')).toBe(false); // legacy unversioned
    expect(fingerprintComparable('v2:deadbeef')).toBe(false);
  });

  it('assignment fingerprint ignores description (Canvas rewrites HTML) but tracks stable fields', async () => {
    const base = {
      id: 1,
      name: 'HW 1',
      due_at: '2026-09-01T00:00:00Z',
      unlock_at: null,
      lock_at: null,
      points_possible: 10,
      published: true,
    };
    const a = await assignmentRemoteFingerprint({ ...base, description: '<p>v1</p>' });
    const b = await assignmentRemoteFingerprint({ ...base, description: '<p data-api-endpoint="x">v1 rewritten</p>' });
    expect(a).toBe(b);
    const c = await assignmentRemoteFingerprint({ ...base, due_at: '2026-09-02T00:00:00Z' });
    expect(c).not.toBe(a);
  });

  it('module fingerprint excludes position (Canvas cascades renumbering) and coerces published', async () => {
    const a = await moduleRemoteFingerprint({ id: 1, name: 'Week 1', position: 1, published: false });
    // Same module after an unrelated sibling insert shifted its position.
    const shifted = await moduleRemoteFingerprint({ id: 1, name: 'Week 1', position: 2, published: false });
    expect(shifted).toBe(a);
    // published omitted in a create response vs false in a later GET → equal.
    const omitted = await moduleRemoteFingerprint({ id: 1, name: 'Week 1', position: 1 });
    expect(omitted).toBe(a);
    const renamed = await moduleRemoteFingerprint({ id: 1, name: 'Week 2', position: 1, published: false });
    expect(renamed).not.toBe(a);
  });
});

describe('CanvasClient push-hardening endpoints', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listModuleItems paginates a module item list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, [{ id: 5, module_id: 77, position: 1, type: 'Assignment', content_id: 123 }]),
    );
    const client = new CanvasClient(BASE_URL, 'tok');
    const items = await client.listModuleItems('9', '77');
    expect(items[0]?.content_id).toBe(123);
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/api/v1/courses/9/modules/77/items');
    expect(url).toContain('per_page=100');
  });

  it('updateModuleItem PUTs against the item current module and moves via string module_id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 5, module_id: 78, position: 2 }));
    const client = new CanvasClient(BASE_URL, 'tok');
    // Cross-shard module id survives as a string end to end.
    await client.updateModuleItem('9', '77', '5', { position: 2, module_id: '104~78' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE_URL}/api/v1/courses/9/modules/77/items/5`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      module_item: { position: 2, module_id: '104~78' },
    });
  });
});
