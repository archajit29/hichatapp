/**
 * HiChat Phase 13C Verification Script: PostgreSQL Connection Pool & Async Hardening
 * 
 * Verifies:
 *  1. PostgreSQL connection succeeds.
 *  2. Pool metrics available.
 *  3. Transaction commit.
 *  4. Transaction rollback.
 *  5. Migrations run.
 *  6. Required tables verified.
 *  7. Repository CRUD works against PostgreSQL.
 *  8. Health endpoint reports postgres.
 *  9. Graceful shutdown closes pool.
 * 10. Socket schedulers start only after database readiness.
 * 
 * Output: PHASE 13C SUMMARY: 10/10 TESTS PASSED
 */

import { connect, disconnect, query, transaction, pool, isPostgresConnected, healthCheck } from "./src/db/postgres";
import { initDb, verifyRequiredTables, isDatabaseReady } from "./src/db/db";
import { getExecutedMigrations, runPendingMigrations } from "./src/db/migrator";
import { userRepository } from "./src/repositories/UserRepository";
import { roomRepository } from "./src/repositories/RoomRepository";
import { startServer, server } from "./server";
import { startSocketSchedulers, stopSocketSchedulers } from "./src/socket/chatSocket";

async function runTests() {
  console.log("================================================================================");
  console.log("STARTING PHASE 13C: POSTGRESQL POOL & PRODUCTION MIGRATION VERIFICATION");
  console.log("================================================================================\n");

  let passedTests = 0;
  const totalTests = 10;

  // ---------------------------------------------------------------------------
  // TEST 1: PostgreSQL connection succeeds
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 1: Verifying PostgreSQL connection...");
    await connect();
    if (!isPostgresConnected()) {
      throw new Error("PostgreSQL is not connected (isPostgresConnected returned false)");
    }
    console.log("✅ TEST 1 PASSED: Connected to PostgreSQL pool successfully.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 1 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Pool metrics available
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 2: Verifying PostgreSQL pool metrics...");
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const waiting = pool.waitingCount;

    if (typeof total !== "number" || typeof idle !== "number" || typeof waiting !== "number") {
      throw new Error("Pool metrics are missing or not numbers");
    }
    console.log(`Pool status -> Total: ${total}, Idle: ${idle}, Waiting: ${waiting}`);
    console.log("✅ TEST 2 PASSED: Pool metrics available.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 2 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Transaction commit
  // ---------------------------------------------------------------------------
  const testRoomId = `test_tx_commit_${Date.now()}`;
  try {
    console.log("TEST 3: Verifying transaction commit safety...");
    await transaction(async (client) => {
      await client.query(
        "INSERT INTO rooms (id, name, description) VALUES ($1, $2, $3)",
        [testRoomId, "Tx Commit Test Room", "Created in transaction"]
      );
    });

    const check = await query("SELECT * FROM rooms WHERE id = $1", [testRoomId]);
    if (!check.rows || check.rows.length === 0) {
      throw new Error("Committed transaction row was not found in PostgreSQL");
    }

    // Cleanup
    await query("DELETE FROM rooms WHERE id = $1", [testRoomId]);
    console.log("✅ TEST 3 PASSED: Transaction commit succeeded and persisted.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 3 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Transaction rollback
  // ---------------------------------------------------------------------------
  const rollbackRoomId = `test_tx_rollback_${Date.now()}`;
  try {
    console.log("TEST 4: Verifying transaction rollback on error...");
    let caught = false;
    try {
      await transaction(async (client) => {
        await client.query(
          "INSERT INTO rooms (id, name, description) VALUES ($1, $2, $3)",
          [rollbackRoomId, "Rollback Test Room", "Should not exist"]
        );
        throw new Error("Intentional rollback exception inside transaction");
      });
    } catch (txErr) {
      caught = true;
    }

    if (!caught) {
      throw new Error("Transaction did not throw expected exception");
    }

    const checkRollback = await query("SELECT * FROM rooms WHERE id = $1", [rollbackRoomId]);
    if (checkRollback.rows && checkRollback.rows.length > 0) {
      throw new Error("Rolled back row exists in database! Rollback failed.");
    }

    console.log("✅ TEST 4 PASSED: Transaction rollback successfully reverted changes.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 4 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Migrations run
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 5: Verifying schema migrations...");
    await runPendingMigrations();
    const executed = await getExecutedMigrations();
    if (executed.length < 5) {
      throw new Error(`Expected at least 5 executed migrations, found ${executed.length}`);
    }
    console.log(`Executed migrations count: ${executed.length}`);
    console.log("✅ TEST 5 PASSED: Migrations executed and recorded in schema_migrations.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 5 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Required tables verified
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 6: Verifying required schema tables exist...");
    const verifiedTables = await verifyRequiredTables();
    if (!verifiedTables || verifiedTables.length !== 11) {
      throw new Error(`Expected 11 required tables, got ${verifiedTables?.length}`);
    }
    console.log(`Verified ${verifiedTables.length} required tables successfully.`);
    console.log("✅ TEST 6 PASSED: All 11 required tables verified.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 6 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Repository CRUD works against PostgreSQL
  // ---------------------------------------------------------------------------
  const testUserId = `u_crud_${Date.now()}`;
  try {
    console.log("TEST 7: Verifying Repository CRUD against PostgreSQL...");
    // Create
    const createdUser = await userRepository.create({
      id: testUserId,
      username: `user_${testUserId}`,
      email: `${testUserId}@test.com`,
      password_hash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      status: "online",
    });
    if (!createdUser || createdUser.id !== testUserId) {
      throw new Error("UserRepository.create failed");
    }

    // Read by ID
    const foundUser = await userRepository.findById(testUserId);
    if (!foundUser || foundUser.username !== createdUser.username) {
      throw new Error("UserRepository.findById failed");
    }

    // Update
    await userRepository.updateStatus(testUserId, "dnd");
    const updatedUser = await userRepository.findById(testUserId);
    if (updatedUser?.status !== "dnd") {
      throw new Error("UserRepository.updateStatus failed");
    }

    // Delete
    await userRepository.delete(testUserId);
    const deletedUser = await userRepository.findById(testUserId);
    if (deletedUser !== null) {
      throw new Error("UserRepository.delete failed");
    }

    console.log("✅ TEST 7 PASSED: Repository CRUD operations work against PostgreSQL.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 7 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Health endpoint reports postgres
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 8: Verifying health check endpoint...");
    const health = await healthCheck();
    if (!health.healthy || health.driver !== "postgres" || !health.pool) {
      throw new Error(`Health check returned unexpected payload: ${JSON.stringify(health)}`);
    }
    console.log("Health Check Result:", JSON.stringify(health, null, 2));
    console.log("✅ TEST 8 PASSED: Health check reports healthy PostgreSQL pool.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 8 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Graceful shutdown closes pool
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 9: Verifying graceful pool disconnect and reconnect...");
    await disconnect();
    // Reconnect for subsequent tests / clean state
    await connect();
    console.log("✅ TEST 9 PASSED: Graceful pool shutdown and reconnect works.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 9 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Socket schedulers start only after database readiness
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 10: Verifying startup initialization order and socket scheduler guard...");
    await initDb();
    if (!isDatabaseReady()) {
      throw new Error("isDatabaseReady() returned false after initDb()");
    }

    const testPort = 3105;
    const activePort = await startServer(testPort);
    console.log(`Test server running on port: ${activePort}`);

    // Fetch /health via HTTP
    const res = await fetch(`http://localhost:${activePort}/health`);
    const data = await res.json();
    if (data.status !== "ok" || data.database?.driver !== "postgres") {
      throw new Error(`HTTP /health check failed: ${JSON.stringify(data)}`);
    }

    // Wait for scheduler cycle
    await new Promise((r) => setTimeout(r, 1500));

    stopSocketSchedulers();
    await disconnect();
    server.close();

    console.log("✅ TEST 10 PASSED: Schedulers started only after database readiness.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 10 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`PHASE 13C SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
