import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Booking, Offer, CalendarConnection } from '@/db/schema';
import type { GoogleConnection } from './tokens';

// Unit-Tests fuer die VERDRAHTENDEN Service-Funktionen aus sync.ts:
// pushBookingToGoogle, removeBookingFromGoogle, googleBusyIntervals.
//
// Strategie (gleicher Stil wie client.test.ts):
// - Die DB-/Token-/Audit-Schichten werden via vi.mock ersetzt – KEIN echter
//   DB- oder Crypto-Zugriff.
// - Der echte GoogleCalendarClient bleibt aktiv; nur globalThis.fetch wird
//   gemockt. Da die Fixture-Verbindung einen GUELTIGEN tokenExpiry hat, laeuft
//   getValidAccessToken ohne Refresh-fetch durch – die HTTP-Methoden (insert/
//   update/delete/list) treffen den fetch-Mock.
// - calendar-logic (resolveTargetCalendar, mergeBusyIntervals) bleibt echt (rein).

// --- Mocks der Seiteneffekt-Schichten ---------------------------------------
vi.mock('./tokens', () => ({
  getGoogleConnection: vi.fn(),
}));
vi.mock('@/bookings/repository', () => ({
  setBookingGoogleSync: vi.fn(async () => undefined),
  clearBookingGoogleSync: vi.fn(async () => undefined),
}));
vi.mock('@/offers/repository', () => ({
  getOffer: vi.fn(async () => undefined),
}));
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(async () => undefined),
}));

import { pushBookingToGoogle, removeBookingFromGoogle, googleBusyIntervals } from './sync';
import { getGoogleConnection } from './tokens';
import { setBookingGoogleSync, clearBookingGoogleSync } from '@/bookings/repository';
import { getOffer } from '@/offers/repository';
import { logAudit } from '@/lib/audit';

const getGoogleConnectionMock = vi.mocked(getGoogleConnection);
const setBookingGoogleSyncMock = vi.mocked(setBookingGoogleSync);
const clearBookingGoogleSyncMock = vi.mocked(clearBookingGoogleSync);
const getOfferMock = vi.mocked(getOffer);
const logAuditMock = vi.mocked(logAudit);

// --- Fixtures ---------------------------------------------------------------
function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    offerId: 'o-1',
    offerNameSnapshot: 'Fotoshooting',
    customerName: 'Lena Muster',
    customerEmail: 'lena@example.ch',
    customerPhone: '079 123 45 67',
    message: null,
    requestedDate: '2026-06-10',
    requestedTime: '10:00',
    location: null,
    priceRappen: 25000,
    status: 'bestaetigt',
    source: 'iframe',
    discountId: null,
    customFields: [],
    googleEventId: null,
    googleCalendarId: null,
    reminderSentAt: null,
    travelCostRappen: 0,
    extraMinutes: 0,
    adminNote: null,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    decidedAt: new Date('2026-06-02T08:00:00Z'),
    ...overrides,
  };
}

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'o-1',
    name: 'Fotoshooting',
    priceRappen: 25000,
    unit: 'pauschal',
    durationMinutes: 60,
    description: '',
    calendarKey: null,
    active: true,
    sortOrder: 0,
    customFields: [],
    standardFields: {},
    bookingMode: 'termin',
    travelRuleId: null,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    updatedAt: new Date('2026-06-01T08:00:00Z'),
    ...overrides,
  };
}

function connRow(overrides: Partial<CalendarConnection> = {}): CalendarConnection {
  return {
    id: 'conn-1',
    provider: 'google',
    accountLabel: 'sandro@example.ch',
    status: 'verbunden',
    subCalendars: [],
    busyCalendarIds: ['sandro@example.ch'],
    writeMode: 'main',
    googleCalendarId: 'sandro@example.ch',
    accessTokenEnc: 'enc-access',
    refreshTokenEnc: 'enc-refresh',
    // GUELTIG (weit in der Zukunft) -> kein Refresh-fetch in getValidAccessToken.
    tokenExpiry: new Date(Date.now() + 3_600_000),
    createdAt: new Date('2026-06-01T08:00:00Z'),
    ...overrides,
  };
}

function googleConnection(rowOverrides: Partial<CalendarConnection> = {}): GoogleConnection {
  return {
    row: connRow(rowOverrides),
    accessToken: 'access-123',
    refreshToken: 'refresh-456',
  };
}

// fetch-Mock im Stil von client.test.ts: liefert pro Aufruf eine JSON-Response.
// `bodies` ist eine Queue: jeder Aufruf konsumiert den naechsten Eintrag,
// faellt sonst auf {} zurueck.
function mockFetchSequence(bodies: unknown[] = [], status = 200) {
  let i = 0;
  const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => {
      const json = i < bodies.length ? bodies[i] : {};
      i += 1;
      return new Response(JSON.stringify(json), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Findet den fetch-Aufruf, dessen URL `needle` enthaelt und `method` matcht. */
function findCall(
  fetchMock: ReturnType<typeof mockFetchSequence>,
  method: string,
  needle: string,
) {
  return fetchMock.mock.calls.find(([url, init]) => {
    return String(url).includes(needle) && (init?.method ?? 'GET') === method;
  });
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  // Standard: jede einzelne fetch-Antwort ist {} (200) – Tests, die mehr
  // brauchen, ueberschreiben mit mockFetchSequence.
  mockFetchSequence();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

// ===========================================================================
// pushBookingToGoogle
// ===========================================================================
describe('pushBookingToGoogle', () => {
  it('legt ein neues Event an und persistiert googleEventId + Zielkalender', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    getOfferMock.mockResolvedValue(offer());
    const fetchMock = mockFetchSequence([{ id: 'evt-new' }]);

    await pushBookingToGoogle(booking());

    // Genau ein POST (insert) an den Hauptkalender.
    const insert = findCall(fetchMock, 'POST', '/calendars/sandro%40example.ch/events');
    expect(insert).toBeDefined();
    // Persistenz mit der zurueckgegebenen Event-ID und dem Zielkalender.
    expect(setBookingGoogleSyncMock).toHaveBeenCalledWith('b-1', 'evt-new', 'sandro@example.ch');
  });

  it('aktualisiert (PUT) ein bestehendes Event im gleichen Kalender ohne neu anzulegen', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    getOfferMock.mockResolvedValue(offer());
    const fetchMock = mockFetchSequence([{ id: 'evt-existing' }]);

    await pushBookingToGoogle(
      booking({ googleEventId: 'evt-existing', googleCalendarId: 'sandro@example.ch' }),
    );

    const put = findCall(
      fetchMock,
      'PUT',
      '/calendars/sandro%40example.ch/events/evt-existing',
    );
    expect(put).toBeDefined();
    // Kein POST (kein Neuanlegen).
    expect(findCall(fetchMock, 'POST', '/events')).toBeUndefined();
    expect(setBookingGoogleSyncMock).toHaveBeenCalledWith(
      'b-1',
      'evt-existing',
      'sandro@example.ch',
    );
  });

  it('loescht beim Verschieben das alte Event und legt es im neuen Kalender an', async () => {
    // writeMode 'per_offer' + Angebot mit eigenem calendarKey => Zielkalender wechselt.
    getGoogleConnectionMock.mockResolvedValue(googleConnection({ writeMode: 'per_offer' }));
    getOfferMock.mockResolvedValue(offer({ calendarKey: 'studio@group.calendar.google.com' }));
    // 1. DELETE altes Event, 2. POST neues Event.
    const fetchMock = mockFetchSequence([{}, { id: 'evt-moved' }]);

    await pushBookingToGoogle(
      booking({ googleEventId: 'evt-old', googleCalendarId: 'sandro@example.ch' }),
    );

    // Altes Event im ALTEN Kalender geloescht.
    const del = findCall(
      fetchMock,
      'DELETE',
      '/calendars/sandro%40example.ch/events/evt-old',
    );
    expect(del).toBeDefined();
    // Neues Event im NEUEN Zielkalender angelegt.
    const insert = findCall(
      fetchMock,
      'POST',
      '/calendars/studio%40group.calendar.google.com/events',
    );
    expect(insert).toBeDefined();
    // Persistenz auf den neuen Kalender.
    expect(setBookingGoogleSyncMock).toHaveBeenCalledWith(
      'b-1',
      'evt-moved',
      'studio@group.calendar.google.com',
    );
  });

  it('ist ein No-op fuer Anfragen ohne Datum (kein fetch, keine Persistenz)', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    const fetchMock = mockFetchSequence();

    await pushBookingToGoogle(booking({ requestedDate: null }));

    expect(getGoogleConnectionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setBookingGoogleSyncMock).not.toHaveBeenCalled();
  });

  it('ist ein No-op, wenn Google nicht konfiguriert ist', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const fetchMock = mockFetchSequence();

    await pushBookingToGoogle(booking());

    expect(getGoogleConnectionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ist ein No-op, wenn keine Verbindung existiert', async () => {
    getGoogleConnectionMock.mockResolvedValue(null);
    const fetchMock = mockFetchSequence();

    await pushBookingToGoogle(booking());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setBookingGoogleSyncMock).not.toHaveBeenCalled();
  });

  it('schluckt API-Fehler (wirft nie) und loggt ein Audit-Ereignis', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    getOfferMock.mockResolvedValue(offer());
    // insertEvent -> 500 => GoogleCalendarClient.request wirft.
    mockFetchSequence([{ error: 'boom' }], 500);

    await expect(pushBookingToGoogle(booking())).resolves.toBeUndefined();

    expect(setBookingGoogleSyncMock).not.toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      action: 'google.push.fehler',
      entity: 'booking',
      entityId: 'b-1',
    });
  });
});

// ===========================================================================
// removeBookingFromGoogle
// ===========================================================================
describe('removeBookingFromGoogle', () => {
  it('loescht das Event aus der gespeicherten googleCalendarId und raeumt die Sync-Felder auf', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    const fetchMock = mockFetchSequence();

    await removeBookingFromGoogle(
      booking({ googleEventId: 'evt-x', googleCalendarId: 'studio@group.calendar.google.com' }),
    );

    // DELETE gegen die GESPEICHERTE googleCalendarId (nicht den Hauptkalender).
    const del = findCall(
      fetchMock,
      'DELETE',
      '/calendars/studio%40group.calendar.google.com/events/evt-x',
    );
    expect(del).toBeDefined();
    expect(clearBookingGoogleSyncMock).toHaveBeenCalledWith('b-1');
  });

  it('faellt auf den Hauptkalender zurueck, wenn die Buchung keine googleCalendarId hat', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    const fetchMock = mockFetchSequence();

    await removeBookingFromGoogle(booking({ googleEventId: 'evt-y', googleCalendarId: null }));

    const del = findCall(fetchMock, 'DELETE', '/calendars/sandro%40example.ch/events/evt-y');
    expect(del).toBeDefined();
    expect(clearBookingGoogleSyncMock).toHaveBeenCalledWith('b-1');
  });

  it('ist ein No-op, wenn die Buchung kein Event hat', async () => {
    const fetchMock = mockFetchSequence();

    await removeBookingFromGoogle(booking({ googleEventId: null }));

    expect(getGoogleConnectionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clearBookingGoogleSyncMock).not.toHaveBeenCalled();
  });

  it('schluckt API-Fehler (wirft nie) und loggt ein Audit-Ereignis', async () => {
    getGoogleConnectionMock.mockResolvedValue(googleConnection());
    // deleteEvent -> 404 => request wirft.
    mockFetchSequence([{ error: 'not found' }], 404);

    await expect(
      removeBookingFromGoogle(booking({ googleEventId: 'evt-z', googleCalendarId: 'cal' })),
    ).resolves.toBeUndefined();

    expect(clearBookingGoogleSyncMock).not.toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock.mock.calls[0][0]).toMatchObject({
      action: 'google.remove.fehler',
      entity: 'booking',
      entityId: 'b-1',
    });
  });
});

// ===========================================================================
// googleBusyIntervals
// ===========================================================================
describe('googleBusyIntervals', () => {
  it('merged Busy-Intervalle ueber mehrere busyCalendarIds und dedupliziert', async () => {
    getGoogleConnectionMock.mockResolvedValue(
      googleConnection({ busyCalendarIds: ['cal-a@x.ch', 'cal-b@x.ch'] }),
    );
    // Reihenfolge der fetch-Antworten entspricht der ids-Reihenfolge (Promise.all).
    const fetchMock = mockFetchSequence([
      {
        items: [
          {
            id: 'a1',
            start: { dateTime: '2026-06-10T10:00:00+02:00' },
            end: { dateTime: '2026-06-10T11:00:00+02:00' },
          },
        ],
      },
      {
        items: [
          // Gleiches Intervall wie a1 (geteiltes Event) -> wird dedupliziert.
          {
            id: 'b1',
            start: { dateTime: '2026-06-10T10:00:00+02:00' },
            end: { dateTime: '2026-06-10T11:00:00+02:00' },
          },
          // Eigenes Intervall.
          {
            id: 'b2',
            start: { dateTime: '2026-06-10T14:00:00+02:00' },
            end: { dateTime: '2026-06-10T14:30:00+02:00' },
          },
        ],
      },
    ]);

    const busy = await googleBusyIntervals('2026-06-10');

    expect(busy).toEqual([
      { start: '10:00', durationMinutes: 60 },
      { start: '14:00', durationMinutes: 30 },
    ]);
    // Zwei listEvents-Aufrufe (einer pro Kalender).
    const listCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/events?'));
    expect(listCalls.length).toBe(2);
  });

  it('faellt auf den Hauptkalender zurueck, wenn busyCalendarIds leer ist', async () => {
    getGoogleConnectionMock.mockResolvedValue(
      googleConnection({ busyCalendarIds: [], googleCalendarId: 'main@x.ch' }),
    );
    const fetchMock = mockFetchSequence([
      {
        items: [
          {
            id: 'm1',
            start: { dateTime: '2026-06-10T09:00:00+02:00' },
            end: { dateTime: '2026-06-10T09:45:00+02:00' },
          },
        ],
      },
    ]);

    const busy = await googleBusyIntervals('2026-06-10');

    expect(busy).toEqual([{ start: '09:00', durationMinutes: 45 }]);
    const list = findCall(fetchMock, 'GET', '/calendars/main%40x.ch/events?');
    expect(list).toBeDefined();
  });

  it('ist pro Kalender fehlertolerant: ein fehlschlagender Kalender nullt die anderen nicht', async () => {
    getGoogleConnectionMock.mockResolvedValue(
      googleConnection({ busyCalendarIds: ['ok@x.ch', 'fail@x.ch'] }),
    );
    // Pro-Kalender-Fehler haengt am Kalender-Namen in der URL, nicht an der
    // Aufruf-Reihenfolge (Promise.all serialisiert nicht deterministisch).
    let i = 0;
    const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async (url) => {
        i += 1;
        if (String(url).includes('fail%40x.ch')) {
          return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
        }
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'ok1',
                start: { dateTime: '2026-06-10T08:00:00+02:00' },
                end: { dateTime: '2026-06-10T08:30:00+02:00' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    void i;

    const busy = await googleBusyIntervals('2026-06-10');

    // Der erfolgreiche Kalender liefert weiterhin sein Intervall.
    expect(busy).toEqual([{ start: '08:00', durationMinutes: 30 }]);
  });

  it('liefert [], wenn Google nicht konfiguriert ist', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const fetchMock = mockFetchSequence();

    expect(await googleBusyIntervals('2026-06-10')).toEqual([]);
    expect(getGoogleConnectionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('liefert [], wenn keine Verbindung existiert', async () => {
    getGoogleConnectionMock.mockResolvedValue(null);
    expect(await googleBusyIntervals('2026-06-10')).toEqual([]);
  });

  it('liefert [], wenn weder busyCalendarIds noch ein Hauptkalender vorhanden sind', async () => {
    getGoogleConnectionMock.mockResolvedValue(
      googleConnection({ busyCalendarIds: [], googleCalendarId: null }),
    );
    const fetchMock = mockFetchSequence();

    expect(await googleBusyIntervals('2026-06-10')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
