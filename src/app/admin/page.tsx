import { getDashboardStats } from '@/bookings/repository';
import { formatRappen } from '@/lib/money';
import { dayMonth } from '@/lib/date';
import { initials, avatarGradient } from '@/lib/avatar';
import { KpiCard } from '@/components/ui/kpi-card';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { StatusBadge } from '@/components/admin/status-badge';

export default async function DashboardPage() {
  const s = await getDashboardStats();

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
          value="—"
          sub="ab Stufe 3"
          accent="var(--blue)"
        />
        <KpiCard
          label="Umsatz Monat"
          value={formatRappen(s.umsatzMonatRappen)}
          sub="bestätigte Buchungen"
          accent="var(--accent)"
        />
      </div>

      <div className="grid-2">
        <Card>
          <CardHeader>
            <h3>Nächste Termine</h3>
            <a className="btn btn-ghost btn-sm" href="/admin/termine">
              Alle ansehen
            </a>
          </CardHeader>
          <CardBody className="flush">
            {s.naechsteTermine.length === 0 ? (
              <div className="empty">
                <h4>Keine Termine</h4>
                <p>Aktuell sind keine kommenden Termine geplant.</p>
              </div>
            ) : (
              s.naechsteTermine.map((b) => {
                // naechsteTermine enthaelt nie Anfragen ohne Datum (Query
                // filtert auf requestedDate >= heute); '' nur fuer TypeScript.
                const { day, month } = dayMonth(b.requestedDate ?? '');
                return (
                  <div className="row-item" key={b.id}>
                    <div className="date-chip">
                      <span className="d">{day}</span>
                      <span className="m">{month}</span>
                    </div>
                    <div className="grow">
                      <div className="t">{b.customerName}</div>
                      <div className="s">
                        {b.offerNameSnapshot} · {b.requestedTime}
                      </div>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3>Neue Anfragen</h3>
            <span className="badge-status st-new">
              <span className="pip" />
              {s.neueListe.length} offen
            </span>
          </CardHeader>
          <CardBody className="flush">
            {s.neueListe.length === 0 ? (
              <div className="empty">
                <h4>Keine neuen Anfragen</h4>
                <p>Sobald eine Anfrage eingeht, erscheint sie hier.</p>
              </div>
            ) : (
              s.neueListe.map((b) => (
                <div className="row-item" key={b.id}>
                  <span
                    className="ava"
                    style={{ background: avatarGradient(b.customerName) }}
                    aria-hidden="true"
                  >
                    {initials(b.customerName)}
                  </span>
                  <div className="grow">
                    <div className="t">{b.customerName}</div>
                    <div className="s">{b.offerNameSnapshot}</div>
                  </div>
                  <span
                    style={{
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatRappen(b.priceRappen)}
                  </span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
