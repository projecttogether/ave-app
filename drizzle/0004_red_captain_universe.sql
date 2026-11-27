CREATE TABLE "data_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"frozen_at" timestamp DEFAULT now(),
	"frozen_by" text,
	CONSTRAINT "data_freezes_year_unique" UNIQUE("year")
);
--> statement-breakpoint
ALTER TABLE "data_freezes" ADD CONSTRAINT "data_freezes_frozen_by_user_id_fk" FOREIGN KEY ("frozen_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;