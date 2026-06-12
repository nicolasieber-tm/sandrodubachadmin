import 'server-only';
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { emailTemplates, type EmailTemplate, type EmailTemplateKeyValue } from '@/db/schema';
import { DEFAULT_TEMPLATES, type TemplateContent } from './default-templates';

// Auflösung einer Vorlage in DREI Stufen (spezifisch → global → Default):
//  1. angebotsspezifische DB-Zeile (templateKey + offerId)
//  2. globale DB-Zeile (templateKey + offerId IS NULL)
//  3. eingebauter Standard aus DEFAULT_TEMPLATES
//
// Eindeutigkeit: Statt auf reine DB-Constraints zu vertrauen (Postgres-UNIQUE
// erlaubt mehrere NULL-offerId-Zeilen), arbeitet upsertTemplate explizit
// upsert-sicher: erst SELECT, dann UPDATE oder INSERT. Zusaetzlich sichern zwei
// partielle Unique-Indizes im Schema den Datenbestand ab.

/** Resultat-Typ inkl. Quelle (fuer den «Standard/Angepasst»-Hinweis im UI). */
export interface ResolvedTemplate extends TemplateContent {
  source: 'offer' | 'global' | 'default';
}

async function selectTemplate(
  templateKey: EmailTemplateKeyValue,
  offerId: string | null,
): Promise<EmailTemplate | undefined> {
  const rows = await db
    .select()
    .from(emailTemplates)
    .where(
      offerId === null
        ? and(eq(emailTemplates.templateKey, templateKey), isNull(emailTemplates.offerId))
        : and(eq(emailTemplates.templateKey, templateKey), eq(emailTemplates.offerId, offerId)),
    )
    .limit(1);
  return rows[0];
}

/**
 * Loest eine Vorlage auf: angebotsspezifisch → global → Standard.
 * offerId == null fragt direkt die globale Ebene ab (ueberspringt Stufe 1).
 */
export async function getTemplate(
  templateKey: EmailTemplateKeyValue,
  offerId: string | null,
): Promise<ResolvedTemplate> {
  if (offerId) {
    const spezifisch = await selectTemplate(templateKey, offerId);
    if (spezifisch) {
      return { subject: spezifisch.subject, body: spezifisch.body, source: 'offer' };
    }
  }

  const global = await selectTemplate(templateKey, null);
  if (global) {
    return { subject: global.subject, body: global.body, source: 'global' };
  }

  const def = DEFAULT_TEMPLATES[templateKey];
  return { subject: def.subject, body: def.body, source: 'default' };
}

/**
 * Legt eine Vorlage an oder aktualisiert sie (upsert-sicher: erst select,
 * dann update/insert). offerId == null = globale Vorlage.
 */
export async function upsertTemplate(
  templateKey: EmailTemplateKeyValue,
  offerId: string | null,
  subject: string,
  body: string,
): Promise<EmailTemplate> {
  const existing = await selectTemplate(templateKey, offerId);
  if (existing) {
    const [row] = await db
      .update(emailTemplates)
      .set({ subject, body, updatedAt: new Date() })
      .where(eq(emailTemplates.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(emailTemplates)
    .values({ templateKey, offerId, subject, body })
    .returning();
  return row;
}

/**
 * Loescht die DB-Zeile einer Vorlage (= zurueck auf den Standard bzw. – bei
 * angebotsspezifischen Zeilen – zurueck auf die globale Vorlage).
 */
export async function deleteTemplate(
  templateKey: EmailTemplateKeyValue,
  offerId: string | null,
): Promise<void> {
  await db
    .delete(emailTemplates)
    .where(
      offerId === null
        ? and(eq(emailTemplates.templateKey, templateKey), isNull(emailTemplates.offerId))
        : and(eq(emailTemplates.templateKey, templateKey), eq(emailTemplates.offerId, offerId)),
    );
}

/** Alle gespeicherten Vorlagen-Zeilen (DB only, ohne Defaults). */
export async function listTemplates(): Promise<EmailTemplate[]> {
  return db.select().from(emailTemplates);
}

/**
 * Mail-Typen, fuer die ein Angebot eine eigene Vorlage (Override) hat. Basis
 * fuer die «Standard/Angepasst»-Badges im Angebots-Modal – bewusst nur die
 * Keys, nicht die Inhalte (die laedt das UI lazy pro Zeile).
 */
export async function listOfferTemplateKeys(
  offerId: string,
): Promise<EmailTemplateKeyValue[]> {
  const rows = await db
    .select({ templateKey: emailTemplates.templateKey })
    .from(emailTemplates)
    .where(eq(emailTemplates.offerId, offerId));
  return rows.map((r) => r.templateKey);
}

/**
 * Anzahl angebotsspezifischer Overrides PRO Angebot – eine gruppierte Query
 * statt N Einzelabfragen. Basis fuer die Badges in der Angebots-Auswahl des
 * Tabs «E-Mails». Angebote ohne Overrides tauchen nicht in der Map auf.
 */
export async function countOfferTemplateOverrides(): Promise<Map<string, number>> {
  const rows = await db
    .select({ offerId: emailTemplates.offerId, anzahl: count() })
    .from(emailTemplates)
    .where(isNotNull(emailTemplates.offerId))
    .groupBy(emailTemplates.offerId);
  // offerId ist durch den isNotNull-Filter garantiert gesetzt.
  return new Map(rows.map((r) => [r.offerId as string, Number(r.anzahl)]));
}
