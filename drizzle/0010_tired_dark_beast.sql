CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Seed roles
INSERT INTO "roles" ("id", "description") VALUES
('basic_user', 'Basic User'),
('org_manager', 'Organization Manager'),
('org_view_only', 'Organization View Only'),
('admin', 'Admin'),
('super_admin', 'Super Admin')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- Map old roles to new user_roles
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT "id",
  CASE
    WHEN "role" = 'organization_user' THEN 'basic_user'
    WHEN "role" = 'organization_manager' THEN 'org_manager'
    WHEN "role" = 'admin' THEN 'admin'
    WHEN "role" = 'super_admin' THEN 'super_admin'
    ELSE 'basic_user'
  END
FROM "user"
WHERE "role" IS NOT NULL
ON CONFLICT ("user_id", "role_id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "user" DROP COLUMN "role";