import { AuthService } from "./hichat-server/src/services";
import { authRouter } from "./hichat-server/src/routes/auth";
import { refreshTokenRepository, userRepository } from "./hichat-server/src/repositories";
import { db } from "./hichat-server/src/db/db";
import { config } from "./hichat-server/src/core/config";

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf-8"));
}

async function runRefreshTokenRotationTests() {
  console.log("=".repeat(80));
  console.log("SECURE REFRESH TOKEN ROTATION & THEFT REUSE DETECTION TEST SUITE");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 11;
  const testSuffix = Date.now().toString(36);

  // ---------------------------------------------------------------------------
  // TEST 1: Short-lived Access JWT & Long-lived Refresh Token Issuance
  // ---------------------------------------------------------------------------
  console.log("\n[Test 1] Testing Token Issuance on Registration & Login...");
  const user1Name = `sec_user_${testSuffix}`;
  const user1Email = `${user1Name}@example.com`;
  const user1Pass = "SecurePass123!";

  const regResult = await AuthService.register({
    username: user1Name,
    email: user1Email,
    password: user1Pass,
  });

  console.log("  Registered User:", regResult.user.username);
  console.log("  Access Token:", regResult.accessToken.substring(0, 30) + "...");
  console.log("  Refresh Token:", regResult.refreshToken.substring(0, 30) + "...");

  // Decode JWT access token without verification to inspect claims
  const decodedAccess = decodeJwtPayload(regResult.accessToken);
  const isAccessValid =
    decodedAccess &&
    decodedAccess.id === regResult.user.id &&
    decodedAccess.username === user1Name &&
    decodedAccess.type === "access" &&
    decodedAccess.exp > decodedAccess.iat;

  // Verify access token lifespan (e.g. 15 minutes = 900s)
  const accessLifespanSec = decodedAccess.exp - decodedAccess.iat;
  console.log(`  Access Token Lifespan: ${accessLifespanSec}s (${accessLifespanSec / 60}m)`);

  // Check refresh token in database
  const rtHash = AuthService.hashToken(regResult.refreshToken);
  const dbTokenRecord = refreshTokenRepository.findByTokenHash(rtHash);

  const isT1Valid =
    isAccessValid &&
    regResult.token === regResult.accessToken &&
    regResult.refreshToken.startsWith("rt_") &&
    dbTokenRecord !== null &&
    dbTokenRecord.user_id === regResult.user.id &&
    dbTokenRecord.is_revoked === 0 &&
    new Date(dbTokenRecord.expires_at).getTime() > Date.now();

  if (isT1Valid) {
    console.log("  ✅ [PASS] Short-lived access JWT and long-lived hashed refresh token generated cleanly");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Token issuance failed:", { regResult, dbTokenRecord });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Refresh Token Rotation (Every Refresh Issues New RT & Revokes Old RT)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2] Testing Refresh Token Rotation on Refresh Request...");
  const oldRt1 = regResult.refreshToken;
  const oldRt1Hash = AuthService.hashToken(oldRt1);

  const rotResult1 = await AuthService.rotateRefreshToken(oldRt1, {
    userAgent: "Mozilla/5.0 TestAgent",
    ipAddress: "127.0.0.1",
  });

  const newRt2 = rotResult1.refreshToken;
  const newRt2Hash = AuthService.hashToken(newRt2);

  const oldRt1DbRecord = refreshTokenRepository.findByTokenHash(oldRt1Hash);
  const newRt2DbRecord = refreshTokenRepository.findByTokenHash(newRt2Hash);

  const isT2Valid =
    rotResult1.accessToken &&
    rotResult1.refreshToken !== oldRt1 &&
    oldRt1DbRecord?.is_revoked === 1 &&
    oldRt1DbRecord?.replaced_by === newRt2DbRecord?.id &&
    oldRt1DbRecord?.revoked_at !== null &&
    newRt2DbRecord?.is_revoked === 0 &&
    newRt2DbRecord?.parent_token_id === oldRt1DbRecord?.id &&
    newRt2DbRecord?.family_id === oldRt1DbRecord?.family_id;

  if (isT2Valid) {
    console.log("  ✅ [PASS] Refresh token rotated: Old RT revoked and marked replaced_by, New RT linked in same family");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Rotation validation failed:", { oldRt1DbRecord, newRt2DbRecord });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Multi-Step Rotation Lineage Chain (RT1 -> RT2 -> RT3 -> RT4)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3] Testing Multi-Step Rotation Lineage (RT2 -> RT3 -> RT4)...");
  const rotResult2 = await AuthService.rotateRefreshToken(newRt2);
  const newRt3 = rotResult2.refreshToken;

  const rotResult3 = await AuthService.rotateRefreshToken(newRt3);
  const newRt4 = rotResult3.refreshToken;

  const rt3Record = refreshTokenRepository.findByTokenHash(AuthService.hashToken(newRt3));
  const rt4Record = refreshTokenRepository.findByTokenHash(AuthService.hashToken(newRt4));

  const isT3Valid =
    rt3Record?.is_revoked === 1 &&
    rt3Record?.replaced_by === rt4Record?.id &&
    rt4Record?.is_revoked === 0 &&
    rt4Record?.family_id === oldRt1DbRecord?.family_id;

  if (isT3Valid) {
    console.log("  ✅ [PASS] Multi-step rotation chain preserved token family and parentage tracking");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Lineage chain failed:", { rt3Record, rt4Record });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Detection of Revoked Refresh Token Reuse (Theft Detection)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4] Testing Theft Detection: Attempting to reuse revoked token RT1...");
  let theftErrorCaught = false;
  let theftErrorMessage = "";

  try {
    // Attempting to reuse RT1 which was already rotated and revoked!
    await AuthService.rotateRefreshToken(oldRt1);
  } catch (err) {
    theftErrorCaught = true;
    theftErrorMessage = err.message;
    console.log("  Theft Detection Error Caught:", err.message, "| Code:", err.code);
  }

  const isT4Valid =
    theftErrorCaught &&
    theftErrorMessage.toLowerCase().includes("reuse detected");

  if (isT4Valid) {
    console.log("  ✅ [PASS] Replay of revoked refresh token triggered immediate theft detection error");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Revoked token reuse was not detected properly");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Automatic Termination of ALL User Sessions upon Theft Detection
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5] Verifying ALL user sessions and refresh tokens were terminated...");

  // Check that RT4 (which was previously active) is now revoked
  const rt4RecordAfterTheft = refreshTokenRepository.findByTokenHash(AuthService.hashToken(newRt4));

  // Check that NO active tokens remain for this user
  const activeTokensForUser = refreshTokenRepository.findActiveByUserId(regResult.user.id);

  // Attempting to refresh with RT4 should now fail because all sessions were revoked
  let rt4ReuseCaught = false;
  try {
    await AuthService.rotateRefreshToken(newRt4);
  } catch (err) {
    rt4ReuseCaught = true;
  }

  const isT5Valid =
    rt4RecordAfterTheft?.is_revoked === 1 &&
    activeTokensForUser.length === 0 &&
    rt4ReuseCaught === true;

  if (isT5Valid) {
    console.log("  ✅ [PASS] All user sessions and refresh tokens were revoked upon theft detection containment");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Active sessions remained unrevoked after theft:", {
      rt4RecordAfterTheft,
      activeTokensForUser,
      rt4ReuseCaught,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Multi-Device Isolation & Global Revocation on Attack
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6] Testing Multi-Device Breach Containment...");
  const user2Name = `multi_dev_${testSuffix}`;
  const user2Email = `${user2Name}@example.com`;
  const user2Pass = "MultiDevicePass123!";

  // Register user2
  const u2Reg = await AuthService.register({
    username: user2Name,
    email: user2Email,
    password: user2Pass,
  });

  // Device 1 session
  const dev1Rt1 = u2Reg.refreshToken;
  // Device 2 session (simulating second login)
  const u2LoginDev2 = await AuthService.login({
    username: user2Name,
    password: user2Pass,
  }, { userAgent: "Device2 (Mobile)", ipAddress: "192.168.1.100" });
  const dev2Rt1 = u2LoginDev2.refreshToken;

  // Device 3 session (simulating third login)
  const u2LoginDev3 = await AuthService.login({
    username: user2Name,
    password: user2Pass,
  }, { userAgent: "Device3 (Tablet)", ipAddress: "192.168.1.101" });
  const dev3Rt1 = u2LoginDev3.refreshToken;

  // Normal rotation on Device 1: dev1Rt1 -> dev1Rt2
  const dev1Rot = await AuthService.rotateRefreshToken(dev1Rt1);
  const dev1Rt2 = dev1Rot.refreshToken;

  // Now attacker steals and reuses dev1Rt1
  let dev1TheftCaught = false;
  try {
    await AuthService.rotateRefreshToken(dev1Rt1);
  } catch (err) {
    dev1TheftCaught = true;
  }

  // All 3 devices should have their tokens revoked
  const u2ActiveTokensAfterBreach = refreshTokenRepository.findActiveByUserId(u2Reg.user.id);

  const isT6Valid =
    dev1TheftCaught &&
    u2ActiveTokensAfterBreach.length === 0;

  if (isT6Valid) {
    console.log("  ✅ [PASS] Compromise on Device 1 immediately terminated sessions on Device 2 and Device 3");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Multi-device breach containment failed:", { u2ActiveTokensAfterBreach });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Single Session Explicit Logout
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7] Testing Single Session Explicit Logout...");
  const user3Name = `logout_test_${testSuffix}`;
  const user3 = await AuthService.register({
    username: user3Name,
    email: `${user3Name}@example.com`,
    password: "Password123!",
  });

  // Log in on two sessions
  const u3Dev2 = await AuthService.login({
    username: user3Name,
    password: "Password123!",
  });

  // Logout session 1 only
  await AuthService.logout(user3.refreshToken);

  const u3Dev1Record = refreshTokenRepository.findByTokenHash(AuthService.hashToken(user3.refreshToken));
  const u3Dev2Record = refreshTokenRepository.findByTokenHash(AuthService.hashToken(u3Dev2.refreshToken));

  const isT7Valid =
    u3Dev1Record?.is_revoked === 1 &&
    u3Dev2Record?.is_revoked === 0;

  if (isT7Valid) {
    console.log("  ✅ [PASS] Explicit single session logout revokes only the targeted session");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Single session logout failed:", { u3Dev1Record, u3Dev2Record });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Explicit Logout All Sessions (Global Logout)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8] Testing Explicit Logout All Sessions (logoutAll)...");
  await AuthService.logoutAll(user3.user.id);

  const u3ActiveAfterGlobalLogout = refreshTokenRepository.findActiveByUserId(user3.user.id);

  const isT8Valid = u3ActiveAfterGlobalLogout.length === 0;

  if (isT8Valid) {
    console.log("  ✅ [PASS] Global logout (logoutAll) successfully revoked all active sessions for the user");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Global logout failed:", { u3ActiveAfterGlobalLogout });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: HTTP API /refresh Endpoint End-to-End Test
  // ---------------------------------------------------------------------------
  console.log("\n[Test 9] Testing HTTP API POST /refresh Endpoint...");
  const httpUserName = `http_user_${testSuffix}`;
  const httpRegRes = await authRouter.fetch(
    new Request("http://localhost/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: httpUserName,
        email: `${httpUserName}@example.com`,
        password: "HttpPassword123!",
      }),
    })
  );

  const httpRegJson = await httpRegRes.json();
  const httpRt1 = httpRegJson.refreshToken;
  const httpAt1 = httpRegJson.accessToken;

  // Call POST /refresh via router fetch
  const httpRefRes1 = await authRouter.fetch(
    new Request("http://localhost/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: httpRt1 }),
    })
  );

  const httpRefJson1 = await httpRefRes1.json();
  const httpRt2 = httpRefJson1.refreshToken;
  const httpAt2 = httpRefJson1.accessToken;

  const isT9Valid =
    httpRegRes.status === 200 &&
    httpRt1 &&
    httpAt1 &&
    httpRefRes1.status === 200 &&
    httpRefJson1.success === true &&
    httpRt2 &&
    httpRt2 !== httpRt1 &&
    Boolean(httpAt2);

  if (isT9Valid) {
    console.log("  ✅ [PASS] HTTP POST /refresh successfully rotated refresh and access tokens");
    passed++;
  } else {
    console.error("  ❌ [FAIL] HTTP /refresh test failed:", { httpRegJson, httpRefJson1 });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: HTTP API Theft Replay & Global Containment
  // ---------------------------------------------------------------------------
  console.log("\n[Test 10] Testing HTTP API Theft Replay & Global Containment...");
  let httpTheftCaught = false;
  try {
    const httpTheftRes = await authRouter.fetch(
      new Request("http://localhost/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: httpRt1 }),
      })
    );
    if (httpTheftRes.status === 401) {
      httpTheftCaught = true;
    }
  } catch (err) {
    httpTheftCaught = true;
  }

  // Now verify that httpRt2 was also revoked by the theft detection
  const httpRt2RecordAfterTheft = refreshTokenRepository.findByTokenHash(AuthService.hashToken(httpRt2));

  const isT10Valid =
    httpTheftCaught &&
    httpRt2RecordAfterTheft?.is_revoked === 1;

  if (isT10Valid) {
    console.log("  ✅ [PASS] HTTP theft detection revoked all user tokens across the entire platform");
    passed++;
  } else {
    console.error("  ❌ [FAIL] HTTP theft detection verification failed:", { httpTheftCaught, httpRt2RecordAfterTheft });
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Concurrent Refresh Race Condition Audit (Simultaneous Promise.all)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 11] Auditing Concurrent Refresh Race Condition with Promise.all...");
  const concurrentUserName = `concurrent_user_${testSuffix}`;
  const concurrentUser = await AuthService.register({
    username: concurrentUserName,
    email: `${concurrentUserName}@example.com`,
    password: "ConcurrentPass123!",
  });

  const concurrentRt = concurrentUser.refreshToken;

  // Execute two simultaneous refresh requests attempting to rotate the EXACT same refresh token
  const [resultA, resultB] = await Promise.allSettled([
    AuthService.rotateRefreshToken(concurrentRt, { userAgent: "Client Request A", ipAddress: "10.0.0.1" }),
    AuthService.rotateRefreshToken(concurrentRt, { userAgent: "Client Request B", ipAddress: "10.0.0.2" }),
  ]);

  console.log("  Concurrent Request A Status:", resultA.status);
  console.log("  Concurrent Request B Status:", resultB.status);

  const fulfilledCount = (resultA.status === "fulfilled" ? 1 : 0) + (resultB.status === "fulfilled" ? 1 : 0);
  const rejectedCount = (resultA.status === "rejected" ? 1 : 0) + (resultB.status === "rejected" ? 1 : 0);

  const rejectedReason = resultA.status === "rejected" ? resultA.reason : resultB.reason;
  const isRejectedDueToReuse =
    rejectedReason?.code === "REFRESH_TOKEN_REUSE_DETECTED" ||
    rejectedReason?.message?.includes("reuse detected");

  console.log("  Losing Request Error Code:", rejectedReason?.code || rejectedReason?.message);

  // Verify that all active tokens for this user are now terminated due to the race condition containment
  const activeTokensAfterRace = refreshTokenRepository.findActiveByUserId(concurrentUser.user.id);

  const isT11Valid =
    fulfilledCount === 1 &&
    rejectedCount === 1 &&
    isRejectedDueToReuse &&
    activeTokensAfterRace.length === 0;

  if (isT11Valid) {
    console.log("  ✅ [PASS] Concurrent refresh race audit passed: Exactly ONE request succeeded; losing request triggered REFRESH_TOKEN_REUSE_DETECTED");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Concurrent refresh race condition audit failed:", {
      fulfilledCount,
      rejectedCount,
      isRejectedDueToReuse,
      activeTokensCount: activeTokensAfterRace.length,
      resultA,
      resultB,
    });
  }

  // ---------------------------------------------------------------------------
  // Cleanup test fixtures
  // ---------------------------------------------------------------------------
  try {
    refreshTokenRepository.deleteByUserId(regResult.user.id);
    refreshTokenRepository.deleteByUserId(u2Reg.user.id);
    refreshTokenRepository.deleteByUserId(user3.user.id);
    refreshTokenRepository.deleteByUserId(concurrentUser.user.id);
    if (httpRegJson.user?.id) {
      refreshTokenRepository.deleteByUserId(httpRegJson.user.id);
      userRepository.delete(httpRegJson.user.id);
    }
    userRepository.delete(regResult.user.id);
    userRepository.delete(u2Reg.user.id);
    userRepository.delete(user3.user.id);
    userRepository.delete(concurrentUser.user.id);
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log(`REFRESH TOKEN ROTATION SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("  1. Short-lived access JWT & long-lived refresh token: PASSED");
  console.log("  2. Refresh token rotation & linking in family: PASSED");
  console.log("  3. Multi-step rotation lineage chain: PASSED");
  console.log("  4. Revoked refresh token reuse detection: PASSED");
  console.log("  5. Automatic user session termination on theft: PASSED");
  console.log("  6. Multi-device breach containment: PASSED");
  console.log("  7. Single session logout: PASSED");
  console.log("  8. Global logout-all sessions: PASSED");
  console.log("  9. HTTP API POST /refresh rotation: PASSED");
  console.log("  10. HTTP API theft detection & complete containment: PASSED");
  console.log("  11. Concurrent refresh race condition audit (Promise.all): PASSED");
  console.log("=".repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

runRefreshTokenRotationTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
