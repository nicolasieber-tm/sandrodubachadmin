import { getTemplate, countOfferTemplateOverrides } from '@/notify/template-repository';
import { listReminderRules } from '@/notify/reminder-rules-repository';
import { listAllOffers } from '@/offers/repository';
import {
  TEMPLATE_KEYS_ORDERED,
  TEMPLATE_LABELS,
} from '@/notify/default-templates';
import type { EmailTemplateKeyValue } from '@/db/schema';
import { ReminderRulesEditor } from '@/components/admin/reminder-rules-editor';
import { EmailTemplatesEditor } from '@/components/admin/email-templates-editor';
import { OfferMailsSection, type OfferMailRow } from '@/components/admin/offer-mails-section';

// Server-Page «E-Mails»: laedt fuer jeden Mail-Typ die aktive globale Vorlage
// (DB oder Standard), alle Reminder-Regeln sowie die Angebote inkl. Anzahl
// ihrer Mail-Overrides (eine gruppierte Query). Die interaktiven Teile
// (Speichern, Zuruecksetzen, Vorschau, Regel-CRUD, Angebots-Auswahl) liegen in
// Client-Komponenten.

export interface ResolvedTemplateRow {
  key: EmailTemplateKeyValue;
  label: string;
  subject: string;
  body: string;
  // 'default' = eingebauter Standard, sonst eine angepasste DB-Zeile.
  angepasst: boolean;
}

export default async function EmailsPage() {
  // Aktive globale Vorlage pro Mail-Typ (offerId = null).
  const templates: ResolvedTemplateRow[] = await Promise.all(
    TEMPLATE_KEYS_ORDERED.map(async (key) => {
      const t = await getTemplate(key, null);
      return {
        key,
        label: TEMPLATE_LABELS[key],
        subject: t.subject,
        body: t.body,
        angepasst: t.source !== 'default',
      };
    }),
  );

  const rules = await listReminderRules();

  // Angebote fuer die Sektion «Angebots-E-Mails»: aktive zuerst (stabile
  // Sortierung erhaelt sortOrder/Name innerhalb der Gruppen), Override-Anzahl
  // aus EINER gruppierten Query statt N Client-Requests.
  const offers = await listAllOffers();
  const overrideCounts = await countOfferTemplateOverrides();
  const offerRows: OfferMailRow[] = [...offers]
    .sort((a, b) => Number(b.active) - Number(a.active))
    .map((o) => ({
      id: o.id,
      name: o.name,
      active: o.active,
      overrideCount: overrideCounts.get(o.id) ?? 0,
    }));

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Benachrichtigungen</div>
          <h1>E-Mails</h1>
          <p className="lead">
            Erinnerungen und E-Mail-Vorlagen für die automatischen Nachrichten.
          </p>
        </div>
      </div>

      <ReminderRulesEditor rules={rules} />
      <EmailTemplatesEditor templates={templates} />
      {/* Nach den globalen Vorlagen: vom Allgemeinen zum Spezifischen. */}
      <OfferMailsSection offers={offerRows} />
    </section>
  );
}
