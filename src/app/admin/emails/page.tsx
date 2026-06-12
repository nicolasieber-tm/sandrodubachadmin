import { getTemplate } from '@/notify/template-repository';
import { listReminderRules } from '@/notify/reminder-rules-repository';
import {
  TEMPLATE_KEYS_ORDERED,
  TEMPLATE_LABELS,
} from '@/notify/default-templates';
import type { EmailTemplateKeyValue } from '@/db/schema';
import { ReminderRulesEditor } from '@/components/admin/reminder-rules-editor';
import { EmailTemplatesEditor } from '@/components/admin/email-templates-editor';

// Server-Page «E-Mails»: laedt fuer jeden Mail-Typ die aktive globale Vorlage
// (DB oder Standard) und alle Reminder-Regeln. Die interaktiven Teile (Speichern,
// Zuruecksetzen, Vorschau, Regel-CRUD) liegen in Client-Komponenten.

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
    </section>
  );
}
