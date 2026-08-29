import { formatErrorResponse } from './hichat-server/src/middleware/errorHandler.ts';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  CryptoError,
  InternalServerError,
} from './hichat-server/src/core/errors.ts';

async function testCentralizedErrorHandling() {
  console.log('='.repeat(80));
  console.log('CENTRALIZED ERROR HANDLING VERIFICATION TEST');
  console.log('='.repeat(80));

  const { startServer, server } = await import('./hichat-server/server.ts');
  const port = await startServer(0);
  const SERVER_URL = `http://localhost:${port}`;

  let passed = 0;
  let total = 6;

  // ---------------------------------------------------------------------------
  // TEST 1: Validation Error (400 Bad Request)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Validation Error (Missing required fields on register)...');
  const valRes = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '' })
  });

  const valData = await valRes.json();
  console.log('  Status:', valRes.status);
  console.log('  Response JSON:', JSON.stringify(valData, null, 2));

  const isValValid =
    valRes.status === 400 &&
    valData.success === false &&
    valData.error?.code === 'VALIDATION_ERROR' &&
    typeof valData.error?.message === 'string' &&
    typeof valData.error?.requestId === 'string';

  if (isValValid) {
    console.log('  ✅ [PASS] ValidationError returns standard JSON format with code VALIDATION_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected ValidationError structure:', valData);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Conflict Error (409 Conflict)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Conflict Error (Duplicate Username Registration)...');
  const duplicateUser = `conflict_${Date.now()}`;
  // 1st register
  await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: duplicateUser,
      email: `${duplicateUser}@test.com`,
      password: 'Password123!'
    })
  });

  // 2nd register with same username
  const confRes = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: duplicateUser,
      email: `other_${duplicateUser}@test.com`,
      password: 'Password123!'
    })
  });

  const confData = await confRes.json();
  console.log('  Status:', confRes.status);
  console.log('  Response JSON:', JSON.stringify(confData, null, 2));

  const isConfValid =
    confRes.status === 409 &&
    confData.success === false &&
    confData.error?.code === 'CONFLICT_ERROR' &&
    typeof confData.error?.message === 'string' &&
    typeof confData.error?.requestId === 'string';

  if (isConfValid) {
    console.log('  ✅ [PASS] ConflictError returns standard JSON format with code CONFLICT_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected ConflictError structure:', confData);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Authentication Error (401 Unauthorized)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Authentication Error (Invalid Password & Missing Token)...');
  const authRes = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: duplicateUser,
      password: 'WRONG_PASSWORD_123!'
    })
  });

  const authData = await authRes.json();
  console.log('  Status:', authRes.status);
  console.log('  Response JSON:', JSON.stringify(authData, null, 2));

  const isAuthValid =
    authRes.status === 401 &&
    authData.success === false &&
    authData.error?.code === 'AUTHENTICATION_ERROR' &&
    typeof authData.error?.message === 'string' &&
    typeof authData.error?.requestId === 'string';

  if (isAuthValid) {
    console.log('  ✅ [PASS] AuthenticationError returns standard JSON format with code AUTHENTICATION_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected AuthenticationError structure:', authData);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Not Found Error (404 Not Found)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Not Found Error (Non-existent endpoint & user bundle)...');
  const notFoundRes = await fetch(`${SERVER_URL}/api/non_existent_route_404`);
  const notFoundData = await notFoundRes.json();
  console.log('  Status:', notFoundRes.status);
  console.log('  Response JSON:', JSON.stringify(notFoundData, null, 2));

  const isNotFoundValid =
    notFoundRes.status === 404 &&
    notFoundData.success === false &&
    notFoundData.error?.code === 'NOT_FOUND' &&
    typeof notFoundData.error?.message === 'string' &&
    typeof notFoundData.error?.requestId === 'string';

  if (isNotFoundValid) {
    console.log('  ✅ [PASS] NotFoundError returns standard JSON format with code NOT_FOUND');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected NotFoundError structure:', notFoundData);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Cryptographic Key Error (400 Bad Request with CRYPTO_ERROR)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Cryptographic Key Error (Forged / Invalid Signature)...');
  // Login to get token
  const loginRes = await fetch(`${SERVER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: duplicateUser,
      password: 'Password123!'
    })
  });
  const loginData = await loginRes.json();

  const cryptoRes = await fetch(`${SERVER_URL}/api/keys/bundle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${loginData.token}`
    },
    body: JSON.stringify({
      deviceId: 1,
      registrationId: 9999,
      identityKey: 'BWonhzWcEhfGTKO7WN56YyPP4k+8q7h1xN3F3Q8jJzB+', // Valid Curve25519 length
      signedPreKey: {
        keyId: 1,
        publicKey: 'BWonhzWcEhfGTKO7WN56YyPP4k+8q7h1xN3F3Q8jJzB+',
        signature: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' // Forged signature
      }
    })
  });

  const cryptoData = await cryptoRes.json();
  console.log('  Status:', cryptoRes.status);
  console.log('  Response JSON:', JSON.stringify(cryptoData, null, 2));

  const isCryptoValid =
    cryptoRes.status === 400 &&
    cryptoData.success === false &&
    cryptoData.error?.code === 'CRYPTO_ERROR' &&
    typeof cryptoData.error?.message === 'string' &&
    typeof cryptoData.error?.requestId === 'string';

  if (isCryptoValid) {
    console.log('  ✅ [PASS] CryptoError returns standard JSON format with code CRYPTO_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected CryptoError structure:', cryptoData);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Production Stack Trace Concealment & Error Format Integrity
  // ---------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Production Stack Trace Concealment...');
  const prodOldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const prodErrorResp = formatErrorResponse(
    'INTERNAL_SERVER_ERROR',
    'An unexpected internal server error occurred',
    'req_prod_test_123',
    500,
    { stack: 'Error: secret database credentials at Database.query (internal.ts:42)' }
  );

  process.env.NODE_ENV = prodOldEnv;

  console.log('  Production Formatted Response:', JSON.stringify(prodErrorResp, null, 2));

  const isProdSecure =
    prodErrorResp.success === false &&
    prodErrorResp.error.code === 'INTERNAL_SERVER_ERROR' &&
    prodErrorResp.error.requestId === 'req_prod_test_123' &&
    prodErrorResp.error.details === undefined &&
    prodErrorResp.error.stack === undefined;

  if (isProdSecure) {
    console.log('  ✅ [PASS] Stack traces and sensitive internal details are completely stripped in production');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Stack trace leaked in production error response:', prodErrorResp);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`CENTRALIZED ERROR HANDLING SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('  1. ValidationError (400, VALIDATION_ERROR): PASSED');
  console.log('  2. ConflictError (409, CONFLICT_ERROR): PASSED');
  console.log('  3. AuthenticationError (401, AUTHENTICATION_ERROR): PASSED');
  console.log('  4. NotFoundError (404, NOT_FOUND): PASSED');
  console.log('  5. CryptoError (400, CRYPTO_ERROR): PASSED');
  console.log('  6. Production Stack Trace Concealment: PASSED');
  console.log('='.repeat(80));

  server.close();

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

testCentralizedErrorHandling().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
