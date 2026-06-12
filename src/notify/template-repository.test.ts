import { describe, it, expect, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { offers, emailTemplates } from '@/db/schema';
import {
  getTemplate,
  upsertTemplate,
  deleteTemplate,
  listTemplates,
} from './template-repository';
import { DEFAULT_TEMPLATES } from './default-templates';

// INTEGRATION (Live-DB-Konvention): nur selbst angelegte Datensaetze, gezielter
// Cleanup via inArray in afterAll. KEIN Wipe ganzer Tabellen.
//
// ACHTUNG: Diese Tests setzen die Tabellen email_templates voraus. Vor dem
// Setup-Skript (scripts/setup-email-tables.mjs) schlagen sie mit «relation
// does not exist» fehl – das ist erwartet und dokumentiert.

const createdOfferIds: string[] = [];

afterAll(async () => {
  // Vorlagen der Test-Angebote werden per ON DELETE CASCADE mitgeloescht;
  // die globalen Test-Vorlagen entfernen wir gezielt unten in den Tests bzw.
  // hier defensiv ueber das Loeschen der Offer-Zeilen.
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

describe('template-repository (Integration)', () => {
  it('faellt ohne DB-Zeile auf DEFAULT_TEMPLATES zurueck (source default)', async () => {
    const t = await getTemplate('received', null);
    expect(t.source).toBe('default');
    expect(t.subject).toBe(DEFAULT_TEMPLATES.received.subject);
  });

  it('loest angebotsspezifisch vor global vor default auf', async () => {
    const offerId = await makeOffer();

    // 1) Ohne irgendetwas: default.
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

    // Aufraeumen der globalen Zeile (die offer-Zeile faellt via Cascade weg).
    await deleteTemplate('confirmed', null);
    t = await getTemplate('confirmed', offerId);
    expect(t.source).toBe('offer');
  });

  it('upsert ist idempotent (kein Duplikat, sondern Update)', async () => {
    await upsertTemplate('rescheduled', null, 'A', 'B');
    await upsertTemplate('rescheduled', null, 'C', 'D');

    const alle = await listTemplates();
    const treffer = alle.filter((t) => t.templateKey === 'rescheduled' && t.offerId === null);
    expect(treffer).toHaveLength(1);
    expect(treffer[0].subject).toBe('C');

    await deleteTemplate('rescheduled', null);
  });

  it('deleteTemplate setzt auf den Standard zurueck (source default)', async () => {
    await upsertTemplate('cancelled', null, 'X', 'Y');
    expect((await getTemplate('cancelled', null)).source).toBe('global');
    await deleteTemplate('cancelled', null);
    expect((await getTemplate('cancelled', null)).source).toBe('default');
  });
});
