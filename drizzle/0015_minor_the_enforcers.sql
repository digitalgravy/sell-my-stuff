ALTER TYPE "public"."fact_origin" ADD VALUE 'ai_generated';--> statement-breakpoint
CREATE TABLE "listing_draft_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"outcome" "identification_run_outcome",
	"input_tokens" integer,
	"output_tokens" integer,
	"response" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_draft_runs" ADD CONSTRAINT "listing_draft_runs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_draft_runs_item_idx" ON "listing_draft_runs" USING btree ("item_id","created_at");