CREATE TABLE "intake_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"response_type" text DEFAULT 'text',
	"response_text" text,
	"response_number" numeric,
	"response_option" text,
	"response_boolean" boolean,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "intake_responses_organization_id_question_key_unique" UNIQUE("organization_id","question_key")
);
--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD COLUMN "response_type" text DEFAULT 'text';--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD COLUMN "response_number" numeric;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD COLUMN "response_option" text;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD CONSTRAINT "intake_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD CONSTRAINT "intake_responses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD CONSTRAINT "intake_responses_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;