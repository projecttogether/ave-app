import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function check() {
  try {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");

    console.log("Checking database connection...");
    const result = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user' AND column_name = 'password';
    `);
    
    if (result.rowCount && result.rowCount > 0) {
      console.log("SUCCESS: 'password' column FOUND in 'user' table.");
    } else {
      console.log("FAILURE: 'password' column NOT FOUND in 'user' table. Migration has NOT run.");
    }
    process.exit(0);
  } catch (error) {
    console.error("CONNECTION ERROR: Could not connect to database.", error);
    process.exit(1);
  }
}

check();
