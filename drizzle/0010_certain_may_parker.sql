CREATE TABLE "condition_assessment_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
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
ALTER TABLE "condition_assessment_runs" ADD CONSTRAINT "condition_assessment_runs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "condition_assessment_runs" ADD CONSTRAINT "condition_assessment_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "condition_assessment_runs_item_idx" ON "condition_assessment_runs" USING btree ("item_id","created_at");