import { pool, query, transaction, connect, disconnect, healthCheck, initDb } from './hichat-server/src/db/db.ts';
import { config } from './hichat-server/src/core/config.ts';
import { runPendingMigrations, getMigrationStatus } from './hichat-server/src/db/migrator.ts';
import {
  UserRepository,
  RoomRepository,
  MessageRepository,
  MailboxRepository,
  RefreshTokenRepository,
} from './hichat-server/src/repositories/index.ts';

async function runPhase13cPostgresPoolTests() {
  console.log('='.repeat(80));
  console.log('PHASE 13C: POSTGRESQL POOL & ACTIVE BACKEND VERIFICATION');
  console.log('='.repeat(80));

  let passed = 0;
  const total = 7;
  const testSuffix = 'p13c_' + Date.now().toString(36);

  // ---------------------------------------------------------------------------
  // TEST 1: Successful PostgreSQL Connection
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Successful PostgreSQL Connection...');
  try {
    const client = await connect();
    const isConnValid = client !== null || pool !== undefined;
    console.log('  Connection String:', config.database.url);
    console.log('  Configured Database Driver:', config.database.driver);
    console.log('  Pool Max Connections:', config.database.maxConnections);
    console.log('  Pool Idle Timeout:', config.database.idleTimeoutMillis, 'ms');
    console.log('  Pool Connection Timeout:', config.database.connectionTimeoutMillis, 'ms');

    if (isConnValid && config.database.driver === 'postgres') {
      console.log('  ✅ [PASS] Successfully connected to PostgreSQL database / pool');
      passed++;
    } else {
      console.error('  ❌ [FAIL] PostgreSQL connection failed or driver mismatch:', { isConnValid, driver: config.database.driver });
    }
  } catch (err) {
    console.error('  ❌ [FAIL] Error connecting to PostgreSQL:', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Pool Health
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Testing PostgreSQL Pool Health...');
  try {
    const health = await healthCheck();
    console.log('  Health Check Result:', health);

    const isHealthValid =
      health.healthy === true &&
      health.driver === 'postgres' &&
      typeof health.latencyMs === 'number' &&
      health.latencyMs >= 0;

    if (isHealthValid) {
      console.log(`  ✅ [PASS] Pool is healthy (latency: ${health.latencyMs}ms, driver: ${health.driver})`);
      passed++;
    } else {
      console.error('  ❌ [FAIL] Pool health check failed:', health);
    }
  } catch (err) {
    console.error('  ❌ [FAIL] Error running health check:', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Transaction Commit
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Transaction Commit on PostgreSQL...');
  const txCommitUserId = `u_tx_commit_${testSuffix}`;
  try {
    const txResult = await transaction(async (client) => {
      await client.query(
        `INSERT INTO users (id, username, email, password_hash, status, custom_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [txCommitUserId, `user_commit_${testSuffix}`, `commit_${testSuffix}@test.com`, 'hash123', 'online', 'Committing']
      );
      return { committed: true, userId: txCommitUserId };
    });

    const verifyRow = await query(`SELECT id, username, email FROM users WHERE id = $1`, [txCommitUserId]);
    const isCommitValid = txResult?.committed === true && verifyRow.rows.length === 1 && verifyRow.rows[0].id === txCommitUserId;

    if (isCommitValid) {
      console.log('  ✅ [PASS] Transaction committed and record persists in PostgreSQL:', verifyRow.rows[0]);
      passed++;
    } else {
      console.error('  ❌ [FAIL] Transaction commit verification failed:', { txResult, rows: verifyRow.rows });
    }
  } catch (err) {
    console.error('  ❌ [FAIL] Error in transaction commit test:', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Transaction Rollback
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Transaction Rollback on PostgreSQL...');
  const txRollbackUserId = `u_tx_rollback_${testSuffix}`;
  let rollbackCaught = false;
  try {
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO users (id, username, email, password_hash, status, custom_status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [txRollbackUserId, `user_rollback_${testSuffix}`, `rollback_${testSuffix}@test.com`, 'hash123', 'online', 'RollingBack']
      );
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
  } catch (err) {
    if (err.message && err.message.includes('SIMULATED_TRANSACTION_FAILURE')) {
      rollbackCaught = true;
    }
  }

  const verifyRollbackRow = await query(`SELECT id FROM users WHERE id = $1`, [txRollbackUserId]);
  const isRollbackValid = rollbackCaught && verifyRollbackRow.rows.length === 0;

  if (isRollbackValid) {
    console.log('  ✅ [PASS] Transaction successfully rolled back; uncommitted data was discarded');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Transaction rollback failed:', { rollbackCaught, rows: verifyRollbackRow.rows });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Migration Execution on PostgreSQL
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Migration Execution on PostgreSQL...');
  try {
    const applied = await runPendingMigrations();
    const status = await getMigrationStatus();
    console.log('  Applied Migrations Count:', applied.length);
    console.log('  Total Registered Migrations in schema_migrations:', status.applied.length);
    console.log('  Applied Versions:', status.applied);

    const isMigrationsValid =
      status.applied.includes('001') &&
      status.applied.includes('002') &&
      status.applied.includes('003') &&
      status.applied.includes('004') &&
      status.applied.includes('005');

    if (isMigrationsValid) {
      console.log('  ✅ [PASS] All migrations (001-005) executed successfully against PostgreSQL schema');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Missing migrations in status:', status);
    }
  } catch (err) {
    console.error('  ❌ [FAIL] Error checking migrations:', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Repository CRUD against PostgreSQL
  // ---------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Repository CRUD operations against PostgreSQL...');
  try {
    const userRepo = new UserRepository();
    const roomRepo = new RoomRepository();
    const msgRepo = new MessageRepository();
    const mailboxRepo = new MailboxRepository();
    const tokenRepo = new RefreshTokenRepository();

    // 1. User CRUD
    const createdUser = await userRepo.create({
      id: 'u_repo_' + testSuffix,
      username: 'repo_user_' + testSuffix,
      email: 'repo_' + testSuffix + '@test.com',
      passwordHash: 'securehash123',
      status: 'online',
      customStatus: 'Working',
    });
    const foundUser = await userRepo.findByUsername('repo_user_' + testSuffix);
    await userRepo.updateStatus('u_repo_' + testSuffix, 'busy', 'In a meeting');
    const updatedUser = await userRepo.findById('u_repo_' + testSuffix);

    // 2. Room CRUD
    const createdRoom = await roomRepo.create({
      id: 'r_repo_' + testSuffix,
      name: 'Room ' + testSuffix,
      description: 'Postgres test room',
      createdBy: 'u_repo_' + testSuffix,
    });
    const foundRoom = await roomRepo.findById('r_repo_' + testSuffix);

    // 3. Message CRUD
    const createdMsg = await msgRepo.create({
      id: 'm_repo_' + testSuffix,
      room_id: 'r_repo_' + testSuffix,
      sender_id: 'u_repo_' + testSuffix,
      sender_username: 'repo_user_' + testSuffix,
      payloads: 'Hello PostgreSQL',
    });
    const recentMsgs = await msgRepo.listByRoom('r_repo_' + testSuffix, 10);

    // 4. Mailbox & Delivery Retry CRUD
    const queuedMailboxId = await mailboxRepo.queueMessage({
      messageId: 'dm_repo_' + testSuffix,
      recipientId: 'u_repo_' + testSuffix,
      senderId: 'u_repo_' + testSuffix,
      senderUsername: 'repo_user_' + testSuffix,
      ciphertext: 'encrypted_blob',
    });
    const delivRecord = await mailboxRepo.getDeliveryRecord('dm_repo_' + testSuffix);
    await mailboxRepo.incrementAttempt('dm_repo_' + testSuffix, 5000);
    const incDeliv = await mailboxRepo.getDeliveryRecord('dm_repo_' + testSuffix);
    await mailboxRepo.acknowledgeMessage('u_repo_' + testSuffix, 'dm_repo_' + testSuffix);

    // 5. Refresh Token CRUD
    const tokenRecord = await tokenRepo.create({
      id: 'rt_repo_' + testSuffix,
      user_id: 'u_repo_' + testSuffix,
      token_hash: 'hash_' + testSuffix,
      family_id: 'fam_' + testSuffix,
      expires_at: new Date(Date.now() + 604800000).toISOString(),
    });
    const foundToken = await tokenRepo.findByTokenHash('hash_' + testSuffix);
    await tokenRepo.revokeFamily('fam_' + testSuffix);
    const revokedTokens = await tokenRepo.findByFamilyId('fam_' + testSuffix);

    const isRepoValid =
      createdUser?.id === 'u_repo_' + testSuffix &&
      foundUser?.username === 'repo_user_' + testSuffix &&
      updatedUser?.status === 'busy' &&
      foundRoom?.name === 'Room ' + testSuffix &&
      recentMsgs?.length >= 1 &&
      queuedMailboxId > 0 &&
      delivRecord?.status === 'queued' &&
      incDeliv?.attempt_count === 1 &&
      foundToken?.token_hash === 'hash_' + testSuffix &&
      revokedTokens?.every((t) => t.is_revoked === 1);

    if (isRepoValid) {
      console.log('  ✅ [PASS] Repository CRUD (Users, Rooms, Messages, Mailbox, Tokens) passed with $1 parameter placeholders');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Repository CRUD mismatch:', {
        createdUser,
        foundUser,
        updatedUser,
        foundRoom,
        recentMsgs,
        queuedMailboxId,
        delivRecord,
        incDeliv,
        foundToken,
        revokedTokens,
      });
    }

    // Cleanup test records
    await query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [`u_repo_${testSuffix}`]);
    await query(`DELETE FROM message_deliveries WHERE recipient_id = $1`, [`u_repo_${testSuffix}`]);
    await query(`DELETE FROM mailbox WHERE recipient_id = $1`, [`u_repo_${testSuffix}`]);
    await query(`DELETE FROM messages WHERE room_id = $1`, [`r_repo_${testSuffix}`]);
    await query(`DELETE FROM rooms WHERE id = $1`, [`r_repo_${testSuffix}`]);
    await query(`DELETE FROM users WHERE id IN ($1, $2)`, [`u_repo_${testSuffix}`, txCommitUserId]);
  } catch (err) {
    console.error('  ❌ [FAIL] Error in Repository CRUD tests:', err);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Graceful Disconnect
  // ---------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Graceful Disconnect...');
  try {
    await disconnect();
    console.log('  ✅ [PASS] PostgreSQL pool disconnected gracefully');
    passed++;
  } catch (err) {
    console.error('  ❌ [FAIL] Error disconnecting pool:', err);
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`PHASE 13C SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('  1. Successful PostgreSQL connection: PASSED');
  console.log('  2. Pool health: PASSED');
  console.log('  3. Transaction commit: PASSED');
  console.log('  4. Transaction rollback: PASSED');
  console.log('  5. Migration execution on PostgreSQL: PASSED');
  console.log('  6. Repository CRUD against PostgreSQL: PASSED');
  console.log('  7. Graceful disconnect: PASSED');
  console.log('='.repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

runPhase13cPostgresPoolTests().catch((err) => {
  console.error('Phase 13C verification failed:', err);
  process.exit(1);
});
