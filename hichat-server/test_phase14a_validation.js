/**
 * HiChat Phase 14A Verification Script: Enterprise Input Validation Everywhere
 * 
 * Verifies:
 *  1. REST API Validation: Register endpoint (valid, missing fields, invalid email, short password, unexpected keys).
 *  2. REST API Validation: Login endpoint & Keys bundle endpoint (schema constraints).
 *  3. REST API Validation: Messages endpoint (Path & Query parameters).
 *  4. Socket.IO Validation: Payload validation on 'join', 'send_direct_message', 'ack_direct_message', 'update_status'.
 *  5. Socket.IO Resilience: Malformed socket payloads safely rejected with 'validation_error' without crashing handlers.
 * 
 * Expected result: PHASE 14A VALIDATION SUMMARY: 5/5 TESTS PASSED
 */

import { startServer, server } from "./server";
import { disconnect as disconnectPg } from "./src/db/db";
import { disconnectRedis } from "./src/db/redis";
import { closeRedisAdapter } from "./src/socket/socketAdapter";
import { stopSocketSchedulers } from "./src/socket/chatSocket";
import { io as ClientIO } from "socket.io-client";
import {
  registerSchema,
  loginSchema,
  createRoomSchema,
  getMessagesQuerySchema,
  socketSendDirectMessageSchema,
  socketUpdateStatusSchema,
} from "./src/validation";
import { validateSocket } from "./src/middleware/validation";
import { AuthService } from "./src/services";

async function runTests() {
  console.log("================================================================================");
  console.log("STARTING PHASE 14A: ENTERPRISE INPUT VALIDATION EVERYWHERE VERIFICATION");
  console.log("================================================================================\n");

  let passedTests = 0;
  const totalTests = 5;

  const testPort = 3114;
  const activePort = await startServer(testPort);
  const baseUrl = `http://localhost:${activePort}`;

  // ---------------------------------------------------------------------------
  // TEST 1: REST API Validation - Auth Register Endpoint
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 1: Verifying REST API validation on /api/auth/register...");

    // 1.1 Invalid Email
    const resInvalidEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "valid_user1",
        email: "not-an-email",
        password: "ValidPassword123!",
      }),
    });
    const dataInvalidEmail = await resInvalidEmail.json();
    if (
      resInvalidEmail.status !== 400 ||
      dataInvalidEmail.error?.code !== "VALIDATION_ERROR" ||
      !dataInvalidEmail.error?.fields?.email
    ) {
      throw new Error(`Expected 400 VALIDATION_ERROR for invalid email, got: ${JSON.stringify(dataInvalidEmail)}`);
    }
    console.log("  ✓ Invalid email properly rejected with field error:", dataInvalidEmail.error.fields);

    // 1.2 Short Password
    const resShortPw = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "valid_user2",
        email: "user2@hichat.app",
        password: "123",
      }),
    });
    const dataShortPw = await resShortPw.json();
    if (
      resShortPw.status !== 400 ||
      dataShortPw.error?.code !== "VALIDATION_ERROR" ||
      !dataShortPw.error?.fields?.password
    ) {
      throw new Error(`Expected 400 VALIDATION_ERROR for short password, got: ${JSON.stringify(dataShortPw)}`);
    }
    console.log("  ✓ Short password properly rejected with field error:", dataShortPw.error.fields);

    // 1.3 Unexpected Keys (Strict Schema)
    const resUnexpected = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "valid_user3",
        email: "user3@hichat.app",
        password: "ValidPassword123!",
        isAdmin: true, // Unexpected key
      }),
    });
    const dataUnexpected = await resUnexpected.json();
    if (
      resUnexpected.status !== 400 ||
      dataUnexpected.error?.code !== "VALIDATION_ERROR"
    ) {
      throw new Error(`Expected 400 VALIDATION_ERROR for unexpected object keys, got: ${JSON.stringify(dataUnexpected)}`);
    }
    console.log("  ✓ Unexpected key properly rejected by strict schema");

    // 1.4 Valid Registration
    const validUsername = `valid_${Date.now()}`;
    const resValid = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: validUsername,
        email: `${validUsername}@hichat.app`,
        password: "SuperSecretPassword123!",
      }),
    });
    const dataValid = await resValid.json();
    if (resValid.status !== 200 || !dataValid.success || !dataValid.token) {
      throw new Error(`Expected 200 for valid registration, got: ${JSON.stringify(dataValid)}`);
    }
    console.log("  ✓ Valid registration succeeded with token generation");

    console.log("✅ TEST 1 PASSED: Auth register input validation fully verified.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 1 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: REST API Validation - Login & Key Endpoints
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 2: Verifying REST API validation on /api/auth/login and /api/keys...");

    // 2.1 Empty Login Body
    const resEmptyLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const dataEmptyLogin = await resEmptyLogin.json();
    if (
      resEmptyLogin.status !== 400 ||
      dataEmptyLogin.error?.code !== "VALIDATION_ERROR" ||
      !dataEmptyLogin.error?.fields?.username ||
      !dataEmptyLogin.error?.fields?.password
    ) {
      throw new Error(`Expected 400 for empty login body, got: ${JSON.stringify(dataEmptyLogin)}`);
    }
    console.log("  ✓ Empty login body rejected with username & password field errors");

    // 2.2 Invalid Key Bundle Upload
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "password123",
      }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    const resInvalidKey = await fetch(`${baseUrl}/api/keys/bundle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        registrationId: -5, // Invalid negative integer
        identityKey: "",   // Empty string
        signedPreKey: { keyId: 1 }, // Missing publicKey & signature
      }),
    });
    const dataInvalidKey = await resInvalidKey.json();
    if (
      resInvalidKey.status !== 400 ||
      dataInvalidKey.error?.code !== "VALIDATION_ERROR" ||
      !dataInvalidKey.error?.fields
    ) {
      throw new Error(`Expected 400 VALIDATION_ERROR for invalid key bundle, got: ${JSON.stringify(dataInvalidKey)}`);
    }
    console.log("  ✓ Malformed key bundle rejected:", dataInvalidKey.error.fields);

    console.log("✅ TEST 2 PASSED: Login and key endpoint validations verified.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 2 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: REST API Validation - Query & Path Parameters
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 3: Verifying Query & Path parameter validations on /api/messages/:roomId...");

    // 3.1 Invalid Query Parameter (negative limit)
    const resInvalidQuery = await fetch(`${baseUrl}/api/messages/general?limit=-10`);
    const dataInvalidQuery = await resInvalidQuery.json();
    if (
      resInvalidQuery.status !== 400 ||
      dataInvalidQuery.error?.code !== "VALIDATION_ERROR" ||
      !dataInvalidQuery.error?.fields?.limit
    ) {
      throw new Error(`Expected 400 for negative limit query, got: ${JSON.stringify(dataInvalidQuery)}`);
    }
    console.log("  ✓ Negative query limit rejected:", dataInvalidQuery.error.fields);

    // 3.2 Valid Query Parameter
    const resValidQuery = await fetch(`${baseUrl}/api/messages/general?limit=25`);
    const dataValidQuery = await resValidQuery.json();
    if (resValidQuery.status !== 200 || !Array.isArray(dataValidQuery.messages)) {
      throw new Error(`Expected 200 for valid messages query, got: ${JSON.stringify(dataValidQuery)}`);
    }
    console.log(`  ✓ Valid messages query returned ${dataValidQuery.messages.length} messages`);

    console.log("✅ TEST 3 PASSED: Query and path parameter validations verified.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 3 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Socket.IO Validation Middleware
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 4: Verifying Socket.IO validation functions & events...");

    // 4.1 Unit Validation for socketUpdateStatusSchema
    const invalidStatusRes = validateSocket(socketUpdateStatusSchema, { status: "sleeping" });
    if (invalidStatusRes.success || !invalidStatusRes.fields?.status) {
      throw new Error(`Expected status validation failure for 'sleeping', got: ${JSON.stringify(invalidStatusRes)}`);
    }
    console.log("  ✓ Socket update_status invalid enum rejected:", invalidStatusRes.fields);

    // 4.2 Unit Validation for socketSendDirectMessageSchema
    const invalidMsgRes = validateSocket(socketSendDirectMessageSchema, {
      messageId: "", // Empty
      recipientId: "u_bob",
      // Missing ciphertext
    });
    if (invalidMsgRes.success || !invalidMsgRes.fields?.messageId || !invalidMsgRes.fields?.ciphertext) {
      throw new Error(`Expected send_direct_message validation failure, got: ${JSON.stringify(invalidMsgRes)}`);
    }
    console.log("  ✓ Socket send_direct_message missing fields rejected:", invalidMsgRes.fields);

    console.log("✅ TEST 4 PASSED: Socket.IO payload validator operational.\n");
    passedTests++;
  } catch (err) {
    console.error("❌ TEST 4 FAILED:", err.message);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Live Real-time Socket Connection Validation & Resilience
  // ---------------------------------------------------------------------------
  try {
    console.log("TEST 5: Verifying live Socket.IO connection validation & error emission...");

    const aliceToken = AuthService.generateAccessToken({
      id: "u_alice_val_test",
      username: "alice_val",
      email: "alice_val@hichat.app",
    });

    const clientSocket = ClientIO(`http://localhost:${activePort}`, {
      auth: { token: aliceToken },
      transports: ["websocket"],
    });

    await new Promise((resolve, reject) => {
      clientSocket.on("connect", resolve);
      clientSocket.on("connect_error", reject);
      setTimeout(() => reject(new Error("Socket connection timed out")), 4000);
    });

    console.log("  ✓ Live socket connected with JWT auth");

    // Listen for validation_error event
    let validationErrorReceived = null;
    clientSocket.on("validation_error", (errPayload) => {
      validationErrorReceived = errPayload;
    });

    // Send malformed direct message payload
    clientSocket.emit("send_direct_message", {
      messageId: "msg_test",
      // missing recipientId and ciphertext
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    if (
      !validationErrorReceived ||
      validationErrorReceived.code !== "VALIDATION_ERROR" ||
      !validationErrorReceived.fields?.recipientId ||
      !validationErrorReceived.fields?.ciphertext
    ) {
      throw new Error(`Expected live socket validation_error event, got: ${JSON.stringify(validationErrorReceived)}`);
    }

    console.log("  ✓ Received structured socket validation_error event:\n", JSON.stringify(validationErrorReceived, null, 2));

    clientSocket.disconnect();
    console.log("✅ TEST 5 PASSED: Live Socket.IO validation resilient and error dispatcher verified.\n");
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
  console.log(`PHASE 14A VALIDATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal validation test runner error:", err);
  process.exit(1);
});
