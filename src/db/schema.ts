import { pgTable, uuid, text, timestamp, boolean, jsonb, inet, integer, date, pgEnum } from 'drizzle-orm/pg-core';
import type { CustomFieldDef, CustomFieldAnswer } from '../offers/custom-fields';

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  recoveryCodes: text('recovery_codes').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  userAgent: text('user_agent'),
  ip: inet('ip'),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: uuid('actor'),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const offerUnit = pgEnum('offer_unit', ['pauschal', 'pro_stunde']);
export const bookingStatus = pgEnum('booking_status', ['neu', 'bestaetigt', 'abgesagt', 'erledigt']);
export const bookingSource = pgEnum('booking_source', ['iframe', 'manuell']);
export const discountKind = pgEnum('discount_kind', ['code', 'link']);
export const discountValueType = pgEnum('discount_value_type', ['percent', 'fixed']);

export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  priceRappen: integer('price_rappen').notNull(),
  unit: offerUnit('unit').notNull().default('pauschal'),
  durationLabel: text('duration_label').notNull().default(''),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  description: text('description').notNull().default(''),
  calendarKey: text('calendar_key'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  customFields: jsonb('custom_fields').$type<CustomFieldDef[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
  offerNameSnapshot: text('offer_name_snapshot').notNull(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull().default(''),
  message: text('message'),
  requestedDate: date('requested_date').notNull(),
  requestedTime: text('requested_time').notNull().default(''),
  location: text('location'),
  priceRappen: integer('price_rappen').notNull(),
  status: bookingStatus('status').notNull().default('neu'),
  source: bookingSource('source').notNull().default('manuell'),
  discountId: uuid('discount_id').references(() => discounts.id, { onDelete: 'set null' }),
  customFields: jsonb('custom_fields').$type<CustomFieldAnswer[]>().notNull().default([]),
  googleEventId: text('google_event_id'),
  // In welchem Google-Kalender das Event liegt (fuer korrektes Loeschen/Verschieben).
  googleCalendarId: text('google_calendar_id'),
  // Zeitpunkt, zu dem der automatische 48h-Reminder versendet wurde (null = noch nicht).
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  // Wegkosten in Rappen (Step 5). Gesamtbetrag = priceRappen + travelCostRappen.
  travelCostRappen: integer('travel_cost_rappen').notNull().default(0),
  // Zusatzdauer in Minuten ueber die Angebotsdauer hinaus (Step 5).
  extraMinutes: integer('extra_minutes').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
});

export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: discountKind('kind').notNull(),
  code: text('code').unique(),
  token: text('token').unique(),
  valueType: discountValueType('value_type').notNull(),
  value: integer('value').notNull(),            // percent 0–100 ODER fixed Rappen
  offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
  maxRedemptions: integer('max_redemptions'),   // null = unbegrenzt; link = 1
  redemptionsUsed: integer('redemptions_used').notNull().default(0),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  label: text('label'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const discountRedemptions = pgTable('discount_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  discountId: uuid('discount_id').notNull().references(() => discounts.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  amountSavedRappen: integer('amount_saved_rappen').notNull(),
});

export const availability = pgTable('availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  weekday: integer('weekday').notNull().unique(),      // 0=Montag … 6=Sonntag
  enabled: boolean('enabled').notNull().default(true),
  startTime: text('start_time').notNull().default('09:00'),
  endTime: text('end_time').notNull().default('18:00'),
});

export const calendarProvider = pgEnum('calendar_provider', ['google', 'apple', 'outlook']);
export const writeModeEnum = pgEnum('write_mode', ['main', 'per_offer']);

export const calendarConnections = pgTable('calendar_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: calendarProvider('provider').notNull(),
  accountLabel: text('account_label').notNull(),
  status: text('status').notNull().default('verbunden'),
  subCalendars: jsonb('sub_calendars').$type<string[]>().notNull().default([]),
  // Welche Kalender fuer die Belegung (busy) beruecksichtigt werden.
  // Leer/Default beim Verbinden: [googleCalendarId].
  busyCalendarIds: jsonb('busy_calendar_ids').$type<string[]>().notNull().default([]),
  // Schreib-Modus: 'main' = immer Hauptkalender, 'per_offer' = offers.calendarKey.
  writeMode: writeModeEnum('write_mode').notNull().default('main'),
  googleCalendarId: text('google_calendar_id'),
  accessTokenEnc: text('access_token_enc'),
  refreshTokenEnc: text('refresh_token_enc'),
  tokenExpiry: timestamp('token_expiry', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type DiscountRedemption = typeof discountRedemptions.$inferSelect;
export type Availability = typeof availability.$inferSelect;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
