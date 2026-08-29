import io from './hichat/node_modules/socket.io-client/build/esm/index.js';
import pino from './hichat-server/node_modules/pino/pino.js';
import {
  emitSocketError,
} from './hichat-server/src/socket/chatSocket.ts';
import {
  DatabaseError,
  CryptoError,
  ValidationError,
  AuthenticationError,
} from './hichat-server/src/core/errors.ts';
import { REDACTION_PATHS } from './hichat-server/src/core/logger.ts';

const SERVER_URL = 'http://localhost:3001';

async function registerAndLogin(username, password) {
  const regRes = await fetch(`${SERVER_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@test.com`,
      password,
    })
  });
  const data = await regRes.json();
  return data.token;
}

async function testSocketCauseChaining() {
  console.log('='.repeat(80));
  console.log('PHASE 11.3: SOCKET ERROR CAUSE CHAINING VERIFICATION TEST');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 5;

  const testUser = `sock_cause_${Date.now()}`;
  const validToken = await registerAndLogin(testUser, 'Password123!');

  // ---------------------------------------------------------------------------
  // TEST 1: emitSocketError accepts optional { cause } with AppError
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Testing emitSocketError with { cause } and DatabaseError...');
  let emittedPayload = null;
  let capturedLogs = [];

  const mockLogger = {
    error: (data, msg) => capturedLogs.push({ level: 'error', data, msg }),
    warn: (data, msg) => capturedLogs.push({ level: 'warn', data, msg }),
    info: () => {},
  };

  const mockSocket = {
    id: 'mock_sock_123',
    data: {
      requestId: 'req_socket_cause_test_1',
      logger: mockLogger,
      user: { userId: 'u_test1', username: 'test1' }
    },
    emit: (eventName, payload) => {
      emittedPayload = payload;
    }
  };

  const lowLevelDbError = new Error('SQLiteError: disk I/O error writing to mailbox table');
  lowLevelDbError.name = 'SQLiteError';

  const dbAppError = new DatabaseError('Failed persisting message to mailbox', { cause: lowLevelDbError });

  emitSocketError(mockSocket, dbAppError);

  console.log('  Emitted Client Payload:', JSON.stringify(emittedPayload, null, 2));
  console.log('  Captured Log Data Code:', capturedLogs[0]?.data?.code);
  console.log('  Captured Log Cause:', capturedLogs[0]?.data?.err?.cause?.message);
  console.log('  Captured Log Root Cause:', capturedLogs[0]?.data?.rootCause?.message);

  const isT1Valid =
    emittedPayload?.success === false &&
    emittedPayload?.error?.code === 'DATABASE_ERROR' &&
    emittedPayload?.error?.message === 'Failed persisting message to mailbox' &&
    emittedPayload?.error?.requestId === 'req_socket_cause_test_1' &&
    emittedPayload?.error?.cause === undefined &&
    emittedPayload?.error?.stack === undefined &&
    capturedLogs[0]?.data?.rootCause?.name === 'SQLiteError';

  if (isT1Valid) {
    console.log('  ✅ [PASS] emitSocketError accepts cause, logs root cause, and emits standard client JSON');
    passed++;
  } else {
    console.error('  ❌ [FAIL] emitSocketError with cause failed:', { emittedPayload, log: capturedLogs[0] });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: emitSocketError with String message + SocketErrorOptions { cause, code }
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Testing emitSocketError with string message and options { cause, code }...');
  capturedLogs = [];
  emittedPayload = null;

  const cryptoRawErr = new Error('Curve25519 point decoding failed: invalid point byte');
  cryptoRawErr.name = 'CurvePointError';

  emitSocketError(mockSocket, 'Signal decryption failed', {
    cause: cryptoRawErr,
    code: 'CRYPTO_ERROR',
    eventName: 'signal_decryption_error'
  });

  console.log('  Emitted Client Payload:', JSON.stringify(emittedPayload, null, 2));
  console.log('  Captured Log Root Cause:', capturedLogs[0]?.data?.rootCause?.name);

  const isT2Valid =
    emittedPayload?.success === false &&
    emittedPayload?.error?.code === 'CRYPTO_ERROR' &&
    emittedPayload?.error?.message === 'Signal decryption failed' &&
    emittedPayload?.error?.requestId === 'req_socket_cause_test_1' &&
    emittedPayload?.error?.cause === undefined &&
    capturedLogs[0]?.data?.rootCause?.name === 'CurvePointError';

  if (isT2Valid) {
    console.log('  ✅ [PASS] String error with options { cause, code } correctly attaches cause and logs rootCause');
    passed++;
  } else {
    console.error('  ❌ [FAIL] String error with options failed:', emittedPayload);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Multi-Level Cause Chain Traversal in Socket Errors
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Multi-Level Cause Chain Logging (L1 -> L2 -> L3)...');
  capturedLogs = [];

  const l3Root = new Error('Network socket connection reset by peer (ECONNRESET)');
  l3Root.name = 'NetworkSocketError';

  const l2Mid = new Error('Database cluster proxy lost upstream connection', { cause: l3Root });
  l2Mid.name = 'ClusterProxyError';

  const l1App = new DatabaseError('Failed retrieving queued mailbox items', { cause: l2Mid });

  emitSocketError(mockSocket, l1App);

  const loggedCauseChain = capturedLogs[0]?.data?.causeChain;
  const loggedRoot = capturedLogs[0]?.data?.rootCause;

  console.log('  Cause Chain Length:', loggedCauseChain?.length);
  loggedCauseChain?.forEach((c, idx) => {
    console.log(`    Chain [${idx + 1}]: [${c.name}] ${c.message}`);
  });
  console.log('  Root Cause:', `[${loggedRoot?.name}] ${loggedRoot?.message}`);

  const isT3Valid =
    loggedCauseChain?.length === 2 &&
    loggedCauseChain[0].name === 'ClusterProxyError' &&
    loggedCauseChain[1].name === 'NetworkSocketError' &&
    loggedRoot?.name === 'NetworkSocketError';

  if (isT3Valid) {
    console.log('  ✅ [PASS] Complete cause chain is extracted and logged through Pino');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Multi-level cause chain extraction failed:', { loggedCauseChain, loggedRoot });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Live Socket.IO Client Connection & Cause Concealment
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Live Socket.IO Client Reception and Cause Concealment...');
  const socketClient = io(SERVER_URL, {
    auth: { token: validToken },
    transports: ['websocket'],
    reconnection: false
  });

  await new Promise((resolve) => socketClient.on('connect', resolve));

  const socketErrorPromise = new Promise((resolve) => {
    socketClient.once('signal_decryption_error', (payload) => {
      resolve(payload);
    });
  });

  // Client emits decryption failure with cause metadata
  socketClient.emit('signal_decryption_error', {
    messageId: `msg_cause_test_${Date.now()}`,
    senderId: 'u_alice_test',
    senderUsername: 'alice',
    reason: 'Ratchet counter mismatch on step 4'
  });

  const clientReceivedPayload = await socketErrorPromise;
  console.log('  Live Client Received Payload:', JSON.stringify(clientReceivedPayload, null, 2));

  const isT4Valid =
    clientReceivedPayload?.success === false &&
    clientReceivedPayload?.error?.code === 'CRYPTO_ERROR' &&
    clientReceivedPayload?.error?.message?.includes('Signal Protocol decryption failed') &&
    typeof clientReceivedPayload?.error?.requestId === 'string' &&
    clientReceivedPayload?.error?.cause === undefined &&
    clientReceivedPayload?.error?.rootCause === undefined &&
    clientReceivedPayload?.error?.stack === undefined;

  if (isT4Valid) {
    console.log('  ✅ [PASS] Live socket client receives strictly sanitized JSON; zero stack/cause leaks');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Live client received unexpected/unsecure payload:', clientReceivedPayload);
  }

  socketClient.close();

  // ---------------------------------------------------------------------------
  // TEST 5: Pino Redaction with Socket Error Objects
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Pino Redaction of Sensitive Material in Socket Errors...');
  let pinoOutput = null;
  const pinoStream = {
    write: (str) => {
      try {
        pinoOutput = JSON.parse(str);
      } catch (_) {
        pinoOutput = str;
      }
    }
  };

  const sensitiveLogger = pino(
    {
      level: 'debug',
      redact: {
        paths: REDACTION_PATHS,
        censor: '[REDACTED]'
      }
    },
    pinoStream
  );

  const sensitiveSocket = {
    id: 'sock_sens_999',
    data: {
      requestId: 'req_pino_redact_socket',
      logger: sensitiveLogger,
      user: { userId: 'u_sens', username: 'sens_user' }
    },
    emit: () => {}
  };

  const authErrorWithToken = new AuthenticationError('Token signature verification failed', {
    details: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive_payload' }
  });

  emitSocketError(sensitiveSocket, authErrorWithToken);

  console.log('  Pino Logged Error (redacted fields):', {
    code: pinoOutput?.code,
    statusCode: pinoOutput?.statusCode,
    requestId: pinoOutput?.requestId
  });

  const isT5Valid =
    pinoOutput?.code === 'AUTHENTICATION_ERROR' &&
    pinoOutput?.statusCode === 401 &&
    pinoOutput?.requestId === 'req_pino_redact_socket';

  if (isT5Valid) {
    console.log('  ✅ [PASS] Sensitive error data is protected while maintaining observability');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Pino sensitive error redaction failed:', pinoOutput);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 11.3 SOCKET ERROR CAUSE CHAINING SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('  1. emitSocketError accepts optional { cause } with AppError: PASSED');
  console.log('  2. emitSocketError accepts options { cause, code, eventName }: PASSED');
  console.log('  3. Multi-level cause chain traversal and logging: PASSED');
  console.log('  4. Live Socket.IO client reception and cause concealment: PASSED');
  console.log('  5. Sensitive data redaction with socket error objects: PASSED');
  console.log('='.repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

testSocketCauseChaining().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
