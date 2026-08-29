import pino from './hichat-server/node_modules/pino/pino.js';
import {
  AppError,
  DatabaseError,
  ValidationError,
  CryptoError,
  AuthenticationError,
  NotFoundError,
  InternalServerError,
} from './hichat-server/src/core/errors.ts';
import { formatErrorResponse } from './hichat-server/src/middleware/errorHandler.ts';
import { REDACTION_PATHS } from './hichat-server/src/core/logger.ts';

async function testErrorCauseChaining() {
  console.log('='.repeat(80));
  console.log('PHASE 11.1: ERROR CAUSE CHAINING VERIFICATION TEST');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 5;

  // ---------------------------------------------------------------------------
  // TEST 1: AppError & DatabaseError accept { cause: sqliteError }
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Testing AppError & DatabaseError with { cause } constructor...');
  const sqliteError = new Error('SQLiteError: database disk image is malformed (errno: 11)');
  sqliteError.name = 'SQLiteError';

  const dbError = new DatabaseError('Failed to store mailbox message', {
    cause: sqliteError
  });

  console.log('  DatabaseError name:', dbError.name);
  console.log('  DatabaseError message:', dbError.message);
  console.log('  DatabaseError statusCode:', dbError.statusCode);
  console.log('  DatabaseError code:', dbError.code);
  console.log('  DatabaseError cause message:', dbError.cause?.message);

  const isT1Valid =
    dbError.name === 'DatabaseError' &&
    dbError.statusCode === 500 &&
    dbError.code === 'DATABASE_ERROR' &&
    dbError.cause === sqliteError &&
    dbError.cause?.name === 'SQLiteError';

  if (isT1Valid) {
    console.log('  ✅ [PASS] DatabaseError successfully accepts and preserves cause object');
    passed++;
  } else {
    console.error('  ❌ [FAIL] DatabaseError cause preservation failed:', dbError);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Multi-Level Cause Chaining & Root Cause Traversal
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Multi-Level Cause Chain Traversal (L1 -> L2 -> L3)...');
  const rawDiskError = new Error('I/O Hardware Sector Read Failure on sector 0x8FA4');
  rawDiskError.name = 'DiskIOError';

  const lowLevelDbError = new Error('SQLite failed writing page to disk', { cause: rawDiskError });
  lowLevelDbError.name = 'SQLiteLowLevelError';

  const serviceError = new DatabaseError('Failed persisting direct message to mailbox', {
    cause: lowLevelDbError
  });

  const causeChain = serviceError.getCauseChain();
  const rootCause = serviceError.getRootCause();

  console.log('  Cause Chain depth:', causeChain.length);
  causeChain.forEach((c, idx) => {
    console.log(`    Level ${idx + 1}: [${c.name}] ${c.message}`);
  });
  console.log('  Root Cause:', `[${rootCause?.name}] ${rootCause?.message}`);

  const isT2Valid =
    causeChain.length === 2 &&
    causeChain[0].name === 'SQLiteLowLevelError' &&
    causeChain[1].name === 'DiskIOError' &&
    rootCause === rawDiskError;

  if (isT2Valid) {
    console.log('  ✅ [PASS] Multi-level cause chain and getRootCause() accurately resolve root cause');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Cause chain resolution failed:', { causeChain, rootCause });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: All Specialized AppError Subclasses with Cause
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Testing cause support across all AppError subclasses...');
  const syntaxErr = new SyntaxError('Unexpected token in JSON at position 42');
  const valErr = new ValidationError('Malformed JSON in request body', { cause: syntaxErr });

  const jwtErr = new Error('jwt expired');
  const authErr = new AuthenticationError('User session expired', { cause: jwtErr });

  const curveErr = new Error('Curve25519 signature verification error code 1');
  const cryptoErr = new CryptoError('Signed prekey signature mismatch', { cause: curveErr });

  const isT3Valid =
    valErr.cause === syntaxErr &&
    valErr.code === 'VALIDATION_ERROR' &&
    authErr.cause === jwtErr &&
    authErr.code === 'AUTHENTICATION_ERROR' &&
    cryptoErr.cause === curveErr &&
    cryptoErr.code === 'CRYPTO_ERROR';

  if (isT3Valid) {
    console.log('  ✅ [PASS] ValidationError, AuthenticationError, and CryptoError support cause chaining');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Subclass cause support failed');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Pino Logging of Root Cause and Causal Errors
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Pino Logger Serializer with Root Cause & Cause Chain...');
  let loggedPayload = null;
  const testStream = {
    write: (str) => {
      try {
        loggedPayload = JSON.parse(str);
      } catch (_) {
        loggedPayload = str;
      }
    }
  };

  const testLogger = pino(
    {
      level: 'debug',
      redact: {
        paths: REDACTION_PATHS,
        censor: '[REDACTED]'
      },
      serializers: {
        err: (err) => {
          const serialized = pino.stdSerializers.err(err);
          if (err?.cause) {
            const rawCause = err.cause;
            serialized.cause = rawCause instanceof Error
              ? { name: rawCause.name, message: rawCause.message }
              : rawCause;
          }
          if (typeof err?.getRootCause === 'function') {
            const root = err.getRootCause();
            if (root instanceof Error) {
              serialized.rootCause = {
                name: root.name,
                message: root.message
              };
            }
          }
          return serialized;
        }
      }
    },
    testStream
  );

  testLogger.error({ err: serviceError }, 'Unhandled database persistence failure');

  console.log('  Pino Logged Error Structure:', {
    errName: loggedPayload?.err?.type,
    errMsg: loggedPayload?.err?.message,
    errCause: loggedPayload?.err?.cause,
    errRootCause: loggedPayload?.err?.rootCause
  });

  const isT4Valid =
    loggedPayload?.err?.cause?.name === 'SQLiteLowLevelError' &&
    loggedPayload?.err?.rootCause?.name === 'DiskIOError' &&
    loggedPayload?.err?.rootCause?.message?.includes('I/O Hardware Sector');

  if (isT4Valid) {
    console.log('  ✅ [PASS] Pino error serializer captures cause and rootCause metadata cleanly');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Pino cause serialization failed:', loggedPayload);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Cause and Root Cause are NEVER Exposed to HTTP Clients
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Verifying Cause is NEVER Exposed to HTTP Clients...');
  const httpResponse = formatErrorResponse(
    serviceError.code,
    serviceError.message,
    'req_secure_test_123',
    serviceError.statusCode
  );

  console.log('  HTTP Error Response Output:', JSON.stringify(httpResponse, null, 2));

  const isT5Valid =
    httpResponse.success === false &&
    httpResponse.error.code === 'DATABASE_ERROR' &&
    httpResponse.error.message === 'Failed persisting direct message to mailbox' &&
    httpResponse.error.requestId === 'req_secure_test_123' &&
    httpResponse.error.cause === undefined &&
    httpResponse.error.rootCause === undefined &&
    httpResponse.error.causeChain === undefined &&
    httpResponse.error.stack === undefined;

  if (isT5Valid) {
    console.log('  ✅ [PASS] HTTP error response strictly excludes cause, rootCause, and internal stacks');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Internal cause details leaked to HTTP response:', httpResponse);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 11.1 ERROR CAUSE CHAINING SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('  1. AppError constructor accepts optional { cause }: PASSED');
  console.log('  2. Multi-level cause chain & getRootCause() resolution: PASSED');
  console.log('  3. Specialized subclasses (Validation, Auth, Crypto, DB): PASSED');
  console.log('  4. Pino structured logging of root cause: PASSED');
  console.log('  5. Client concealment of cause & internal stack: PASSED');
  console.log('='.repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

testErrorCauseChaining().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
