CREATE TABLE "match_classification_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"listing_count" integer NOT NULL,
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
ALTER TABLE "identification_runs" ALTER COLUMN "outcome" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identification_runs" ALTER COLUMN "completed_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_classification_runs" ADD CONSTRAINT "match_classification_runs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_classification_runs_item_idx" ON "match_classification_runs" USING btree ("item_id","created_at");