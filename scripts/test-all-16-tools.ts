import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from '../src/app.module.js';

async function runAll16ToolsTest() {
  console.log('===========================================================');
  console.log('🧪 TESTING ALL 16 PRODUCTION TOOLS LOCALLY');
  console.log('===========================================================\n');

  const server = await McpApplicationFactory.create(AppModule);

  const tools = (server as any).toolsRegistry || (server as any).tools;
  async function callTool(name: string, args: Record<string, any>) {
    let toolInstance: any;
    if (tools instanceof Map) {
      toolInstance = tools.get(name);
    } else if (Array.isArray(tools)) {
      toolInstance = tools.find((t: any) => t.name === name);
    } else if (tools && typeof tools === 'object') {
      toolInstance = tools[name];
    }

    if (!toolInstance) {
      throw new Error(`Tool "${name}" not found in MCP registry`);
    }

    console.log(`\n───────────────────────────────────────────────────────────`);
    console.log(`▶ [TOOL TEST] Calling: ${name}`);
    console.log(`  Input: ${JSON.stringify(args)}`);
    const startTime = Date.now();
    const result = await toolInstance.execute(args, { sessionId: 'local-test-session' });
    const duration = Date.now() - startTime;
    console.log(`✔ [SUCCESS] ${name} (${duration}ms)`);
    console.log(`  Output summary:`, result.userFacing ? (typeof result.userFacing === 'string' ? result.userFacing.substring(0, 120) + '...' : result.userFacing) : result.ok || 'OK');
    return result;
  }

  const results: { tool: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];

  async function testStep(name: string, args: Record<string, any>, validator?: (res: any) => boolean) {
    try {
      const res = await callTool(name, args);
      if (validator && !validator(res)) {
        throw new Error(`Output validation failed for tool ${name}`);
      }
      results.push({ tool: name, status: 'PASS' });
      return res;
    } catch (err: any) {
      console.error(`❌ [FAILURE] ${name}:`, err.message);
      results.push({ tool: name, status: 'FAIL', error: err.message });
      return null;
    }
  }

  // 1. Health Probe
  await testStep('hq_ping', { message: 'Local runner ping' }, (r) => r?.ok === true);

  // 2. Authentication Flow: send_customer_otp
  await testStep('send_customer_otp', { identifier: '+919503760623' }, (r) => r?.internal?.sent === true);

  // 3. Authentication Flow: verify_customer_otp
  await testStep('verify_customer_otp', { identifier: '+919503760623', code: '624993' }, (r) => r?.internal?.verified === true);

  // 4. Policy Servicing: get_policy_details
  await testStep('get_policy_details', { ticketId: 'HQ-DEMO-001' }, (r) => r?.internal?.policyNumber === 'HQ-POL-88421');

  // 5. Servicing Checklist: get_pending_servicing_tasks
  await testStep('get_pending_servicing_tasks', { ticketId: 'HQ-DEMO-001' }, (r) => r?.internal?.ticketId === 'HQ-DEMO-001');

  // 6. Renewal Flow: get_renewal_property_details
  await testStep('get_renewal_property_details', { ticketId: 'HQ-DEMO-001' }, (r) => r?.internal?.propertyAttributes !== undefined);

  // 7. Servicing COI: send_certificate_of_insurance
  await testStep('send_certificate_of_insurance', { ticketId: 'HQ-DEMO-001', email: 'hemantj@wekancode.com' }, (r) => r?.internal?.sent === true);

  // 8. DocuSign: hq_docusign_send
  await testStep('hq_docusign_send', { ticketId: 'HQ-DEMO-001', delivery: 'direct' }, (r) => r?.success === true);

  // 9. DocuSign: hq_docusign_status
  await testStep('hq_docusign_status', { ticketId: 'HQ-DEMO-001' }, (r) => r?.success === true);

  // 10. Payment: hq_stripe_create_payment_link
  const stripeRes = await testStep('hq_stripe_create_payment_link', {
    ticketId: 'HQ-DEMO-001',
    carrier: 'Citizens Property Insurance',
    premiumAmount: 1842.0,
  }, (r) => !!r?.internal?.checkoutUrl);

  // 11. Payment: hq_stripe_payment_status
  const sessionId = stripeRes?.internal?.checkoutSessionId || 'cs_test_mock_123';
  await testStep('hq_stripe_payment_status', {
    ticketId: 'HQ-DEMO-001',
    sessionId: sessionId,
  });

  // 12. Escalation: request_underwriting_review
  await testStep('request_underwriting_review', {
    ticketId: 'HQ-DEMO-001',
    requestedCoverageA: 650000,
    carrier: 'Citizens Property Insurance',
  }, (r) => r?.internal?.hasHitlPause === true);

  // 13. Insurance Sales: fetch_user_and_products
  let quoteUserRes = await testStep('fetch_user_and_products', {
    name: 'Jordan Mitchell',
    email: 'hemantj@wekancode.com',
    address: '1244 Ocean Drive, Miami Beach, FL 33139',
    phone: '+13055550199',
  });

  // 14. Insurance Sales: fetch_quote
  let quoteRes = await testStep('fetch_quote', {
    userId: quoteUserRes?.internal?.userId || '6ad9bd5dcfc164fb5ece28e1',
    formId: 1,
    address: '1244 Ocean Drive, Miami Beach, FL 33139',
  });

  const quoteId = quoteRes?.internal?.quoteId || 1001;

  // 15. Insurance Sales: recalculate_quote
  await testStep('recalculate_quote', {
    quoteId: quoteId,
    userId: quoteUserRes?.internal?.userId || '6ad9bd5dcfc164fb5ece28e1',
    stateId: 1,
    formId: 1,
    address: '1244 Ocean Drive, Miami Beach, FL 33139',
    apt: '',
    lot: '',
    propertyAttributes: {
      YearBuilt: 2015,
      LivingArea: 2400,
      type_Dwelling: 1,
      NumberOfStories: 2,
      YearRoofUpdated: 2021,
      type_RoofingMaterial: 2,
      type_Roof: 1,
      type_Construction: 1,
      type_Foundation: 1,
      type_Pool: 3,
    },
  });

  // 16. Insurance Sales: show_quote_rates
  await testStep('show_quote_rates', {
    quoteId: quoteId,
    formattedAddress: '1244 Ocean Drive, Miami Beach, FL 33139',
  }, (r) => r?.internal?.quoteId === quoteId);

  console.log('\n===========================================================');
  console.log('📊 TEST RESULTS REPORT');
  console.log('===========================================================');
  let passCount = 0;
  for (const res of results) {
    if (res.status === 'PASS') {
      console.log(`  ✅ ${res.tool.padEnd(32)} PASS`);
      passCount++;
    } else {
      console.log(`  ❌ ${res.tool.padEnd(32)} FAIL: ${res.error}`);
    }
  }
  console.log(`\nTotal: ${passCount} / ${results.length} tools passed.`);
  console.log('===========================================================\n');

  if (passCount === results.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAll16ToolsTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
