CREATE TABLE "fact_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"field" text NOT NULL,
	"previous_value" text,
	"previous_origin" "fact_origin",
	"new_value" text NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "fact_corrections" ADD CONSTRAINT "fact_corrections_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fact_corrections_item_idx" ON "fact_corrections" USING btree ("item_id");