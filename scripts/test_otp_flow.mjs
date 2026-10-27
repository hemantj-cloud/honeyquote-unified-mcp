import dotenv from 'dotenv';
dotenv.config();

import { ServicingAuthService } from '../dist/modules/servicing/servicing.auth.service.js';

async function runTests() {
  console.log('--- STARTING HONEYQUOTE OTP FLOW TESTS ---\n');
  const auth = new ServicingAuthService();

  const codesToTest = ['489923', '182055', '772901', '624993'];
  let passed = 0;
  let total = 0;

  // Test 1: Challenge creation rotation
  total++;
  const challenge1 = await auth.createOtpChallenge('+919503760623');
  console.log(`[Test 1] Generated Challenge Code: ${challenge1.code}`);
  if (codesToTest.includes(challenge1.code)) {
    console.log('✓ Challenge code belongs to approved production pool');
    passed++;
  } else {
    console.error(`✗ Challenge code ${challenge1.code} not in approved pool`);
  }

  // Test 2-5: Test each of the 4 OTP codes directly
  for (const code of codesToTest) {
    total++;
    await auth.createOtpChallenge('+919503760623');
    const res = await auth.verifyOtp('+919503760623', code, `test-session-${code}`);
    if (res.verified && res.ticketId === 'HQ-DEMO-001' && res.customerName === 'Jordan Mitchell') {
      console.log(`✓ Code ${code} successfully authenticated session`);
      passed++;
    } else {
      console.error(`✗ Code ${code} failed verification:`, res);
    }
  }

  // Test 6: Invalid code rejection
  total++;
  await auth.createOtpChallenge('+919503760623');
  const invalidRes = await auth.verifyOtp('+919503760623', '000000', 'invalid-session');
  if (!invalidRes.verified && invalidRes.error?.includes('invalid or expired')) {
    console.log(`✓ Invalid code 000000 correctly rejected with message: "${invalidRes.error}"`);
    passed++;
  } else {
    console.error('✗ Invalid code was not handled as expected:', invalidRes);
  }

  // Test 7: Normalization test (+919503760623 -> 9503760623)
  total++;
  await auth.createOtpChallenge('+91 95037 60623');
  const normRes = await auth.verifyOtp('9503760623', '489923', 'norm-session-1');
  if (normRes.verified) {
    console.log('✓ Normalization (+91 95037 60623 challenge -> 9503760623 verify) succeeded');
    passed++;
  } else {
    console.error('✗ Normalization failed:', normRes);
  }

  // Test 8: Normalization test (raw digits -> international prefix)
  total++;
  await auth.createOtpChallenge('9503760623');
  const normRes2 = await auth.verifyOtp('+919503760623', '772901', 'norm-session-2');
  if (normRes2.verified) {
    console.log('✓ Normalization (9503760623 challenge -> +919503760623 verify) succeeded');
    passed++;
  } else {
    console.error('✗ Normalization 2 failed:', normRes2);
  }

  // Test 9: Active authenticated session state
  total++;
  if (auth.isSessionAuthenticated('norm-session-2')) {
    console.log(`✓ Session isSessionAuthenticated confirmed. Ticket ID: ${auth.getVerifiedTicketId('norm-session-2')}`);
    passed++;
  } else {
    console.error('✗ Session not marked authenticated');
  }

  // Test 10: Email identifier routes to email channel
  total++;
  const emailChallenge = await auth.createOtpChallenge('hemantj@wekancode.com');
  if (emailChallenge.channel === 'email' && codesToTest.includes(emailChallenge.code)) {
    console.log(`✓ Email identifier produced email-channel challenge with pooled code ${emailChallenge.code}`);
    passed++;
  } else {
    console.error('✗ Email challenge did not report email channel:', emailChallenge);
  }

  // Test 11: Email identifier verifies via issued challenge code
  total++;
  const emailVerify = await auth.verifyOtp('hemantj@wekancode.com', emailChallenge.code, 'email-session-1');
  if (emailVerify.verified && emailVerify.ticketId === 'HQ-DEMO-001') {
    console.log('✓ Email challenge code successfully authenticated session');
    passed++;
  } else {
    console.error('✗ Email challenge code failed verification:', emailVerify);
  }

  // Test 12: Email normalization (case + whitespace)
  total++;
  const mixedChallenge = await auth.createOtpChallenge('  HemantJ@Wekancode.COM ');
  const mixedVerify = await auth.verifyOtp('hemantj@wekancode.com', mixedChallenge.code, 'email-session-2');
  if (mixedChallenge.channel === 'email' && mixedVerify.verified) {
    console.log('✓ Email normalization (mixed case/whitespace) succeeded');
    passed++;
  } else {
    console.error('✗ Email normalization failed:', { challenge: mixedChallenge, verify: mixedVerify });
  }

  // Test 13: requestOtp degrades gracefully without a servicing backend
  total++;
  const reqResult = await auth.requestOtp('customer@example.com');
  if (reqResult.channel === 'email' && reqResult.sent === false) {
    console.log('✓ requestOtp returns channel + soft-fail when servicing API is unreachable');
    passed++;
  } else {
    console.error('✗ requestOtp did not degrade gracefully:', reqResult);
  }

  console.log(`\n--- TEST SUMMARY: ${passed}/${total} PASSED ---`);
  if (passed === total) {
    console.log('ALL TESTS PASSED WITH 100% FIDELITY!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
