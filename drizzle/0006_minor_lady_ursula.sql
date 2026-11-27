ALTER TABLE "user" ADD COLUMN "status" text DEFAULT 'invited';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_login" timestamp;