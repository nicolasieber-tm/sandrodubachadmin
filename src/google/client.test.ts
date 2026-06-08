import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleCalendarClient, type GoogleConnection } from './client';
import * as tokens from './tokens';
import type { CalendarConnection } from '@/db/schema';

// saveGoogleConnection nicht gegen die echte DB laufen lassen (Refresh-Pfad).
vi.mock('./tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tokens')>();
  return { ...actual, saveGoogleConnection: vi.fn(async () => ({}) as CalendarConnection) };
});

// Env fuer den Refresh-Pfad (client_id/secret kommen aus googleOAuthConfig()).
beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

// status steuert res.ok automatisch (Response: ok = status im 200er-Bereich).
function mockFetchJson(json: unknown, status = 200) {
  const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(json), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function baseRow(overrides: Partial<CalendarConnection> = {}): CalendarConnection {
  return {
    id: 'conn-1',
    provider: 'google',
    accountLabel: 'sandro@example.ch',
    status: 'verbunden',
    subCalendars: [],
    googleCalendarId: 'sandro@example.ch',
    accessTokenEnc: 'enc-access',
    refreshTokenEnc: 'enc-refresh',
    tokenExpiry: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    ...overrides,
  };
}

function conn(overrides: Partial<GoogleConnection> = {}): GoogleConnection {
  return {
    row: baseRow(overrides.row),
    accessToken: 'access-123',
    refreshToken: 'refresh-456',
    ...overrides,
  };
}

const CAL = 'primary@example.ch';
const CAL_ENC = encodeURIComponent(CAL);

describe('GoogleCalendarClient.getValidAccessToken', () => {
  it('gibt den vorhandenen Token zurueck, wenn er noch gueltig ist (kein fetch)', async () => {
    const fetchMock = mockFetchJson({});
    const client = new GoogleCalendarClient();
    const token = await client.getValidAccessToken(conn());
    expect(token).toBe('access-123');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('erneuert den Token via Refresh, wenn abgelaufen', async () => {
    const fetchMock = mockFetchJson({ access_token: 'neu-999', expires_in: 3600 });
    const client = new GoogleCalendarClient();
    const expired = conn({ row: baseRow({ tokenExpiry: new Date(Date.now() - 1000) }) });

    const token = await client.getValidAccessToken(expired);
    expect(token).toBe('neu-999');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init?.method).toBe('POST');
    const body = String(init?.body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=refresh-456');
    expect(body).toContain('client_id=test-client-id');
    expect(body).toContain('client_secret=test-client-secret');

    // Neuer Token wird persistiert.
    expect(tokens.saveGoogleConnection).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(tokens.saveGoogleConnection).mock.calls[0][0];
    expect(saved.accessToken).toBe('neu-999');
    expect(saved.refreshToken).toBe('refresh-456');
  });

  it('wirft, wenn der Refresh fehlschlaegt', async () => {
    mockFetchJson({ error: 'invalid_grant' }, 400);
    const client = new GoogleCalendarClient();
    const expired = conn({ row: baseRow({ tokenExpiry: new Date(Date.now() - 1000) }) });
    await expect(client.getValidAccessToken(expired)).rejects.toThrow();
  });
});

describe('GoogleCalendarClient.listEvents', () => {
  it('ruft die korrekte URL mit Bearer-Header und GET auf', async () => {
    const fetchMock = mockFetchJson({ items: [{ id: 'e1' }] });
    const client = new GoogleCalendarClient();

    const result = await client.listEvents(
      'tok-abc',
      CAL,
      '2026-06-01T00:00:00Z',
      '2026-06-08T00:00:00Z',
    );
    expect(result.items?.[0].id).toBe('e1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const u = String(url);
    expect(u).toContain(`https://www.googleapis.com/calendar/v3/calendars/${CAL_ENC}/events`);
    expect(u).toContain('timeMin=2026-06-01T00%3A00%3A00Z');
    expect(u).toContain('timeMax=2026-06-08T00%3A00%3A00Z');
    expect(u).toContain('singleEvents=true');
    expect(init?.method).toBe('GET');
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer tok-abc');
  });
});

describe('GoogleCalendarClient.insertEvent', () => {
  it('POSTet das Event-JSON an den korrekten Endpunkt', async () => {
    const fetchMock = mockFetchJson({ id: 'created-1' });
    const client = new GoogleCalendarClient();
    const event = { summary: 'Termin', start: { dateTime: '2026-06-10T10:00:00Z' } };

    const created = await client.insertEvent('tok-xyz', CAL, event);
    expect(created.id).toBe('created-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${CAL_ENC}/events`,
    );
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer tok-xyz');
    expect(JSON.parse(String(init?.body))).toEqual(event);
  });
});

describe('GoogleCalendarClient.updateEvent', () => {
  it('PUTet das Event an den Endpunkt mit Event-ID', async () => {
    const fetchMock = mockFetchJson({ id: 'evt-7' });
    const client = new GoogleCalendarClient();
    const event = { summary: 'Geaendert' };

    await client.updateEvent('tok-7', CAL, 'evt-7', event);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${CAL_ENC}/events/evt-7`,
    );
    expect(init?.method).toBe('PUT');
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer tok-7');
    expect(JSON.parse(String(init?.body))).toEqual(event);
  });
});

describe('GoogleCalendarClient.deleteEvent', () => {
  it('sendet DELETE an den Endpunkt mit Event-ID', async () => {
    const fetchMock = mockFetchJson({});
    const client = new GoogleCalendarClient();

    await client.deleteEvent('tok-d', CAL, 'evt-del');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${CAL_ENC}/events/evt-del`,
    );
    expect(init?.method).toBe('DELETE');
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer tok-d');
  });

  it('wirft bei API-Fehler', async () => {
    mockFetchJson({ error: 'not found' }, 404);
    const client = new GoogleCalendarClient();
    await expect(client.deleteEvent('tok', CAL, 'x')).rejects.toThrow();
  });
});
