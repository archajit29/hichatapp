/**
 * HiChat Phase 13D Verification Script: Upstash Redis Integration & Infrastructure Hardening
 * 
 * Verifies:
 *  1. Redis connection.
 *  2. PING response.
 *  3. SET/GET operations.
 *  4. DEL operations.
 *  5. Health check (/health & healthCheckRedis).
 *  6. Graceful disconnect.
 * 
 * Output: PHASE 13D SUMMARY: 6/6 TESTS PASSED
 */

import { connectRedis, disconnectRedis, redis, healthCheckRedis, isRedisConnected } from "./src/db/redis";
import { startServer, server } from "./server";
import { disconnect as disconnectPg } from "./src/db/db";
import { stopSocketSchedulers } from "./src/socket/chatSocket";

async function runTests() {
  console.log("================================================================================");
  console.log("STARTING PHASE 13D: UPSTASH REDIS INTEGRATION VERIFICATION");
  console.log("================================================================================\n");

  let passedTests = 0;
  const totalTests = 6;

  // ---------------------------------------------------------------------------
  // TEST 1: Redis Connection
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 1: Verifying Redis connection...");
    await connectRedis();
    if (!isRedisConnected()) {
      throw new Error("Redis is not connected (isRedisConnected returned false)");
    }
    console.log("✅ TEST 1 PASSED: Redis connected successfully.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 1 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: PING Response
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 2: Verifying Redis PING command...");
    const pingRes = await redis.ping();
    if (pingRes !== "PONG") {
      throw new Error(`Expected PONG, received: ${pingRes}`);
    }
    console.log(`PING response: ${pingRes}`);
    console.log("✅ TEST 2 PASSED: Redis PING returned PONG.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 2 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: SET/GET Operations
  // ---------------------------------------------------------------------------
  const testKey = `hichat:test:${Date.now()}`;
  const testValue = JSON.stringify({ userId: "u_test_123", status: "active", timestamp: Date.now() });
  try {
    console.log("TEST 3: Verifying Redis SET and GET commands...");
    await redis.set(testKey, testValue);
    const retrieved = await redis.get(testKey);

    if (retrieved !== testValue) {
      throw new Error(`SET/GET mismatch: expected ${testValue}, got ${retrieved}`);
    }

    // Test with TTL (setEx)
    const ttlKey = `${testKey}:ttl`;
    await redis.setEx(ttlKey, 60, "temporary_val");
    const ttlVal = await redis.get(ttlKey);
    if (ttlVal !== "temporary_val") {
      throw new Error(`setEx mismatch: expected temporary_val, got ${ttlVal}`);
    }
    await redis.del(ttlKey);

    console.log(`Retrieved value for key ${testKey}:`, retrieved);
    console.log("✅ TEST 3 PASSED: Redis SET/GET and SETEX operations succeeded.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 3 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: DEL Operations
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 4: Verifying Redis DEL command...");
    const delResult = await redis.del(testKey);
    const afterDel = await redis.get(testKey);

    if (afterDel !== null) {
      throw new Error(`Expected key ${testKey} to be null after DEL, got ${afterDel}`);
    }
    console.log(`DEL deleted count: ${delResult}, Key lookup after deletion: ${afterDel}`);
    console.log("✅ TEST 4 PASSED: Redis DEL successfully purged key.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 4 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Health Check
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 5: Verifying Redis health check and server /health endpoint integration...");
    const health = await healthCheckRedis();
    if (!health.healthy || typeof health.latencyMs !== "number") {
      throw new Error(`healthCheckRedis returned unhealthy: ${JSON.stringify(health)}`);
    }
    console.log("healthCheckRedis() diagnostic result:", JSON.stringify(health, null, 2));

    // Test with live HTTP server /health
    const testPort = 3108;
    const activePort = await startServer(testPort);
    const res = await fetch(`http://localhost:${activePort}/health`);
    const data = await res.json();

    if (data.status !== "ok" || !data.redis || !data.redis.healthy) {
      throw new Error(`HTTP /health response missing healthy redis object: ${JSON.stringify(data)}`);
    }
    console.log("HTTP /health response payload:", JSON.stringify(data, null, 2));

    stopSocketSchedulers();
    server.close();

    console.log("✅ TEST 5 PASSED: Redis health check diagnostics verified via function and HTTP /health.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 5 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Graceful Disconnect
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 6: Verifying Redis graceful disconnect...");
    await disconnectRedis();
    await disconnectPg();
    console.log("✅ TEST 6 PASSED: Redis and PostgreSQL disconnected gracefully.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 6 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`PHASE 13D SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
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
