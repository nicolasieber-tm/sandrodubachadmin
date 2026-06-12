import { getDashboardStats } from '@/bookings/repository';
import { getWeeklyUtilization } from '@/availability/utilization-service';
import { listAllOffers } from '@/offers/repository';
import { listTravelRules } from '@/travel/repository';
import { travelRuleKurz } from '@/travel/format';
import { formatRappen } from '@/lib/money';
import { KpiCard } from '@/components/ui/kpi-card';
import { DashboardBookingLists } from '@/components/admin/dashboard-booking-lists';

export default async function DashboardPage() {
  const [s, utilization, alleAngebote, regeln] = await Promise.all([
    getDashboardStats(),
    getWeeklyUtilization(),
    listAllOffers(),
    listTravelRules(),
  ]);

  // Wegkosten-Hinweis pro Angebot (Kurzform der zugeordneten Regel) für das
  // Termindetail – dieselbe Hilfe wie im Termine-Tab, falls Sandro aus dem
  // Dashboard heraus eine Buchung bearbeitet.
  const regelById = new Map(regeln.map((r) => [r.id, r]));
  const travelHints: Record<string, string> = {};
  for (const offer of alleAngebote) {
    if (!offer.travelRuleId) continue;
    const regel = regelById.get(offer.travelRuleId);
    if (regel) travelHints[offer.id] = travelRuleKurz(regel);
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Übersicht</div>
          <h1>Hallo Sandro</h1>
          <p className="lead">
            Hier siehst du auf einen Blick, was ansteht und worauf Kundinnen und
            Kunden warten.
          </p>
        </div>
        <a className="btn btn-primary" href="/admin/termine">
          Alle Termine
        </a>
      </div>

      <div className="kpis">
        <KpiCard
          label="Neue Anfragen"
          value={String(s.neueAnfragen)}
          sub="warten auf Bestätigung"
          accent="var(--amber)"
        />
        <KpiCard
          label="Bestätigt diese Woche"
          value={String(s.bestaetigtDieseWoche)}
          accent="var(--green)"
        />
        <KpiCard
          label="Auslastung"
          value={utilization.prozent === null ? '—' : `${utilization.prozent} %`}
          sub={
            utilization.prozent === null ? 'keine Öffnungszeiten' : 'diese Woche'
          }
          accent="var(--blue)"
        />
        <KpiCard
          label="Umsatz Monat"
          value={formatRappen(s.umsatzMonatRappen)}
          sub="bestätigte Buchungen"
          accent="var(--accent)"
        />
      </div>

      <DashboardBookingLists
        naechsteTermine={s.naechsteTermine}
        neueListe={s.neueListe}
        travelHints={travelHints}
      />
    </section>
  );
}
