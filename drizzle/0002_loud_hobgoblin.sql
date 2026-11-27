CREATE TABLE "qualitative_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sub_organization_id" uuid NOT NULL,
	"indicator_slug" text NOT NULL,
	"reporting_year" integer NOT NULL,
	"question_key" text NOT NULL,
	"response_text" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "qualitative_responses_organization_id_sub_organization_id_indicator_slug_reporting_year_question_key_unique" UNIQUE("organization_id","sub_organization_id","indicator_slug","reporting_year","question_key")
);
--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_sub_organization_id_sub_organizations_id_fk" FOREIGN KEY ("sub_organization_id") REFERENCES "public"."sub_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualitative_responses" ADD CONSTRAINT "qualitative_responses_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;