CREATE TABLE "item_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"sequence" bigserial NOT NULL,
	"kind" text NOT NULL,
	"source_table" text,
	"source_id" uuid,
	"summary" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_events_item_sequence_idx" ON "item_events" USING btree ("item_id","sequence");