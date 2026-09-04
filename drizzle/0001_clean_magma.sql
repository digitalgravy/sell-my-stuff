CREATE TYPE "public"."fact_origin" AS ENUM('user_evidence', 'image_inference', 'web_research', 'manufacturer_data', 'user_confirmed');--> statement-breakpoint
CREATE TABLE "item_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"confidence" real NOT NULL,
	"origin" "fact_origin" NOT NULL,
	"evidence" text,
	"source" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_facts" ADD CONSTRAINT "item_facts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_facts_item_idx" ON "item_facts" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_facts_item_field_unique" ON "item_facts" USING btree ("item_id","field");