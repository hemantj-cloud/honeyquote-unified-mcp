import 'dotenv/config';
import { McpApplicationFactory } from '@nitrostack/core';
import { AppModule } from '../src/app.module.js';

async function verify() {
  console.log('--- Verifying HoneyQuote Unified MCP Server ---');
  const server = await McpApplicationFactory.create(AppModule);

  // Introspect registered tools
  const tools = (server as any).tools || (server as any).toolsRegistry || [];
  console.log(`✓ MCP Server instance created successfully.`);
  
  // If tools map or array is available
  let toolNames: string[] = [];
  if (Array.isArray(tools)) {
    toolNames = tools.map((t: any) => t.name);
  } else if (tools instanceof Map) {
    toolNames = Array.from(tools.keys());
  } else if (typeof tools === 'object') {
    toolNames = Object.keys(tools);
  }

  console.log(`✓ Registered Tools Count: ${toolNames.length}`);
  console.log('✓ Registered Tools:', toolNames);

  // Expected 16 production tools
  const expectedTools = [
    'fetch_user_and_products',
    'fetch_quote',
    'recalculate_quote',
    'show_quote_rates',
    'send_customer_otp',
    'verify_customer_otp',
    'get_policy_details',
    'get_pending_servicing_tasks',
    'get_renewal_property_details',
    'send_certificate_of_insurance',
    'hq_docusign_send',
    'hq_docusign_status',
    'hq_stripe_create_payment_link',
    'hq_stripe_payment_status',
    'request_underwriting_review',
    'hq_ping',
  ];

  let missing: string[] = [];
  for (const expected of expectedTools) {
    if (!toolNames.includes(expected)) {
      missing.push(expected);
    }
  }

  if (missing.length === 0) {
    console.log('\n🎉 ALL 16 PRODUCTION TOOLS SUCCESSFULLY REGISTERED!');
  } else {
    console.warn('\n⚠️ Missing expected tools:', missing);
  }

  process.exit(0);
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
