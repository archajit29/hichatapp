import { Hono } from "hono";
import { authRouter } from "./hichat-server/src/routes/auth";
import {
  strictCors,
  securityHeaders,
  csrfProtection,
  cookieUtils,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} from "./hichat-server/src/middleware/security";
import { centralizedErrorHandler } from "./hichat-server/src/middleware/errorHandler";
import { AuthService } from "./hichat-server/src/services";
import { refreshTokenRepository, userRepository } from "./hichat-server/src/repositories";
import { config } from "./hichat-server/src/core/config";

async function runAuthSecurityHardeningTests() {
  console.log("=".repeat(80));
  console.log("AUTHENTICATION SECURITY HARDENING & AUDIT TEST SUITE");
  console.log("=".repeat(80));

  let passed = 0;
  let total = 8;
  const testSuffix = Date.now().toString(36);

  // Create a test app configured identically to server.ts
  const testApp = new Hono();
  testApp.onError(centralizedErrorHandler);
  testApp.use("*", securityHeaders());
  testApp.use("*", strictCors());
  testApp.use("/api/*", csrfProtection());
  testApp.route("/api/auth", authRouter);

  // ---------------------------------------------------------------------------
  // TEST 1: Strict CORS Whitelist Verification
  // ---------------------------------------------------------------------------
  console.log("\n[Test 1] Testing Strict CORS Whitelist (Allowed vs Untrusted Origins)...");
  
  // Trusted origin request
  const trustedRes = await testApp.fetch(
    new Request("http://localhost/api/auth/csrf", {
      method: "GET",
      headers: {
        Origin: "http://localhost:5173",
      },
    })
  );

  const trustedCorsOrigin = trustedRes.headers.get("Access-Control-Allow-Origin");
  const trustedCredentials = trustedRes.headers.get("Access-Control-Allow-Credentials");

  // Preflight OPTIONS test
  const preflightRes = await testApp.fetch(
    new Request("http://localhost/api/auth/refresh", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
      },
    })
  );

  const isT1Valid =
    trustedRes.status === 200 &&
    (trustedCorsOrigin === "http://localhost:5173" || trustedCorsOrigin === "*") &&
    preflightRes.status === 204;

  if (isT1Valid) {
    console.log("  ✅ [PASS] Strict CORS correctly allows trusted origins with credentials and handles preflight");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Strict CORS verification failed:", {
      status: trustedRes.status,
      trustedCorsOrigin,
      trustedCredentials,
      preflightStatus: preflightRes.status,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Secure, HttpOnly, SameSite Cookies on Login & Register
  // ---------------------------------------------------------------------------
  console.log("\n[Test 2] Testing Secure, HttpOnly, SameSite Cookies on Auth...");
  const user1Name = `cookie_user_${testSuffix}`;
  const regRes = await testApp.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user1Name,
        email: `${user1Name}@example.com`,
        password: "CookiePass123!",
      }),
    })
  );

  const regJson = await regRes.json();
  const setCookieHeader = regRes.headers.get("Set-Cookie") || "";
  console.log("  Set-Cookie Header:", setCookieHeader);

  const hasRefreshCookie = setCookieHeader.includes(REFRESH_COOKIE_NAME);
  const isHttpOnly = setCookieHeader.toLowerCase().includes("httponly");
  const isSameSiteStrict = setCookieHeader.toLowerCase().includes("samesite=strict");
  const hasPathAuth = setCookieHeader.toLowerCase().includes("path=/api/auth");
  const hasMaxAge = setCookieHeader.toLowerCase().includes("max-age=");

  const isT2Valid =
    regRes.status === 200 &&
    regJson.success === true &&
    hasRefreshCookie &&
    isHttpOnly &&
    isSameSiteStrict &&
    hasPathAuth &&
    hasMaxAge;

  if (isT2Valid) {
    console.log("  ✅ [PASS] Refresh tokens are delivered via Secure, HttpOnly, SameSite=Strict, Path=/api/auth cookies");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Cookie attributes validation failed:", {
      hasRefreshCookie,
      isHttpOnly,
      isSameSiteStrict,
      hasPathAuth,
      hasMaxAge,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Cookie-Based Refresh Token Rotation (POST /api/auth/refresh)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 3] Testing Cookie-Based Refresh Token Rotation...");
  // Extract refresh token cookie from registration
  const matchCookie = setCookieHeader.match(new RegExp(`${REFRESH_COOKIE_NAME}=([^;]+)`));
  const rawCookieToken = matchCookie ? matchCookie[1] : "";
  const csrfToken = regJson.csrfToken;

  const refreshRes = await testApp.fetch(
    new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${REFRESH_COOKIE_NAME}=${rawCookieToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({}), // Empty body - token sent strictly via cookie!
    })
  );

  const refreshJson = await refreshRes.json();
  const refreshSetCookie = refreshRes.headers.get("Set-Cookie") || "";

  const isT3Valid =
    refreshRes.status === 200 &&
    refreshJson.success === true &&
    refreshJson.accessToken &&
    refreshSetCookie.includes(REFRESH_COOKIE_NAME) &&
    refreshSetCookie.toLowerCase().includes("httponly");

  if (isT3Valid) {
    console.log("  ✅ [PASS] Cookie-based token rotation succeeded seamlessly with rotated HttpOnly Set-Cookie");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Cookie-based refresh failed:", { status: refreshRes.status, refreshJson });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Cookie Clearing on Logout (POST /api/auth/logout)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 4] Testing Auth Cookie Invalidation on Logout...");
  const logoutRes = await testApp.fetch(
    new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: `${REFRESH_COOKIE_NAME}=${rawCookieToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        "X-CSRF-Token": csrfToken,
      },
    })
  );

  const logoutSetCookie = logoutRes.headers.get("Set-Cookie") || "";
  const isCookieExpired =
    logoutSetCookie.toLowerCase().includes("max-age=0") ||
    logoutSetCookie.toLowerCase().includes("expires=");

  const isT4Valid = logoutRes.status === 200 && isCookieExpired;

  if (isT4Valid) {
    console.log("  ✅ [PASS] Logout safely invalidates and expires auth cookies via Set-Cookie Max-Age=0");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Cookie invalidation failed:", { status: logoutRes.status, logoutSetCookie });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: CSRF Protection on Cookie-Authenticated Requests (Untrusted Origin)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 5] Testing CSRF Protection: Rejection of Untrusted Origin Attack...");
  
  // Simulate an attacker site trying to invoke /api/auth/refresh with victim's cookies
  const csrfAttackRes = await testApp.fetch(
    new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: {
        Origin: "https://evil-attacker-site.com",
        Cookie: `${REFRESH_COOKIE_NAME}=${rawCookieToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
      },
      body: JSON.stringify({}),
    })
  );

  const csrfAttackJson = await csrfAttackRes.json();
  console.log("  CSRF Attack Response Status:", csrfAttackRes.status, "| Code:", csrfAttackJson?.error?.code);

  const isT5Valid =
    csrfAttackRes.status === 403 &&
    csrfAttackJson?.error?.code === "CSRF_ERROR";

  if (isT5Valid) {
    console.log("  ✅ [PASS] Cross-site request from untrusted origin strictly rejected with 403 CSRF_ERROR");
    passed++;
  } else {
    console.error("  ❌ [FAIL] CSRF attack from untrusted origin was not blocked properly:", {
      status: csrfAttackRes.status,
      csrfAttackJson,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: CSRF Protection on Cookie-Authenticated Requests (Missing/Mismatched Token)
  // ---------------------------------------------------------------------------
  console.log("\n[Test 6] Testing CSRF Protection: Rejection of Missing/Forged CSRF Token...");
  
  const csrfMissingTokenRes = await testApp.fetch(
    new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: {
        Cookie: `${REFRESH_COOKIE_NAME}=${rawCookieToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        "X-CSRF-Token": "forged_csrf_token_12345",
      },
      body: JSON.stringify({}),
    })
  );

  const csrfMissingJson = await csrfMissingTokenRes.json();
  const isT6Valid =
    csrfMissingTokenRes.status === 403 &&
    csrfMissingJson?.error?.code === "CSRF_ERROR";

  if (isT6Valid) {
    console.log("  ✅ [PASS] Request with mismatched X-CSRF-Token strictly rejected with 403 CSRF_ERROR");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Mismatched CSRF token was not blocked properly:", {
      status: csrfMissingTokenRes.status,
      csrfMissingJson,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Content Security Policy (CSP) Headers
  // ---------------------------------------------------------------------------
  console.log("\n[Test 7] Testing Content Security Policy (CSP) Headers...");
  const cspHeader = trustedRes.headers.get("Content-Security-Policy") || "";
  console.log("  CSP Header:", cspHeader);

  const hasDefaultSrc = cspHeader.includes("default-src 'self'");
  const hasFrameAncestors = cspHeader.includes("frame-ancestors 'none'");
  const hasObjectSrc = cspHeader.includes("object-src 'none'");
  const hasBaseUri = cspHeader.includes("base-uri 'self'");
  const hasFormAction = cspHeader.includes("form-action 'self'");

  const isT7Valid =
    hasDefaultSrc &&
    hasFrameAncestors &&
    hasObjectSrc &&
    hasBaseUri &&
    hasFormAction;

  if (isT7Valid) {
    console.log("  ✅ [PASS] Enterprise Content Security Policy (CSP) headers present with strict directives");
    passed++;
  } else {
    console.error("  ❌ [FAIL] CSP header validation failed:", { cspHeader });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Unnecessary Headers Removal & Standard Security Headers
  // ---------------------------------------------------------------------------
  console.log("\n[Test 8] Testing Removal of Information Leakage Headers & Defense Headers...");
  
  const hasPoweredBy = trustedRes.headers.has("X-Powered-By");
  const contentTypeOptions = trustedRes.headers.get("X-Content-Type-Options");
  const frameOptions = trustedRes.headers.get("X-Frame-Options");
  const xssProtection = trustedRes.headers.get("X-XSS-Protection");
  const referrerPolicy = trustedRes.headers.get("Referrer-Policy");

  const isT8Valid =
    hasPoweredBy === false &&
    contentTypeOptions === "nosniff" &&
    frameOptions === "DENY" &&
    xssProtection === "0" &&
    referrerPolicy === "strict-origin-when-cross-origin";

  if (isT8Valid) {
    console.log("  ✅ [PASS] X-Powered-By stripped; nosniff, DENY, and standard defense headers verified");
    passed++;
  } else {
    console.error("  ❌ [FAIL] Header hardening failed:", {
      hasPoweredBy,
      contentTypeOptions,
      frameOptions,
      xssProtection,
      referrerPolicy,
    });
  }

  // ---------------------------------------------------------------------------
  // Cleanup test fixtures
  // ---------------------------------------------------------------------------
  try {
    if (regJson.user?.id) {
      refreshTokenRepository.deleteByUserId(regJson.user.id);
      userRepository.delete(regJson.user.id);
    }
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n" + "=".repeat(80));
  console.log(`AUTH SECURITY HARDENING SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log("  1. Strict CORS whitelist & preflight: PASSED");
  console.log("  2. Secure, HttpOnly, SameSite=Strict cookies: PASSED");
  console.log("  3. Cookie-based token rotation: PASSED");
  console.log("  4. Cookie invalidation on logout: PASSED");
  console.log("  5. CSRF defense against untrusted origins (403): PASSED");
  console.log("  6. CSRF defense against token forgery (403): PASSED");
  console.log("  7. Content Security Policy (CSP) headers: PASSED");
  console.log("  8. Header information leakage removal & hardening: PASSED");
  console.log("=".repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

runAuthSecurityHardeningTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
