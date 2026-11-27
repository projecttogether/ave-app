import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMULA_REVISION } from '@/lib/indicators/revision';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ publicDb: { execute } }));

import { GET } from '@/app/api/health/route';

describe('deployed release readiness', () => {
  beforeEach(() => {
    execute.mockResolvedValue({ rows: [{ revision: FORMULA_REVISION }] });
    vi.stubEnv('SOURCE_COMMIT', 'a'.repeat(40));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('identifies the commit without publishing its SHA or changing the public body', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('X-Deployment-Id')).toBe(createHash('sha256').update('a'.repeat(40)).digest('hex'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.stringify([...response.headers])).not.toContain('a'.repeat(40));
  });

  it('does not claim a healthy deployment when the formula revision is wrong', async () => {
    execute.mockResolvedValue({ rows: [{ revision: 'old' }] });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.has('X-Deployment-Id')).toBe(false);
  });

  it('omits deployment identity when the runtime commit is unavailable', async () => {
    vi.stubEnv('SOURCE_COMMIT', '');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.has('X-Deployment-Id')).toBe(false);
  });
});
