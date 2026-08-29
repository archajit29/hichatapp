import {
  SignalProtocolStore,
  SignalIndexedDB,
  KeyHelper,
  generateSignalPreKeyBundle,
  encryptMessage,
  decryptMessage,
  SessionCipher,
  SignalProtocolAddress
} from './src/cryptoUtils.js';

async function runReplayProtectionTest() {
  console.log('='.repeat(70));
  console.log('PHASE 7 - SCENARIO 1: DOUBLE RATCHET REPLAY PROTECTION TEST');
  console.log('='.repeat(70));

  // 1. Initialize stores for Alice and Bob
  console.log('\n[Step 1] Initializing SignalProtocolStores for Alice and Bob...');
  const aliceStorage = new SignalIndexedDB();
  const bobStorage = new SignalIndexedDB();
  const aliceStore = new SignalProtocolStore('alice', aliceStorage);
  const bobStore = new SignalProtocolStore('bob', bobStorage);

  // Generate Alice's identity keypair and registration ID
  const aliceIdentity = await KeyHelper.generateIdentityKeyPair();
  const aliceRegId = KeyHelper.generateRegistrationId();
  await aliceStore.saveLocalIdentity(aliceIdentity, aliceRegId);

  // 2. Bob generates prekey bundle
  console.log('\n[Step 2] Bob generates PreKey bundle (Identity Key, Signed PreKey, One-time PreKeys)...');
  const bobPreKeyBundle = await generateSignalPreKeyBundle(bobStore, 1, 1, 5);
  console.log('Bob PreKey Bundle generated:');
  console.log({
    identityKey: bobPreKeyBundle.identityKey.substring(0, 20) + '...',
    registrationId: bobPreKeyBundle.registrationId,
    signedPreKeyId: bobPreKeyBundle.signedPreKey.keyId,
    oneTimePreKeysCount: bobPreKeyBundle.oneTimePreKeys.length
  });

  const bobPreKeyForAlice = {
    identityKey: bobPreKeyBundle.identityKey,
    registrationId: bobPreKeyBundle.registrationId,
    signedPreKey: bobPreKeyBundle.signedPreKey,
    preKey: bobPreKeyBundle.oneTimePreKeys[0]
  };

  // =========================================================================
  // TEST PART A: Initial PreKeyWhisperMessage (Type 3) Replay Test
  // =========================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('TEST A: Replay of Initial PreKeyWhisperMessage (Type 3)');
  console.log('-'.repeat(70));

  const initialPlaintext = 'Hello Bob! This is message #1 from Alice.';
  console.log(`\nAlice encrypts initial message: "${initialPlaintext}"`);
  const initialCiphertext = await encryptMessage(aliceStore, 'bob', initialPlaintext, {
    preKeyBundle: bobPreKeyForAlice
  });

  console.log('\nCaptured Initial Ciphertext Object delivered to Bob:');
  console.log({
    type: initialCiphertext.type,
    registrationId: initialCiphertext.registrationId,
    body: typeof initialCiphertext.body === 'string'
      ? (initialCiphertext.body.substring(0, 30) + '... (length: ' + initialCiphertext.body.length + ')')
      : initialCiphertext.body
  });

  // Bob decrypts the first time
  console.log('\n[First Delivery] Bob calls decryptMessage()...');
  const firstDecrypted = await decryptMessage(bobStore, 'alice', initialCiphertext);
  console.log(`First Decrypt Result: SUCCESS -> "${firstDecrypted}"`);

  // Bob attempts to decrypt the EXACT SAME ciphertext a second time
  console.log('\n[Second Delivery - REPLAY] Deliberately redelivering EXACT SAME ciphertext to Bob...');
  console.log('Bypassing any application-level messageId deduplication, calling decryptMessage() directly...');

  let replayThrewErrorA = false;
  let replayErrorA = null;
  let replayResultA = null;

  try {
    replayResultA = await decryptMessage(bobStore, 'alice', initialCiphertext);
    console.log(`Replay Decrypt Result: SILENT SUCCESS (VULNERABILITY) -> "${replayResultA}"`);
  } catch (err) {
    replayThrewErrorA = true;
    replayErrorA = err;
    console.log(`Replay Decrypt Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Message: ${err.message}`);
  }

  // Also test direct SessionCipher call bypassing decryptMessage wrapper
  console.log('\n[Direct SessionCipher Test] Calling SessionCipher.decryptPreKeyWhisperMessage directly...');
  let directCipherResultA = null;
  try {
    const bobAddress = new SignalProtocolAddress('alice', 1);
    const cipher = new SessionCipher(bobStore, bobAddress);
    const rawBuffer = await cipher.decryptPreKeyWhisperMessage(initialCiphertext.body, 'binary');
    directCipherResultA = new TextDecoder().decode(rawBuffer);
    console.log(`Direct SessionCipher Result: SILENT SUCCESS -> "${directCipherResultA}"`);
  } catch (err) {
    console.log(`Direct SessionCipher Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Message: ${err.message}`);
  }

  // =========================================================================
  // TEST PART B: Subsequent Ratchet WhisperMessage (Type 1) Replay Test
  // =========================================================================
  console.log('\n' + '-'.repeat(70));
  console.log('TEST B: Replay of Subsequent WhisperMessage (Type 1 / Ratchet)');
  console.log('-'.repeat(70));

  // Bob replies to Alice to advance the Double Ratchet
  console.log('\nBob replies to Alice: "Hey Alice, received loud and clear!"');
  const bobReplyCiphertext = await encryptMessage(bobStore, 'alice', 'Hey Alice, received loud and clear!');
  const aliceDecryptedReply = await decryptMessage(aliceStore, 'bob', bobReplyCiphertext);
  console.log(`Alice decrypted Bob reply: "${aliceDecryptedReply}"`);

  // Alice sends message #2 (Type 1 WhisperMessage)
  const message2Text = 'Here is subsequent message #2 from Alice (Type 1).';
  console.log(`\nAlice encrypts message #2: "${message2Text}"`);
  const ciphertext2 = await encryptMessage(aliceStore, 'bob', message2Text);

  console.log('\nCaptured Subsequent Ciphertext Object:');
  console.log({
    type: ciphertext2.type,
    registrationId: ciphertext2.registrationId,
    body: typeof ciphertext2.body === 'string'
      ? (ciphertext2.body.substring(0, 30) + '... (length: ' + ciphertext2.body.length + ')')
      : ciphertext2.body
  });

  // Bob decrypts message #2 the first time
  console.log('\n[First Delivery] Bob calls decryptMessage() on message #2...');
  const firstDecrypted2 = await decryptMessage(bobStore, 'alice', ciphertext2);
  console.log(`First Decrypt Result: SUCCESS -> "${firstDecrypted2}"`);

  // Bob attempts to decrypt message #2 a second time (Replay)
  console.log('\n[Second Delivery - REPLAY] Deliberately redelivering message #2 ciphertext to Bob...');
  let replayThrewErrorB = false;
  let replayErrorB = null;
  let replayResultB = null;

  try {
    replayResultB = await decryptMessage(bobStore, 'alice', ciphertext2);
    console.log(`Replay Decrypt Result: SILENT SUCCESS (VULNERABILITY) -> "${replayResultB}"`);
  } catch (err) {
    replayThrewErrorB = true;
    replayErrorB = err;
    console.log(`Replay Decrypt Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Message: ${err.message}`);
  }

  // Also test direct SessionCipher call on Type 1 WhisperMessage
  console.log('\n[Direct SessionCipher Test] Calling SessionCipher.decryptWhisperMessage directly...');
  try {
    const bobAddress = new SignalProtocolAddress('alice', 1);
    const cipher = new SessionCipher(bobStore, bobAddress);
    const rawBuffer = await cipher.decryptWhisperMessage(ciphertext2.body, 'binary');
    const directResult = new TextDecoder().decode(rawBuffer);
    console.log(`Direct SessionCipher Result: SILENT SUCCESS -> "${directResult}"`);
  } catch (err) {
    console.log(`Direct SessionCipher Result: REJECTED WITH ERROR:`);
    console.log(`  Name:    ${err.name}`);
    console.log(`  Message: ${err.message}`);
  }

  // =========================================================================
  // SUMMARY & VERDICT
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY & PROTOCOL LEVEL FINDINGS:');
  console.log('='.repeat(70));
  console.log(`Type 3 (PreKeyWhisperMessage) Replay Rejected: ${replayThrewErrorA ? 'YES (Threw ' + replayErrorA?.name + ': ' + replayErrorA?.message + ')' : 'NO (SILENT SUCCESS)'}`);
  console.log(`Type 1 (WhisperMessage) Replay Rejected:        ${replayThrewErrorB ? 'YES (Threw ' + replayErrorB?.name + ': ' + replayErrorB?.message + ')' : 'NO (SILENT SUCCESS)'}`);
  console.log('='.repeat(70));
}

runReplayProtectionTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
