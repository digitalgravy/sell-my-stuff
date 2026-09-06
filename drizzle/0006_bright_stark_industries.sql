ALTER TABLE "comparable_sales" ADD COLUMN "source_capture_id" uuid;--> statement-breakpoint
ALTER TABLE "research_captures" ADD COLUMN "imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "research_captures" ADD COLUMN "imported_into_item_id" uuid;--> statement-breakpoint
ALTER TABLE "comparable_sales" ADD CONSTRAINT "comparable_sales_source_capture_id_research_captures_id_fk" FOREIGN KEY ("source_capture_id") REFERENCES "public"."research_captures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_captures" ADD CONSTRAINT "research_captures_imported_into_item_id_items_id_fk" FOREIGN KEY ("imported_into_item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;