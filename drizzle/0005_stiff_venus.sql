CREATE TABLE "comparable_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"title" text NOT NULL,
	"match" text NOT NULL,
	"sold_at" text NOT NULL,
	"price" real NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_captures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_url" text,
	"page_title" text,
	"html" text NOT NULL,
	"extracted_sales" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD CONSTRAINT "comparable_sales_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comparable_sales_item_idx" ON "comparable_sales" USING btree ("item_id");