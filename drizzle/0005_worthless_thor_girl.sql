ALTER TABLE "intake_responses" DROP CONSTRAINT "intake_responses_organization_id_question_key_unique";--> statement-breakpoint
ALTER TABLE "intake_responses" ADD COLUMN "indicator_slug" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD COLUMN "response_multiple" jsonb;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD COLUMN "response_date" timestamp;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD COLUMN "response_multiple" jsonb;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD COLUMN "response_date" timestamp;--> statement-breakpoint
ALTER TABLE "intake_responses" ADD CONSTRAINT "intake_responses_organization_id_indicator_slug_question_key_unique" UNIQUE("organization_id","indicator_slug","question_key");