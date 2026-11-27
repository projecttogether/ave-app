CREATE TABLE "revoked_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"revoked_at" timestamp DEFAULT now() NOT NULL,
	"reason" text DEFAULT 'logout_all'
);
--> statement-breakpoint
ALTER TABLE "revoked_sessions" ADD CONSTRAINT "revoked_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;