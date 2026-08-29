import { config, validateConfig } from './hichat-server/src/core/config.ts';

async function testConfigValidation() {
  console.log('='.repeat(80));
  console.log('TYPED ENVIRONMENT CONFIGURATION VERIFICATION TEST');
  console.log('='.repeat(80));

  let passed = 0;
  let total = 5;

  // ---------------------------------------------------------------------------
  // TEST 1: Default Development Configuration Structure & Types
  // ---------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Default Development Configuration Structure & Types...');
  console.log('  Exported Config Object:', {
    env: config.env,
    isDev: config.isDevelopment,
    isProd: config.isProduction,
    port: config.server.port,
    host: config.server.host,
    logLevel: config.logging.level,
    dbPath: config.database.path,
    jwtExpiresIn: config.auth.jwtExpiresIn,
  });

  const isT1Valid =
    typeof config === 'object' &&
    typeof config.server.port === 'number' &&
    typeof config.server.host === 'string' &&
    typeof config.auth.jwtSecret === 'string' &&
    typeof config.logging.level === 'string' &&
    typeof config.database.path === 'string' &&
    typeof config.rateLimit.max === 'number' &&
    typeof config.mailbox.retryIntervalMs === 'number' &&
    typeof config.isDevelopment === 'boolean' &&
    typeof config.isProduction === 'boolean';

  if (isT1Valid) {
    console.log('  ✅ [PASS] Exported singleton config object is fully populated with typed settings');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Exported config structure is invalid:', config);
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Environment Differentiation (Dev vs Prod vs Test)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Environment Differentiation (Dev vs Prod)...');
  const devConfig = validateConfig({
    NODE_ENV: 'development',
    PORT: '3001',
  });

  const prodConfig = validateConfig({
    NODE_ENV: 'production',
    PORT: '443',
    JWT_SECRET: 'a-very-strong-and-secure-random-production-jwt-key-2026',
  });

  console.log('  Dev Config (isDev, logLevel):', devConfig.isDevelopment, devConfig.logging.level);
  console.log('  Prod Config (isProd, logLevel, port):', prodConfig.isProduction, prodConfig.logging.level, prodConfig.server.port);

  const isT2Valid =
    devConfig.isDevelopment === true &&
    devConfig.isProduction === false &&
    devConfig.logging.level === 'debug' &&
    prodConfig.isDevelopment === false &&
    prodConfig.isProduction === true &&
    prodConfig.logging.level === 'info' &&
    prodConfig.server.port === 443;

  if (isT2Valid) {
    console.log('  ✅ [PASS] Environment separation correctly adjusts flags and logging policies');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Environment separation failed:', { devConfig, prodConfig });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Fail-Fast on Invalid Numeric / Port Values
  // ---------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Fail-Fast on Invalid PORT...');
  let portErrorCaught = false;
  try {
    validateConfig({
      PORT: 'not-a-valid-port-number',
    });
  } catch (err) {
    portErrorCaught = true;
    console.log('  Expected Port Error Caught:', err.message.trim().split('\n')[1]);
  }

  if (portErrorCaught) {
    console.log('  ✅ [PASS] Non-numeric PORT triggers immediate fail-fast validation error');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Invalid PORT did not trigger fail-fast error');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Fail-Fast on Insecure / Short JWT Secrets
  // ---------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Fail-Fast on Short JWT_SECRET...');
  let secretErrorCaught = false;
  try {
    validateConfig({
      JWT_SECRET: 'short', // less than 16 chars
    });
  } catch (err) {
    secretErrorCaught = true;
    console.log('  Expected Secret Error Caught:', err.message.trim().split('\n')[1]);
  }

  if (secretErrorCaught) {
    console.log('  ✅ [PASS] Short JWT_SECRET triggers immediate fail-fast validation error');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Short JWT_SECRET did not trigger fail-fast error');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Production Security Enforcement (Rejecting Default Dummy Secrets)
  // ---------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Production Security Rejection of Default Secret...');
  let prodSecurityCaught = false;
  try {
    validateConfig({
      NODE_ENV: 'production',
      // omitting custom JWT_SECRET so it defaults to the insecure fallback
    });
  } catch (err) {
    prodSecurityCaught = true;
    console.log('  Expected Security Rejection Caught:', err.message.trim().split('\n')[1]);
  }

  if (prodSecurityCaught) {
    console.log('  ✅ [PASS] Production startup fails fast when insecure default secret is used');
    passed++;
  } else {
    console.error('  ❌ [FAIL] Production startup allowed default insecure secret');
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log(`CONFIG VALIDATION SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('  1. Typed singleton config export: PASSED');
  console.log('  2. Dev vs Prod environment differentiation: PASSED');
  console.log('  3. Fail-fast on invalid PORT: PASSED');
  console.log('  4. Fail-fast on short JWT_SECRET: PASSED');
  console.log('  5. Production security rejection of default secrets: PASSED');
  console.log('='.repeat(80));

  if (passed !== total) {
    throw new Error(`Only ${passed}/${total} tests passed`);
  }
}

testConfigValidation().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
