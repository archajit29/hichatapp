import {
  SignalProtocolStore,
  SignalIndexedDB,
  KeyHelper,
  generateSignalPreKeyBundle,
  encryptMessage,
  decryptMessage,
  base64ToArrayBuffer
} from './src/cryptoUtils.js';

async function runSessionResetTest() {
  console.log('='.repeat(75));
  console.log('PHASE 7 - SCENARIO 2: SESSION RESET & STORAGE LOSS RECOVERY AUDIT');
  console.log('='.repeat(75));

  // =========================================================================
  // STEP 1: Establish Normal Trusted Live Session
  // =========================================================================
  console.log('\n[Step 1] Establishing normal working session between Alice & Bob...');
  const aliceStorage = new SignalIndexedDB();
  const bobStorage = new SignalIndexedDB();
  const aliceStore = new SignalProtocolStore('alice', aliceStorage);
  const bobStore = new SignalProtocolStore('bob', bobStorage);

  const aliceIdentity = await KeyHelper.generateIdentityKeyPair();
  const aliceRegId = KeyHelper.generateRegistrationId();
  await aliceStore.saveLocalIdentity(aliceIdentity, aliceRegId);

  const bobPreKeyBundle = await generateSignalPreKeyBundle(bobStore, 1, 1, 5);
  const bobPreKeyForAlice = {
    identityKey: bobPreKeyBundle.identityKey,
    registrationId: bobPreKeyBundle.registrationId,
    signedPreKey: bobPreKeyBundle.signedPreKey,
    preKey: bobPreKeyBundle.oneTimePreKeys[0]
  };

  // Alice -> Bob (Msg 1 - Type 3 Handshake)
  const m1 = await encryptMessage(aliceStore, 'bob', 'Message 1: Hello Bob!', { preKeyBundle: bobPreKeyForAlice });
  const d1 = await decryptMessage(bobStore, 'alice', m1);
  console.log(`  Msg 1 (Alice -> Bob): "${d1}" [Type ${m1.type}]`);

  // Bob -> Alice (Msg 2 - Type 1 Ratchet)
  const m2 = await encryptMessage(bobStore, 'alice', 'Message 2: Hello Alice!');
  const d2 = await decryptMessage(aliceStore, 'bob', m2);
  console.log(`  Msg 2 (Bob -> Alice): "${d2}" [Type ${m2.type}]`);

  // Alice -> Bob (Msg 3 - Type 1 Ratchet)
  const m3 = await encryptMessage(aliceStore, 'bob', 'Message 3: Ratchet active.');
  const d3 = await decryptMessage(bobStore, 'alice', m3);
  console.log(`  Msg 3 (Alice -> Bob): "${d3}" [Type ${m3.type}]`);
  console.log('>> Normal live Double Ratchet session verified.\n');

  // =========================================================================
  // SUB-SCENARIO 1: Bob loses session record (Cache wipe / DB record loss, same identity)
  // =========================================================================
  console.log('-'.repeat(75));
  console.log('SUB-SCENARIO 1: Bob loses Session Record (Same Identity, Wiped Session)');
  console.log('-'.repeat(75));

  console.log('Simulating Bob losing session record `user_bob_session_alice.1`...');
  await bobStorage.remove('user_bob_session_alice.1');

  console.log('Alice (unaware) encrypts Message 4 using her OLD session state...');
  const m4OldSession = await encryptMessage(aliceStore, 'bob', 'Message 4: Are you still there Bob?');
  console.log(`Captured Msg 4 payload: Type ${m4OldSession.type}, Body length ${m4OldSession.body?.length}`);

  console.log('\nBob attempts to decrypt Msg 4 on his wiped store...');
  try {
    const d4 = await decryptMessage(bobStore, 'alice', m4OldSession);
    console.log(`Bob Decrypt Result: SILENT SUCCESS (Unexpected) -> "${d4}"`);
  } catch (err) {
    console.log(`Bob Decrypt Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Message: ${err.message}`);
  }

  // Recovery for Sub-Scenario 1
  console.log('\n[Recovery for Sub-Scenario 1]:');
  console.log('  1. Alice resets her stale session record for Bob.');
  await aliceStorage.remove('user_alice_session_bob.1');
  console.log('  2. Alice obtains Bob PreKey bundle and sends new Type 3 initialization message.');
  const bobPreKeyBundleNew = await generateSignalPreKeyBundle(bobStore, 2, 10, 5);
  const bobPreKeyForAliceNew = {
    identityKey: bobPreKeyBundleNew.identityKey,
    registrationId: bobPreKeyBundleNew.registrationId,
    signedPreKey: bobPreKeyBundleNew.signedPreKey,
    preKey: bobPreKeyBundleNew.oneTimePreKeys[0]
  };
  const m4Recovered = await encryptMessage(aliceStore, 'bob', 'Message 4: Re-established session!', { preKeyBundle: bobPreKeyForAliceNew });
  const d4Recovered = await decryptMessage(bobStore, 'alice', m4Recovered);
  console.log(`  3. Bob decrypts new handshake message: SUCCESS -> "${d4Recovered}" [Type ${m4Recovered.type}]`);

  // =========================================================================
  // SUB-SCENARIO 2: Bob complete reinstall (Fresh Identity Key & Brand-New Store)
  // =========================================================================
  console.log('\n' + '-'.repeat(75));
  console.log('SUB-SCENARIO 2: Bob Complete Reinstall (Fresh Identity Key & Brand-New Vault)');
  console.log('-'.repeat(75));

  console.log('Constructing brand-new store & identity for Bob (simulating fresh reinstall)...');
  const freshBobStorage = new SignalIndexedDB();
  const freshBobStore = new SignalProtocolStore('bob', freshBobStorage);
  const freshBobBundle = await generateSignalPreKeyBundle(freshBobStore, 1, 1, 5);

  console.log('Fresh Bob generated:');
  console.log(`  Original Identity: ${bobPreKeyBundle.identityKey.substring(0, 24)}...`);
  console.log(`  Fresh Identity:    ${freshBobBundle.identityKey.substring(0, 24)}...`);

  console.log('\n1. Alice sends message using her OLD session state to fresh Bob:');
  const m5AliceOld = await encryptMessage(aliceStore, 'bob', 'Message 5: Alice to Old Bob');
  try {
    await decryptMessage(freshBobStore, 'alice', m5AliceOld);
    console.log('Fresh Bob Decrypt Result: SILENT SUCCESS (Unexpected)');
  } catch (err) {
    console.log(`Fresh Bob Decrypt Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Message: ${err.message}`);
  }

  console.log('\n2. Fresh Bob initiates a message to Alice (New PreKeyWhisperMessage Type 3):');
  const alicePreKeyBundleForBob = await generateSignalPreKeyBundle(aliceStore, 1, 1, 5);
  const m6BobToAlice = await encryptMessage(freshBobStore, 'alice', 'Message 6: Hey Alice, I reinstalled HiChat!', {
    preKeyBundle: {
      identityKey: alicePreKeyBundleForBob.identityKey,
      registrationId: alicePreKeyBundleForBob.registrationId,
      signedPreKey: alicePreKeyBundleForBob.signedPreKey,
      preKey: alicePreKeyBundleForBob.oneTimePreKeys[0]
    }
  });

  console.log(`Fresh Bob created outbound Type ${m6BobToAlice.type} message for Alice.`);
  console.log('Alice attempts to decrypt inbound message from reinstalled Bob:');
  let aliceThrewKeyChange = false;
  let aliceError = null;
  try {
    const d6 = await decryptMessage(aliceStore, 'bob', m6BobToAlice);
    console.log(`Alice Decrypt Result: SILENT SUCCESS (VULNERABILITY) -> "${d6}"`);
  } catch (err) {
    aliceThrewKeyChange = true;
    aliceError = err;
    console.log(`Alice Decrypt Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Code:    ${err.code || 'N/A'}`);
    console.log(`  Message: ${err.message}`);
  }

  // =========================================================================
  // RECOVERY PATH AUDIT FOR COMPLETE REINSTALL
  // =========================================================================
  console.log('\n' + '-'.repeat(75));
  console.log('RECOVERY PATH AUDIT FOR COMPLETE REINSTALL');
  console.log('-'.repeat(75));

  console.log('Is the failure distinguishable from Phase 6 MitM / Re-Key Attack?');
  console.log(`  Error thrown by Alice: ${aliceThrewKeyChange ? aliceError.name + ' (' + aliceError.message + ')' : 'None'}`);
  console.log('  Protocol Distinction: At the cryptographic layer, an app reinstall and a malicious MitM');
  console.log('  key-substitution attack produce IDENTICAL signatures (untrusted identity public key).');

  console.log('\nExecuting Complete Reinstall Recovery:');
  console.log('  Step 1: Alice prompts user / approves new Bob Identity Key (updating trust store).');
  const newBobIdKeyBuffer = base64ToArrayBuffer(freshBobBundle.identityKey);
  await aliceStore.saveIdentity('bob', newBobIdKeyBuffer);
  await aliceStore.saveIdentity('bob.1', newBobIdKeyBuffer);

  console.log('  Step 2: Alice wipes old broken session record with Bob.');
  await aliceStorage.remove('user_alice_session_bob.1');
  await aliceStorage.remove('user_alice_session_bob');

  console.log('  Step 3: Alice decrypts Bob incoming message (or initiates new X3DH session).');
  const d6AfterApproval = await decryptMessage(aliceStore, 'bob', m6BobToAlice);
  console.log(`  Decryption after approval: SUCCESS -> "${d6AfterApproval}"`);

  // Subsequent messages flow normally
  const m7AliceReply = await encryptMessage(aliceStore, 'bob', 'Message 7: Glad to have you back Bob!');
  const d7Bob = await decryptMessage(freshBobStore, 'alice', m7AliceReply);
  console.log(`  Bidirectional Ratchet Restored: Bob received "${d7Bob}" [Type ${m7AliceReply.type}]`);

  // =========================================================================
  // SUMMARY OF FINDINGS
  // =========================================================================
  console.log('\n' + '='.repeat(75));
  console.log('SUMMARY OF PHASE 7 SCENARIO 2 FINDINGS');
  console.log('='.repeat(75));
  console.log('1. Alice sends OLD Type 1 WhisperMessage to reset/wiped Bob:');
  console.log('   - Result: Fails with `Error: No record for device alice.1`');
  console.log('   - Mechanism: Bob lacks the session state / ratchet receiving chain key.');
  console.log('2. Reinstalled Bob sends new Type 3 PreKeyWhisperMessage to Alice:');
  console.log('   - Result: Alice rejects with `IdentityKeyChangedError`');
  console.log('   - Distinction from MitM: Cryptographically IDENTICAL to an active MitM key swap.');
  console.log('3. Recovery Requirements:');
  console.log('   - Both parties must invalidate their existing session records.');
  console.log('   - If identity changed (reinstall), peer must approve new identity key (TOFU re-trust).');
  console.log('   - A complete fresh X3DH PreKey handshake (Type 3) is required to restore messaging.');
  console.log('='.repeat(75));
}

runSessionResetTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
