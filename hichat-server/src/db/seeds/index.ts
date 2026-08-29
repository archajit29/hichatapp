import { config } from "../../core/config";
import { connect, disconnect } from "../postgres";
import { seedDev } from "./dev";
import { seedTest } from "./test";

export async function runSeeds() {
  const env = config.env;

  if (env === "production") {
    const forceFlag = process.argv.includes("--force-prod-seed");
    if (!forceFlag) {
      console.warn("⚠️ [SECURITY] Database seeding is DISABLED in production by default.");
      console.warn("   To explicitly force production seeding, supply the flag --force-prod-seed.");
      return;
    }
    console.log("⚠️ [WARNING] Force-seeding production database...");
    await seedDev();
    return;
  }

  if (env === "test") {
    await seedTest();
  } else {
    await seedDev();
  }
}

if (import.meta.main) {
  (async () => {
    try {
      await connect();
      await runSeeds();
      process.exit(0);
    } catch (err) {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    } finally {
      await disconnect();
    }
  })();
}
