import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";

async function main() {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required for provisioning');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('./schema');
  const db = drizzle(process.env.MIGRATION_DATABASE_URL, { schema });
  const { users, userRoles } = await import("@/lib/db/schema");

  const email = process.argv[2];
  const role = process.argv[3] as 'super_admin' | 'admin' | 'org_manager' | 'basic_user' | 'org_view_only' | 'global_view_only';

  if (!email) {
    console.error("Usage: npm run db:seed <email> <role>");
    console.error("Roles: super_admin, admin, org_manager, basic_user, org_view_only, global_view_only");
    process.exit(1);
  }

  if (!role) {
    console.error("Please provide a role (super_admin, admin, org_manager, basic_user, org_view_only, global_view_only) as the second argument.");
    process.exit(1);
  }

  console.log(`Setting up user ${email} with role ${role}...`);

  try {
    let user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (!user) {
      console.log(`User not found, creating ${email}...`);
      const [newUser] = await db.insert(users).values({
        email,
        emailVerified: new Date(),
        status: 'active',
      }).returning();
      user = newUser;
      console.log("✅ User created.");
    }

    await db.delete(userRoles).where(eq(userRoles.userId, user.id));
    await db.insert(userRoles).values({
      userId: user.id,
      roleId: role
    });

    console.log("✅ User role updated successfully.");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
