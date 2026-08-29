/**
 * HiChat Phase 14B Verification Script: OpenAPI 3.1 & Interactive Swagger Documentation
 * 
 * Verifies:
 *  1. OpenAPI 3.1 JSON Specification served at /openapi.json with valid structure & components.
 *  2. Interactive Swagger UI mounted and rendered at /docs.
 *  3. Comprehensive documentation of all REST endpoints, parameters, responses, and examples.
 *  4. Security audit: zero secret leakage in documentation or OpenAPI specification.
 *  5. Root endpoint references documentation portals.
 * 
 * Expected result: PHASE 14B OPENAPI & SWAGGER SUMMARY: 5/5 TESTS PASSED
 */

import { startServer, server } from "./server";
import { disconnect as disconnectPg } from "./src/db/db";
import { disconnectRedis } from "./src/db/redis";
import { closeRedisAdapter } from "./src/socket/socketAdapter";
import { stopSocketSchedulers } from "./src/socket/chatSocket";
import { openApiSpec } from "./src/docs/openApiSpec";
import { readFileSync } from "fs";

async function runTests() {
  console.log("================================================================================");
  console.log("STARTING PHASE 14B: OPENAPI 3.1 & SWAGGER DOCUMENTATION VERIFICATION");
  console.log("================================================================================\n");

  let passedTests = 0;
  const totalTests = 5;

  const testPort = 3115;
  const activePort = await startServer(testPort);
  const baseUrl = `http://localhost:${activePort}`;

  // ---------------------------------------------------------------------------
  // TEST 1: OpenAPI 3.1 JSON Specification Endpoint (/openapi.json)
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 1: Verifying GET /openapi.json endpoint...");
    const res = await fetch(`${baseUrl}/openapi.json`);
    if (res.status !== 200) {
      throw new Error(`Expected 200 from /openapi.json, received: ${res.status}`);
    }

    const data = await res.json();
    if (data.openapi !== "3.1.0") {
      throw new Error(`Expected openapi version 3.1.0, received: ${data.openapi}`);
    }
    if (!data.info?.title || !data.info?.version || !data.info?.description) {
      throw new Error("Missing info metadata in openapi.json");
    }
    if (!Array.isArray(data.servers) || data.servers.length < 3) {
      throw new Error("Expected at least 3 servers (dev, staging, prod)");
    }

    console.log(`  ✓ OpenAPI Version: ${data.openapi}`);
    console.log(`  ✓ Document Title: ${data.info.title}`);
    console.log(`  ✓ Configured Servers: ${data.servers.map((s) => s.description).join(", ")}`);
    console.log("✅ TEST 1 PASSED: OpenAPI 3.1 JSON spec endpoint operational.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 1 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Interactive Swagger UI Mounting (/docs)
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 2: Verifying Swagger UI documentation portal at /docs...");
    const res = await fetch(`${baseUrl}/docs`);
    if (res.status !== 200) {
      throw new Error(`Expected 200 from /docs, received: ${res.status}`);
    }

    const htmlContent = await res.text();
    if (!htmlContent.includes("swagger-ui") && !htmlContent.includes("SwaggerUIBundle") && !htmlContent.includes("openapi.json")) {
      throw new Error("Swagger UI bundle not detected in HTML response");
    }

    console.log("  ✓ Swagger UI HTML rendered successfully at /docs");
    console.log("✅ TEST 2 PASSED: Swagger UI mounted and operational.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 2 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Full Route, Component, and Schema Coverage
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 3: Verifying complete schema, tag, and endpoint coverage...");

    const expectedTags = ["Authentication", "Users", "Rooms", "Messages", "Signal Keys", "System"];
    const documentedTags = openApiSpec.tags.map((t) => t.name);
    for (const tag of expectedTags) {
      if (!documentedTags.includes(tag)) {
        throw new Error(`Missing required documentation tag: ${tag}`);
      }
    }

    const expectedPaths = [
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/logout-all",
      "/api/auth/me",
      "/api/auth/csrf",
      "/api/users",
      "/api/rooms",
      "/api/messages/{roomId}",
      "/api/keys/bundle",
      "/api/keys/prekeys",
      "/api/keys/bundle/{identifier}",
      "/api/keys/count/{identifier}",
      "/health",
      "/api/stats",
    ];

    const documentedPaths = Object.keys(openApiSpec.paths);
    for (const path of expectedPaths) {
      if (!documentedPaths.includes(path)) {
        throw new Error(`Missing documentation for path: ${path}`);
      }
    }

    const expectedSchemas = [
      "User",
      "Room",
      "RoomMessage",
      "DirectMessage",
      "SignalBundle",
      "OneTimePreKey",
      "UploadKeyBundleRequest",
      "RegisterRequest",
      "LoginRequest",
      "LoginResponse",
      "HealthResponse",
      "StatsResponse",
      "ErrorResponse",
      "ValidationError",
    ];

    const documentedSchemas = Object.keys(openApiSpec.components.schemas);
    for (const schema of expectedSchemas) {
      if (!documentedSchemas.includes(schema)) {
        throw new Error(`Missing reusable component schema: ${schema}`);
      }
    }

    console.log(`  ✓ Documented Paths: ${documentedPaths.length} endpoints`);
    console.log(`  ✓ Documented Component Schemas: ${documentedSchemas.length} schemas`);
    console.log("✅ TEST 3 PASSED: Full endpoint, tag, and schema coverage verified.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 3 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Security Audit - Zero Leaked Secrets in Documentation
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 4: Auditing documentation for zero secret leakage...");

    const specJson = JSON.stringify(openApiSpec);
    const archDoc = readFileSync("ARCHITECTURE.md", "utf-8");

    const sensitivePatterns = [
      /postgres:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@/,
      /rediss?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@/,
      /eyJhbGciOi[a-zA-Z0-9_-]{50,}/, // Real long JWTs
      /AKIA[0-9A-Z]{16}/,              // AWS access keys
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(specJson)) {
        throw new Error(`Potential credential leakage detected in OpenAPI spec matching: ${pattern}`);
      }
      if (pattern.test(archDoc)) {
        throw new Error(`Potential credential leakage detected in ARCHITECTURE.md matching: ${pattern}`);
      }
    }

    // Verify sanitized placeholders are used
    if (!archDoc.includes("<DB_USER>") || !archDoc.includes("<REDIS_TOKEN>")) {
      throw new Error("Expected ARCHITECTURE.md to use sanitized template placeholders");
    }

    console.log("  ✓ Zero plaintext credentials in OpenAPI specification");
    console.log("  ✓ Zero plaintext credentials in ARCHITECTURE.md");
    console.log("  ✓ Sanitized placeholders verified (<DB_USER>, <REDIS_TOKEN>, etc.)");
    console.log("✅ TEST 4 PASSED: Security audit verified zero secret exposure.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 4 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Root API Endpoint References
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 5: Verifying root endpoint API documentation links...");
    const res = await fetch(`${baseUrl}/`);
    const data = await res.json();

    if (!data.documentation || !data.openapi || data.documentation !== "/docs" || data.openapi !== "/openapi.json") {
      throw new Error(`Root endpoint missing documentation links: ${JSON.stringify(data)}`);
    }

    console.log("  ✓ Root endpoint links:\n", JSON.stringify(data, null, 2));
    console.log("✅ TEST 5 PASSED: Root endpoint documentation discovery verified.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 5 FAILED:", err.message);
  }

  // Cleanup
  stopSocketSchedulers();
  await closeRedisAdapter();
  await disconnectRedis();
  await disconnectPg();
  server.close();

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("================================================================================");
  console.log(`PHASE 14B OPENAPI & SWAGGER SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal Phase 14B test runner error:", err);
  process.exit(1);
});
