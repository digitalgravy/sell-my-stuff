CREATE TYPE "public"."inventory_adjustment_reason" AS ENUM('restock', 'used_on_item', 'correction');--> statement-breakpoint
CREATE TYPE "public"."inventory_category" AS ENUM('bag', 'wrap', 'box', 'tape', 'label', 'other');--> statement-breakpoint
CREATE TYPE "public"."inventory_unit" AS ENUM('each', 'roll', 'sheet', 'metre');--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" "inventory_adjustment_reason" NOT NULL,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "inventory_category" NOT NULL,
	"unit" "inventory_unit" NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_adjustments_item_idx" ON "inventory_adjustments" USING btree ("inventory_item_id","created_at");