CREATE TYPE "public"."booking_source" AS ENUM('iframe', 'manuell');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('neu', 'bestaetigt', 'abgesagt', 'erledigt');--> statement-breakpoint
CREATE TYPE "public"."calendar_provider" AS ENUM('google', 'apple', 'outlook');--> statement-breakpoint
CREATE TYPE "public"."discount_kind" AS ENUM('code', 'link');--> statement-breakpoint
CREATE TYPE "public"."discount_value_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."offer_unit" AS ENUM('pauschal', 'pro_stunde');--> statement-breakpoint
CREATE TYPE "public"."write_mode" AS ENUM('main', 'per_offer');--> statement-breakpoint
CREATE TABLE "availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekday" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"start_time" text DEFAULT '09:00' NOT NULL,
	"end_time" text DEFAULT '18:00' NOT NULL,
	CONSTRAINT "availability_weekday_unique" UNIQUE("weekday")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid,
	"offer_name_snapshot" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"message" text,
	"requested_date" date NOT NULL,
	"requested_time" text DEFAULT '' NOT NULL,
	"location" text,
	"price_rappen" integer NOT NULL,
	"status" "booking_status" DEFAULT 'neu' NOT NULL,
	"source" "booking_source" DEFAULT 'manuell' NOT NULL,
	"discount_id" uuid,
	"custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"google_event_id" text,
	"google_calendar_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "calendar_provider" NOT NULL,
	"account_label" text NOT NULL,
	"status" text DEFAULT 'verbunden' NOT NULL,
	"sub_calendars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"busy_calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"write_mode" "write_mode" DEFAULT 'main' NOT NULL,
	"google_calendar_id" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expiry" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discount_id" uuid NOT NULL,
	"booking_id" uuid,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_saved_rappen" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"code" text,
	"token" text,
	"value_type" "discount_value_type" NOT NULL,
	"value" integer NOT NULL,
	"offer_id" uuid,
	"max_redemptions" integer,
	"redemptions_used" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_code_unique" UNIQUE("code"),
	CONSTRAINT "discounts_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_rappen" integer NOT NULL,
	"unit" "offer_unit" DEFAULT 'pauschal' NOT NULL,
	"duration_label" text DEFAULT '' NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"calendar_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;