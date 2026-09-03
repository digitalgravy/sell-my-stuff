CREATE TYPE "public"."item_status" AS ENUM('INBOX', 'IDENTIFYING', 'NEEDS_INFORMATION', 'RESEARCHING', 'VALUING', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED', 'LIVE', 'SOLD', 'AWAITING_DISPATCH', 'DISPATCHED', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('UPLOADED', 'INSPECTING', 'READY', 'REJECTED');--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'Untitled item' NOT NULL,
	"status" "item_status" DEFAULT 'INBOX' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"state" "job_state" DEFAULT 'QUEUED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"position" integer NOT NULL,
	"status" "photo_status" DEFAULT 'UPLOADED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_status_created_idx" ON "items" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_unique" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_state_created_idx" ON "jobs" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_object_key_unique" ON "photos" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "photos_item_position_unique" ON "photos" USING btree ("item_id","position");