import { describe, it, expect, afterAll } from 'vitest';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { offers, emailTemplates, type EmailTemplateKeyValue } from '@/db/schema';
import {
  getTemplate,
  upsertTemplate,
  deleteTemplate,
  listTemplates,
  listOfferTemplateKeys,
} from './template-repository';
import { DEFAULT_TEMPLATES } from './default-templates';

// INTEGRATION (Live-DB-Konvention): nur selbst angelegte Datensaetze, gezielter
// Cleanup via inArray in afterAll. KEIN Wipe ganzer Tabellen.
//
// Globale Vorlagen (offerId = null) sind LIVE-Daten: Sandro kann sie im Admin
// angepasst haben. Tests, die global upserten/loeschen, laufen deshalb in
// withGlobalTemplateRestore – das sichert eine evtl. vorhandene Zeile und
// stellt sie am Ende wieder her.

const createdOfferIds: string[] = [];

afterAll(async () => {
  // Vorlagen der Test-Angebote werden per ON DELETE CASCADE mitgeloescht.
  if (createdOfferIds.length > 0) {
    await db.delete(offers).where(inArray(offers.id, createdOfferIds));
  }
});

async function makeOffer(): Promise<string> {
  const [offer] = await db
    .insert(offers)
    .values({ name: 'E-Mail-Test-Angebot', priceRappen: 25000, unit: 'pauschal', sortOrder: 999 })
    .returning();
  createdOfferIds.push(offer.id);
  return offer.id;
}

/**
 * Sichert eine evtl. vorhandene LIVE-Globalvorlage des Keys und stellt sie nach
 * dem Test wieder her. So duerfen Tests die globale Ebene frei veraendern,
 * ohne echte Anpassungen zu zerstoeren.
 */
async function withGlobalTemplateRestore(
  key: EmailTemplateKeyValue,
  fn: () => Promise<void>,
): Promise<void> {
  const rows = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.templateKey, key), isNull(emailTemplates.offerId)))
    .limit(1);
  const vorher = rows[0];
  try {
    await fn();
  } finally {
    // Testzustand entfernen, Live-Zustand wiederherstellen.
    await deleteTemplate(key, null);
    if (vorher) {
      await upsertTemplate(key, null, vorher.subject, vorher.body);
    }
  }
}

describe('template-repository (Integration)', () => {
  it('faellt ohne DB-Zeile auf DEFAULT_TEMPLATES zurueck (source default)', async () => {
    await withGlobalTemplateRestore('received', async () => {
      // Bekannten Zustand herstellen: keine globale Zeile.
      await deleteTemplate('received', null);
      const t = await getTemplate('received', null);
      expect(t.source).toBe('default');
      expect(t.subject).toBe(DEFAULT_TEMPLATES.received.subject);
    });
  });

  it('loest angebotsspezifisch vor global vor default auf', async () => {
    const offerId = await makeOffer();

    await withGlobalTemplateRestore('confirmed', async () => {
      // 1) Bekannten Zustand herstellen (keine globale Zeile): default.
      await deleteTemplate('confirmed', null);
      let t = await getTemplate('confirmed', offerId);
      expect(t.source).toBe('default');

      // 2) Globale Vorlage angelegt: source global.
      await upsertTemplate('confirmed', null, 'Global-Betreff', 'Global-Body');
      t = await getTemplate('confirmed', offerId);
      expect(t.source).toBe('global');
      expect(t.subject).toBe('Global-Betreff');

      // 3) Angebotsspezifisch angelegt: source offer.
      await upsertTemplate('confirmed', offerId, 'Offer-Betreff', 'Offer-Body');
      t = await getTemplate('confirmed', offerId);
      expect(t.source).toBe('offer');
      expect(t.subject).toBe('Offer-Betreff');

      // Ohne globale Zeile gewinnt weiterhin der Offer-Override.
      await deleteTemplate('confirmed', null);
      t = await getTemplate('confirmed', offerId);
      expect(t.source).toBe('offer');
    });
  });

  it('upsert ist idempotent (kein Duplikat, sondern Update)', async () => {
    await withGlobalTemplateRestore('rescheduled', async () => {
      await upsertTemplate('rescheduled', null, 'A', 'B');
      await upsertTemplate('rescheduled', null, 'C', 'D');

      const alle = await listTemplates();
      const treffer = alle.filter((t) => t.templateKey === 'rescheduled' && t.offerId === null);
      expect(treffer).toHaveLength(1);
      expect(treffer[0].subject).toBe('C');
    });
  });

  it('deleteTemplate setzt auf den Standard zurueck (source default)', async () => {
    await withGlobalTemplateRestore('cancelled', async () => {
      await upsertTemplate('cancelled', null, 'X', 'Y');
      expect((await getTemplate('cancelled', null)).source).toBe('global');
      await deleteTemplate('cancelled', null);
      expect((await getTemplate('cancelled', null)).source).toBe('default');
    });
  });

  it('listOfferTemplateKeys liefert die Override-Keys eines Angebots', async () => {
    const offerId = await makeOffer();

    // Ohne Overrides: leer.
    expect(await listOfferTemplateKeys(offerId)).toEqual([]);

    // Zwei Overrides anlegen (z. B. Eingangsbestaetigung + Bestaetigung).
    await upsertTemplate('received', offerId, 'Eigener Eingang', 'Body');
    await upsertTemplate('confirmed', offerId, 'Eigene Bestaetigung', 'Body');

    const keys = await listOfferTemplateKeys(offerId);
    expect([...keys].sort()).toEqual(['confirmed', 'received']);

    // Overrides eines ANDEREN Angebots zaehlen nicht mit (Isolation). Bewusst
    // ueber ein zweites eigenes Angebot geprueft – KEINE globalen Zeilen
    // anfassen (Live-DB: dort koennten echte Anpassungen liegen).
    const anderesOfferId = await makeOffer();
    await upsertTemplate('reminder', anderesOfferId, 'Fremd', 'Body');
    expect((await listOfferTemplateKeys(offerId)).length).toBe(2);

    // Override loeschen reduziert die Liste.
    await deleteTemplate('received', offerId);
    expect(await listOfferTemplateKeys(offerId)).toEqual(['confirmed']);
  });
});
