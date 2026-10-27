import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from '../src/app.module.js';

async function smokeTest() {
  console.log('\n=== RUNNING HONEYQUOTE UNIFIED MCP SMOKE TESTS ===\n');
  const server = await McpApplicationFactory.create(AppModule);

  // Helper to call tool by name
  async function callTool(name: string, args: Record<string, any>) {
    console.log(`\n▶ Calling tool: ${name}`);
    const tools = (server as any).toolsRegistry || (server as any).tools;
    let toolInstance: any;

    if (tools instanceof Map) {
      toolInstance = tools.get(name);
    } else if (Array.isArray(tools)) {
      toolInstance = tools.find((t: any) => t.name === name);
    } else if (tools && typeof tools === 'object') {
      toolInstance = tools[name];
    }

    if (!toolInstance) {
      throw new Error(`Tool ${name} not found in registry`);
    }

    const result = await toolInstance.execute(args, { sessionId: 'smoke-test-session' });
    console.log(`✔ Tool ${name} Response:`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Test 1: hq_ping
  const pingRes = await callTool('hq_ping', { message: 'Smoke test heartbeat' });
  if (!pingRes || pingRes.ok !== true) throw new Error('hq_ping failed');

  // Test 2: send_customer_otp
  const otpRes = await callTool('send_customer_otp', { identifier: '+919503760623' });
  if (!otpRes || !otpRes.userFacing.includes('verification code has been dispatched')) {
    throw new Error('send_customer_otp failed');
  }

  // Test 3: verify_customer_otp with demo bypass code 624993
  const verifyRes = await callTool('verify_customer_otp', {
    identifier: '+919503760623',
    code: '624993',
  });
  if (!verifyRes || verifyRes.internal?.verified !== true) {
    throw new Error('verify_customer_otp failed');
  }

  // Test 4: get_policy_details (Authenticated session)
  const policyRes = await callTool('get_policy_details', { ticketId: 'HQ-DEMO-001' });
  if (!policyRes || !policyRes.internal?.policyNumber) {
    throw new Error('get_policy_details failed');
  }

  // Test 5: request_underwriting_review (Flow 3 HITL pause)
  const hitlRes = await callTool('request_underwriting_review', {
    ticketId: 'HQ-DEMO-001',
    requestedCoverageA: 650000,
    carrier: 'Citizens Property Insurance',
  });
  if (hitlRes?.internal?.status !== 'PAUSED_HITL' || hitlRes?.internal?.hasHitlPause !== true) {
    throw new Error('request_underwriting_review failed to return PAUSED_HITL');
  }

  // Test 6: hq_stripe_create_payment_link
  const stripeRes = await callTool('hq_stripe_create_payment_link', {
    ticketId: 'HQ-DEMO-001',
    carrier: 'Citizens Property Insurance',
    premiumAmount: 1842.0,
  });
  if (!stripeRes || !stripeRes.internal?.checkoutUrl) {
    throw new Error('hq_stripe_create_payment_link failed');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL 6 SMOKE TESTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
  process.exit(0);
}

smokeTest().catch((err) => {
  console.error('\n❌ Smoke test failed:', err);
  process.exit(1);
});
