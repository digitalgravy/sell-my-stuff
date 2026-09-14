CREATE TYPE "public"."marketplace_listing_status" AS ENUM('published', 'ended');--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"marketplace" text NOT NULL,
	"listing_id" text NOT NULL,
	"listing_url" text NOT NULL,
	"status" "marketplace_listing_status" DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_oauth_tokens" (
	"marketplace" text PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_listings_item_idx" ON "marketplace_listings" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_listings_item_marketplace_unique" ON "marketplace_listings" USING btree ("item_id","marketplace");