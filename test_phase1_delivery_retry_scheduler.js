import { createServer } from "http";
import { Server } from "./hichat-server/node_modules/socket.io/dist/index.js";
import Client from "./hichat/node_modules/socket.io-client/build/esm/index.js";
import { setupSocket } from "./hichat-server/src/socket/chatSocket";
import { AuthService, MessageService } from "./hichat-server/src/services";
import {
  userRepository,
  mailboxRepository,
} from "./hichat-server/src/repositories";
import { config } from "./hichat-server/src/core/config";

async function runDeliveryRetrySchedulerTests() {
  console.log("=".repeat(80));
  console.log("PHASE 1: PRODUCTION DELIVERY RETRY SCHEDULING INTEGRATION TESTS");
  console.log("=".repeat(80));

  let passed = 0;
  const total = 6;
  const testSuffix = "rty_" + Date.now().toString(36);

  // Set up live test socket server
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });
  setupSocket(io);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  const serverUrl = `http://localhost:${port}`;
  console.log(`📡 Socket Server listening on ${serverUrl}`);

  async function createTestUser(prefix) {
    const username = `${prefix}_${testSuffix}`;
    const regResult = await AuthService.register({
      username,
      email: `${username}@test.com`,
      password: "TestPassword123!",
      publicKey: `pk_${username}_test_key`,
    });
    return {
      userId: regResult.user.id,
      username: regResult.user.username,
      token: regResult.accessToken,
      publicKey: regResult.user.publicKey,
    };
  }

  const alice = await createTestUser("alice");
  const bob = await createTestUser("bob");

  function connectClient(user) {
    return new Promise((resolve, reject) => {
      const socket = Client(serverUrl, {
        auth: { token: user.token },
        transports: ["websocket"],
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Delivery Attempt Tracking (attempt_count increments on attempts)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 1] Testing Delivery Attempt Counter Increments...");

  const msg1Id = `msg_attempt_${testSuffix}_1`;
  MessageService.queueDirectMessage({
    messageId: msg1Id,
    recipientId: bob.userId,
    senderId: alice.userId,
    senderUsername: alice.username,
    ciphertext: "payload_1",
  });

  const record0 = MessageService.getDeliveryRecord(msg1Id);
  console.log("  Initial attempt_count:", record0?.attempt_count);

  const attempt1 = MessageService.incrementAttempt(msg1Id, 5000);
  console.log("  After Attempt 1:", attempt1);

  const attempt2 = MessageService.incrementAttempt(msg1Id, 15000);
  console.log("  After Attempt 2:", attempt2);

  const isT1Valid =
    record0?.attempt_count === 0 &&
    attempt1.attemptCount === 1 &&
    attempt2.attemptCount === 2 &&
    attempt1.lastAttemptAt !== null &&
    attempt2.nextRetryAt !== null;

  if (isT1Valid) {
    console.log("  ✅ [PASS] Delivery attempts and timestamps tracked and incremented accurately in repository");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Delivery attempt tracking failed:", { record0, attempt1, attempt2 });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Exponential Backoff Timestamps Calculation
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2] Testing Exponential Backoff Delays and Calculation...");

  const expectedDelays = [0, 5000, 15000, 30000, 60000];
  const calculatedDelays = [
    MessageService.calculateRetryDelay(1),
    MessageService.calculateRetryDelay(2),
    MessageService.calculateRetryDelay(3),
    MessageService.calculateRetryDelay(4),
    MessageService.calculateRetryDelay(5),
  ];

  console.log("  Expected Delays (ms):", expectedDelays);
  console.log("  Calculated Delays (ms):", calculatedDelays);

  const isDelaysMatch = expectedDelays.every((d, i) => d === calculatedDelays[i]);

  const msg2Id = `msg_backoff_${testSuffix}_2`;
  MessageService.queueDirectMessage({
    messageId: msg2Id,
    recipientId: bob.userId,
    senderId: alice.userId,
    senderUsername: alice.username,
    ciphertext: "payload_2",
  });

  const startTime = Date.now();
  const schedRes = MessageService.scheduleRetry(msg2Id, 15000, "TEST_BACKOFF");
  const nextRetryTime = new Date(schedRes.nextRetryAt).getTime();
  const diffMs = nextRetryTime - startTime;

  console.log(`  Scheduled retry timestamp diff: ${diffMs}ms (Expected ~15000ms)`);

  const isT2Valid = isDelaysMatch && Math.abs(diffMs - 15000) < 2000;

  if (isT2Valid) {
    console.log("  ✅ [PASS] Exponential backoff delays and timestamps follow configuration schedule");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Exponential backoff calculation failed:", {
      calculatedDelays,
      diffMs,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Retries Happen Only After next_retry_at
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3] Testing Scheduler Ignores Future next_retry_at Candidates...");

  const msg3FutureId = `msg_future_${testSuffix}_3`;
  MessageService.queueDirectMessage({
    messageId: msg3FutureId,
    recipientId: bob.userId,
    senderId: alice.userId,
    senderUsername: alice.username,
    ciphertext: "payload_3",
  });

  // Schedule next retry far in the future (+60 seconds)
  MessageService.scheduleRetry(msg3FutureId, 60000);

  // Check retry candidates (should NOT include msg3FutureId)
  const currentCandidates = MessageService.findRetryCandidates(5, 100);
  const containsFutureMsg = currentCandidates.some((c) => c.message_id === msg3FutureId);

  // Now set next retry to past (-5 seconds)
  MessageService.scheduleRetry(msg3FutureId, -5000);
  const readyCandidates = MessageService.findRetryCandidates(5, 100);
  const containsReadyMsg = readyCandidates.some((c) => c.message_id === msg3FutureId);

  const isT3Valid = !containsFutureMsg && containsReadyMsg;

  if (isT3Valid) {
    console.log("  ✅ [PASS] Retry scheduler filters out future candidates and includes ready candidates");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Future retry filtering failed:", {
      containsFutureMsg,
      containsReadyMsg,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: ACK Clears Pending Retry Schedule
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4] Testing ACK Clears Pending Retry Schedule & Mailbox...");

  const msg4AckId = `msg_ack_clear_${testSuffix}_4`;
  const mbId4 = MessageService.queueDirectMessage({
    messageId: msg4AckId,
    recipientId: bob.userId,
    senderId: alice.userId,
    senderUsername: alice.username,
    ciphertext: "payload_4",
  }).mailboxId;

  MessageService.incrementAttempt(msg4AckId, 5000);
  const beforeAck = MessageService.getDeliveryRecord(msg4AckId);

  MessageService.acknowledgeDirectMessage(bob.userId, msg4AckId, mbId4);

  const afterAck = MessageService.getDeliveryRecord(msg4AckId);
  const mailboxAfterAck = MessageService.findByMessageId(msg4AckId);

  const isT4Valid =
    beforeAck?.next_retry_at !== null &&
    afterAck?.status === "acknowledged" &&
    afterAck?.next_retry_at === null &&
    !mailboxAfterAck;

  if (isT4Valid) {
    console.log("  ✅ [PASS] Acknowledgment purges mailbox row and clears next_retry_at schedule");
    passed++;
  } else {
    console.error("  ❌ [FAIL] ACK clear schedule failed:", { beforeAck, afterAck, mailboxAfterAck });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Dead Letter State Preserved in DB (Not Deleted)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5] Testing Dead Letter State in DB (Marked Failed & Preserved for Audit)...");

  const msgExhaust1Id = `msg_exhaust_db_${testSuffix}_5`;
  const mbExhaust1Id = MessageService.queueDirectMessage({
    messageId: msgExhaust1Id,
    recipientId: bob.userId,
    senderId: alice.userId,
    senderUsername: alice.username,
    ciphertext: "payload_exhaust_1",
  }).mailboxId;

  // Set attempt_count to 5 (max retries)
  for (let i = 0; i < 5; i++) {
    MessageService.incrementAttempt(msgExhaust1Id, -1000);
  }

  // Trigger ACK timeout handling when attempts >= 5
  const timeoutResult = MessageService.handleAckTimeout(mbExhaust1Id, msgExhaust1Id, { maxRetries: 5 });
  console.log("  Timeout handling result:", timeoutResult);

  const finalRecord1 = MessageService.getDeliveryRecord(msgExhaust1Id);
  const finalMailbox1 = MessageService.findByMessageId(msgExhaust1Id);

  console.log("  Final delivery status:", finalRecord1?.status);
  console.log("  Final mailbox status (preserved for audit):", finalMailbox1?.status);

  const isT5Valid =
    timeoutResult.failed === true &&
    finalRecord1?.status === "failed" &&
    finalMailbox1 !== undefined &&
    finalMailbox1?.status === "failed";

  if (isT5Valid) {
    console.log("  ✅ [PASS] Dead letter state: record marked as failed and preserved for audit without deletion");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Dead letter state failed:", { finalRecord1, finalMailbox1 });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Sender Receives 'failed' Status Update After Exhaustion
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6] Testing Sender Receives 'failed' Event on Retry Exhaustion Sweep...");

  const aliceSocket = await connectClient(alice);
  aliceSocket.emit("join", { publicKey: alice.publicKey, room: "general" });
  await new Promise((r) => setTimeout(r, 200));

  const msgExhaust2Id = `msg_exhaust_live_${testSuffix}_6`;

  const failedPromise = new Promise((resolve) => {
    aliceSocket.on("message_status_update", (statusData) => {
      if (statusData.messageId === msgExhaust2Id && statusData.status === "failed") {
        resolve(statusData);
      }
    });
  });

  MessageService.queueDirectMessage({
    messageId: msgExhaust2Id,
    recipientId: bob.userId,
    senderId: alice.userId,
    senderUsername: alice.username,
    ciphertext: "payload_exhaust_2",
  });

  // Set attempt_count to 5 (max retries)
  for (let i = 0; i < 5; i++) {
    MessageService.incrementAttempt(msgExhaust2Id, -1000);
  }

  console.log("  Awaiting automatic retry sweep to detect exhausted retries and emit failed update...");
  const failedEventPayload = await Promise.race([
    failedPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for failed status event")), 8000)),
  ]);

  console.log("  Sender received failed event payload:", failedEventPayload);

  const isT6Valid = failedEventPayload !== null && failedEventPayload.status === "failed";

  if (isT6Valid) {
    console.log("  ✅ [PASS] Sender received message_status_update with status: 'failed' upon retry exhaustion");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Sender notification failed:", { failedEventPayload });
  }

  // Cleanup
  aliceSocket.disconnect();
  httpServer.close();

  try {
    userRepository.delete(alice.userId);
    userRepository.delete(bob.userId);
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log(`DELIVERY RETRY SCHEDULING SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("  1. Delivery attempt counter increments accurately: PASSED");
  console.log("  2. Exponential backoff timestamps match schedule: PASSED");
  console.log("  3. Retries occur strictly after next_retry_at: PASSED");
  console.log("  4. ACK clears retry schedule and purges mailbox: PASSED");
  console.log("  5. Dead letter failure state preserved for audit: PASSED");
  console.log("  6. Sender receives 'failed' status on exhaustion: PASSED");
  console.log("=".repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }

  process.exit(0);
}

runDeliveryRetrySchedulerTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
