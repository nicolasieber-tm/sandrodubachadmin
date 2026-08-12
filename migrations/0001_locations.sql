CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address_line1" text NOT NULL DEFAULT '',
	"postal_code" text NOT NULL DEFAULT '',
	"city" text NOT NULL DEFAULT '',
	"notify_email" text,
	"active" boolean NOT NULL DEFAULT true,
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "locations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "location_id" uuid REFERENCES "public"."locations"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "location_id" uuid REFERENCES "public"."locations"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "location_name_snapshot" text NOT NULL DEFAULT '';
