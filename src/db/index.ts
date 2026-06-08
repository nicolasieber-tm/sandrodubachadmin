import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = url.includes('localhost') || url.includes('127.0.0.1');

// Hinweis (bekanntes Restrisiko, Härtung Stufe 1): `rejectUnauthorized: false`
// verschlüsselt die Verbindung, prüft aber das Server-Zertifikat nicht. Akzeptabel
// für Railways internes/Proxy-Netz; für vollständigen MITM-Schutz später das
// Railway-CA-Zertifikat einbinden und `rejectUnauthorized: true` setzen.
const pool = new Pool({
  connectionString: url,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
