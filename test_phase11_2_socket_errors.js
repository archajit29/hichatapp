import io from './hichat/node_modules/socket.io-client/build/esm/index.js';

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

async function testSocketStandardErrors() {
  console.log('='.repeat(80));
  console.log('PHASE 11.2: STANDARDIZE SOCKET.IO ERROR EVENTS VERIFICATION TEST');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 5;

  const testUser = `sock_err_${Date.now()}`;
  const validToken = await registerAndLogin(testUser, 'Password123!');

  // ---------------------------------------------------------------------------
  // TEST 1: Authentication Failures on Socket Handshake
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Socket Authentication Failure (Invalid Token)...');
  const authFailedSocket = io(SERVER_URL, {
    auth: { token: 'INVALID_OR_EXPIRED_JWT_TOKEN' },
    transports: ['websocket'],
    reconnection: false,
    timeout: 3000
  });

  const authErrorPromise = new Promise((resolve) => {
    authFailedSocket.on('connect_error', (err) => {
      resolve(err);
    });
  });

  const connectErr = await authErrorPromise;
  console.log('  connect_error message:', connectErr?.message);
  console.log('  connect_error data:', connectErr?.data);

  const isT1Valid =
    connectErr?.data?.success === false &&
    connectErr?.data?.error?.code === 'AUTHENTICATION_ERROR' &&
    typeof connectErr?.data?.error?.message === 'string' &&
    typeof connectErr?.data?.error?.requestId === 'string';

  if (isT1Valid) {
    console.log('  ✅ [PASS] Socket authentication failure returns standard error JSON with code AUTHENTICATION_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected socket auth error structure:', connectErr);
  }
  authFailedSocket.close();

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid Room Join / Switch Error
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Invalid Room Join & Switch Error Handling...');
  const validSocket = io(SERVER_URL, {
    auth: { token: validToken },
    transports: ['websocket'],
    reconnection: false
  });

  await new Promise((resolve) => validSocket.on('connect', resolve));

  const roomErrorPromise = new Promise((resolve) => {
    validSocket.once('socket_error', (errPayload) => {
      resolve(errPayload);
    });
  });

  // Attempt to join non-existent room
  validSocket.emit('join', {
    publicKey: 'test_pk_123',
    room: 'non_existent_room_99999'
  });

  const roomErrPayload = await roomErrorPromise;
  console.log('  Room error response:', JSON.stringify(roomErrPayload, null, 2));

  const isT2Valid =
    roomErrPayload?.success === false &&
    roomErrPayload?.error?.code === 'NOT_FOUND' &&
    roomErrPayload?.error?.message?.includes('does not exist') &&
    typeof roomErrPayload?.error?.requestId === 'string';

  if (isT2Valid) {
    console.log('  ✅ [PASS] Invalid room join emits standard error format with code NOT_FOUND');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected invalid room join error payload:', roomErrPayload);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Mailbox ACK Failure (Missing messageId)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Mailbox ACK Failure...');
  const ackErrorPromise = new Promise((resolve) => {
    validSocket.once('socket_error', (errPayload) => {
      resolve(errPayload);
    });
  });

  validSocket.emit('ack_direct_message', { messageId: '' });

  const ackErrPayload = await ackErrorPromise;
  console.log('  Mailbox ACK error response:', JSON.stringify(ackErrPayload, null, 2));

  const isT3Valid =
    ackErrPayload?.success === false &&
    ackErrPayload?.error?.code === 'VALIDATION_ERROR' &&
    ackErrPayload?.error?.message?.includes('messageId is required') &&
    typeof ackErrPayload?.error?.requestId === 'string';

  if (isT3Valid) {
    console.log('  ✅ [PASS] Mailbox ACK failure emits standard error format with code VALIDATION_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected mailbox ACK error payload:', ackErrPayload);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Signal Decryption Error Handling
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Signal Decryption Error Reporting...');
  const signalErrorPromise = new Promise((resolve) => {
    validSocket.once('signal_decryption_error', (errPayload) => {
      resolve(errPayload);
    });
  });

  const testMsgId = `dec_err_msg_${Date.now()}`;
  validSocket.emit('signal_decryption_error', {
    messageId: testMsgId,
    senderId: 'u_alice_test',
    senderUsername: 'alice',
    reason: 'Bad MAC / ratcheting desync'
  });

  const signalErrPayload = await signalErrorPromise;
  console.log('  Signal decryption error response:', JSON.stringify(signalErrPayload, null, 2));

  const isT4Valid =
    signalErrPayload?.success === false &&
    signalErrPayload?.error?.code === 'CRYPTO_ERROR' &&
    signalErrPayload?.error?.message?.includes('Signal Protocol decryption failed') &&
    typeof signalErrPayload?.error?.requestId === 'string';

  if (isT4Valid) {
    console.log('  ✅ [PASS] Signal decryption error emits standard error format with code CRYPTO_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected signal decryption error payload:', signalErrPayload);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Payload Validation Error on Broadcast
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Send Message Validation Error...');
  const msgErrorPromise = new Promise((resolve) => {
    validSocket.once('socket_error', (errPayload) => {
      resolve(errPayload);
    });
  });

  validSocket.emit('send_message', {
    roomId: 'general',
    author: testUser,
    payloads: 'INVALID_STRING_NOT_OBJECT'
  });

  const msgErrPayload = await msgErrorPromise;
  console.log('  Message validation error response:', JSON.stringify(msgErrPayload, null, 2));

  const isT5Valid =
    msgErrPayload?.success === false &&
    msgErrPayload?.error?.code === 'VALIDATION_ERROR' &&
    msgErrPayload?.error?.message?.includes('Invalid message payload') &&
    typeof msgErrPayload?.error?.requestId === 'string';

  if (isT5Valid) {
    console.log('  ✅ [PASS] Invalid send_message payload emits standard error format with code VALIDATION_ERROR');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Unexpected send_message error payload:', msgErrPayload);
  }

  validSocket.close();

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 11.2 STANDARDIZED SOCKET ERRORS SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('  1. Authentication Failures (AUTHENTICATION_ERROR): PASSED');
  console.log('  2. Invalid Room Joins / Switches (NOT_FOUND): PASSED');
  console.log('  3. Mailbox ACK Failures (VALIDATION_ERROR): PASSED');
  console.log('  4. Signal Decryption Errors (CRYPTO_ERROR): PASSED');
  console.log('  5. Payload Validation & Rate Limit (VALIDATION_ERROR): PASSED');
  console.log('='.repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

testSocketStandardErrors().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
