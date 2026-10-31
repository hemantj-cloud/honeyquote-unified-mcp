import { PromptDecorator as Prompt, ExecutionContext } from "@nitrostack/core";

import {
  DWELLING_TYPE_OPTIONS,
  POOL_TYPE_OPTIONS,
  ROOFING_MATERIAL_OPTIONS,
  ROOF_TYPE_OPTIONS,
  FOUNDATION_TYPE_OPTIONS,
  SWARM_VALUATION_FIELDS,
  SWARM_VALUATION_PROPERTY_PATH,
  type SwarmValuationPropertyAttributes,
} from "./insurance.types.js";

interface GetUserAndProductsArgs {
  name?: string;
  email: string;
  address: string;
  phone?: string;
}

interface CreateQuoteArgs {
  userId: string;
  formId: number;
  address: string;
}

interface RecalculateQuoteArgs {
  quoteId: number;
  userId: string;
  stateId: number;
  formId: number;
  address: string;
  propertyAttributes: SwarmValuationPropertyAttributes;
  apt?: string;
  lot?: string;
}

const PROPERTY_QUESTIONS_TEXT = SWARM_VALUATION_FIELDS.map(
  (field) =>
    `- ${SWARM_VALUATION_PROPERTY_PATH}.${field.key}: ${field.label}${
      field.example !== undefined ? ` (e.g. ${field.example})` : ""
    }`,
).join("\n");

const USER_FACING_RULES = `
USER-FACING RULES (homeowner conversation):
- Tools return "userFacing" (homeowner-safe) and "internal" (orchestration state, widget data).
- Your natural-language reply to the homeowner must use ONLY tool.userFacing. For policy cards the host renderer owns the separate tool.renewalInvitation text after the card; do not generate a duplicate invitation or expose field names. Never read or mention tool.internal in chat.
- Reply in plain English. No JSON in the homeowner message.
- NEVER mention quoteId, formId, userId, or stateId in chat (homeowners must not see internal IDs).
- List products using tool.userFacing.products (names only). Map the homeowner's choice to formId using tool.internal.products.
- For the next tool call, use tool.internal only. Never guess IDs.
- The rates widget is opened only by show_quote_rates (once per quote). fetch_quote and recalculate_quote do not mount the widget.
- Never invent contact details. Never call tools to create or register a user; always ask the homeowner for missing information first.
- WIDGET AND TEXT ORDERING DIRECTIVE (CRITICAL):
  * Policy presentation belongs to the host renderer: tool.userFacing first, then the policy card, then tool.renewalInvitation under the card. The widget does not send chat messages. Do not generate an extra invitation or create a user message to trigger it. Wait for consent; a yes to the renewal invitation (payment not yet complete) calls get_renewal_property_details with intent "renew", not fetch_quote. A later yes confirming unchanged home details calls hq_stripe_create_payment_link with the verified ticketId only. If update_renewal_property_details set propertyDetailsUpdated, call show_quote_rates once with nextToolArgs in that same turn, before replying. Do not wait for ok, yes, or any other reply. Add nothing. Wait for Continue before checkout. If payment is already complete, do not continue renewal: Sign Now on the policy card opens DocuSign from that card. A yes to the under-card signing invitation calls hq_docusign_send, which shows one card with the policy details and a single Sign Now button. If they ask for property or home details at any time, call get_renewal_property_details once with intent "view". That card is read-only: add nothing, and a yes does not start checkout or signing.
  * The interactive policy widget visually displays all policy details, carrier, policy number, term dates, coverages, and deductibles.
  * Do NOT dump or duplicate policy details, coverage lists, or deductibles in text. The tool supplies the userFacing introduction and the card widget displays the details visually. Leave assistant text empty.
- CARRIER SELECTION & PAYMENT CHECKOUT (STEP 4):
  * When the homeowner selects a carrier or clicks "Continue →" from the quotes comparison widget, or when hq_stripe_create_payment_link is invoked directly from the widget button:
  * NEVER say you cannot bind or complete a purchase.
  * Immediately call hq_stripe_create_payment_link with the selected carrier and premiumAmount plus the verified customer's ticketId and policyNumber. Never use placeholder IDs.
  * Present the userFacing introduction directing the homeowner to the checkout widget below to complete payment.
`.trim();

const IDENTITY_TOOL_GATING = `
IDENTITY & TOOL GATING (before calling fetch_user_and_products):
- Do NOT call fetch_user_and_products unless the homeowner has explicitly provided in the conversation: email, address, full name, and phone.
- NEVER invent, guess, or default email, name, address, or phone.
- If the homeowner says they do not have an email: do NOT call the tool. Ask how they would like to proceed and what information they can provide.
- If the homeowner asks you to "create a user", "sign me up", or "do it yourself": do NOT call the tool. Explain you need their details first, list what is missing, and wait for their reply.
- Only after they provide real values may you call fetch_user_and_products with those exact values.
- Do NOT describe or imply that you are creating or registering an account; this step only looks up an existing user and loads products.
- EXISTING CUSTOMER RENEWALS: For authenticated existing customers renewing an in-force policy, NEVER call fetch_user_and_products or ask for contact info. Present verified on-record property details for reconfirmation with get_renewal_property_details intent "renew". If nothing changed, a yes calls hq_stripe_create_payment_link with the verified ticketId only. If a detail was updated, call show_quote_rates once with nextToolArgs in that same turn. Do not wait for the customer to reply, and do not open checkout until the customer clicks Continue. A request to see property or home details at any time calls get_renewal_property_details once with intent "view". That card is read-only: a yes does not start checkout or signing.
`.trim();

const QUOTE_FLOW_ROUTING = `
QUOTE FLOW ROUTING (after fetch_quote — trust tool internal only, never guess):

| internal.needsPropertyDetails | internal.nextTool       | Required sequence |
|------------------------------|-------------------------|-------------------|
| false                        | show_quote_rates        | show_quote_rates only. NEVER recalculate_quote. |
| true                         | recalculate_quote       | collect 10 property answers → recalculate_quote → show_quote_rates |

Hard rules:
- Use internal.needsPropertyDetails and internal.nextTool from fetch_quote. Do not infer from city, address, or chat tone.
- needsPropertyDetails false means the API already has property data — recalculate is wrong and will confuse the flow.
- needsPropertyDetails true means you MUST recalculate after the 10 answers — show_quote_rates alone is not enough.
- Persist needsPropertyDetails, flow, awaitingPropertyDetails, quoteId, stateId, userId, formId, address, formattedAddress, nextTool in orchestration JSON (no swarmValuation).
`.trim();

const TOOL_CHAINING_IDS = `
TOOL CHAINING (never for chat, never guessed):
${QUOTE_FLOW_ROUTING}
- recalculate_quote: only when orchestration has needsPropertyDetails true and all 10 propertyAttributes collected. Pass quoteId, userId, stateId, formId, address, propertyAttributes. Do NOT pass swarmValuation.
- After recalculate_quote succeeds, call show_quote_rates once when internal.nextTool is show_quote_rates.
- stateId comes ONLY from fetch_quote internal.stateId. NEVER infer stateId from city/state text (e.g. Miami, FL). NEVER use placeholder values like 1, 9, 10, or 12.
- If recalculate fails with missing valuation, re-run fetch_quote or restart the quote flow.
`.trim();

export class InsurancePrompts {
  // -------------------------------
  // 1. USER + PRODUCTS RESOLUTION
  // -------------------------------
  @Prompt({
    name: "fetch_user_and_products_prompt",
    description:
      "Look up an existing user and return products. Collect required details from the homeowner in chat first; never create users or invent contact information.",
    arguments: [
      {
        name: "name",
        description: "User name from chat input",
        required: false,
      },
      {
        name: "email",
        description: "Primary user identifier (must be valid email)",
        required: true,
      },
      {
        name: "address",
        description: "User address required for product matching",
        required: true,
      },
      {
        name: "phone",
        description: "User phone number (optional)",
        required: false,
      },
    ],
  })
  async getUserAndProductsPrompt(
    args: GetUserAndProductsArgs,
    ctx: ExecutionContext,
  ) {
    ctx.logger.info("Resolving user and fetching products");

    const optionalFields = [
      args.name ? `- name: "${args.name}"` : null,
      args.phone ? `- phone: "${args.phone}"` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return [
      {
        role: "user" as const,
        content: `
You are a backend orchestration agent for the identity + products step.

${IDENTITY_TOOL_GATING}

CONSTRAINTS:
- Call fetch_user_and_products ONLY when IDENTITY & TOOL GATING rules above are satisfied.
- If gating rules are not satisfied, reply to the homeowner in plain text asking for missing details and do NOT call any tool.
- When the tool is allowed, call ONLY fetch_user_and_products once.
- Do NOT explain steps or reasoning beyond what the homeowner needs to hear.
- Do NOT call fetch_quote or any other tool in this step.
- Backend handles all state persistence

${USER_FACING_RULES}

OUTPUT FORMAT:
If you called the tool: reply to the homeowner in plain text using ONLY tool.userFacing (product names from userFacing.products).

If you did NOT call the tool: reply in plain text asking for the missing details only.

For orchestration/state when the tool was called, return ONLY valid JSON (do not show this JSON to the homeowner):
{
  "internal": {
    "userId": "string",
    "products": [{ "formId": 1, "name": "string" }]
  }
}
        `.trim(),
      },
      {
        role: "user" as const,
        content:
          `If the homeowner has already provided email, address, name, and phone in this conversation, call fetch_user_and_products with those values. Otherwise ask for missing details and do not call the tool.

Values for this request (use only if the homeowner provided them in chat):
- email: "${args.email}"
- address: "${args.address}"
${optionalFields ? `\n${optionalFields}` : ""}
- name: required from homeowner before calling the tool
- phone: required from homeowner before calling the tool`.trim(),
      },
    ];
  }

  // -------------------------------
  // 2. CREATE QUOTE (API 5 happy flow)
  // -------------------------------
  @Prompt({
    name: "fetch_quote_prompt",
    description:
      "Create an insurance quote (API 5). Branches to recalculate when needsPropertyDetails is true.",
    arguments: [
      {
        name: "userId",
        description: "Resolved user identifier from backend state",
        required: true,
      },
      {
        name: "formId",
        description: "Selected insurance product form ID",
        required: true,
      },
      {
        name: "address",
        description: "Address used for quote calculation",
        required: true,
      },
    ],
  })
  async createQuotePrompt(args: CreateQuoteArgs, ctx: ExecutionContext) {
    return [
      {
        role: "user" as const,
        content: `
You are a backend orchestration agent for quote creation.

CONSTRAINTS:
- Call fetch_quote EXACTLY ONCE first
- Do NOT infer or fabricate missing fields
- Do NOT call fetch_quote again
- Do NOT call recalculate_quote in this step
- fetch_quote does NOT mount the rates widget

${USER_FACING_RULES}

${QUOTE_FLOW_ROUTING}

FLOW BRANCHING (read internal.needsPropertyDetails from fetch_quote — do not guess):

Rates ready (needsPropertyDetails === false, nextTool === "show_quote_rates"):
1. Call show_quote_rates immediately with quoteId and formattedAddress
2. NEVER call recalculate_quote on this quote
3. Tell the homeowner using show_quote_rates.userFacing.summary

Property details required (needsPropertyDetails === true, nextTool === "recalculate_quote"):
1. Do NOT call show_quote_rates or recalculate_quote yet
2. Tell the homeowner using fetch_quote.userFacing.summary
3. Ask ALL 10 property fields (PROPERTY FIELD KEYS + TYPE FIELD RULES)
4. When all 10 answers collected → recalculate_quote_prompt → then show_quote_rates once
5. NEVER call recalculate_quote before all 10 answers; NEVER skip recalculate on this path

${TOOL_CHAINING_IDS}

PROPERTY FIELD KEYS (map homeowner answers to swarmValuation.AddressProfile.PropertyAttributes):
${PROPERTY_QUESTIONS_TEXT}

TYPE FIELD RULES (swarmValuation.AddressProfile.PropertyAttributes — all numbers):
- Map homeowner answers to numbers before calling recalculate_quote
- type_Dwelling: ${DWELLING_TYPE_OPTIONS.map((o) => `${o.DwellingTypeId}=${o.DwellingTypeDesc}`).join(', ')}
- type_RoofingMaterial: ${ROOFING_MATERIAL_OPTIONS.map((o) => `${o.RoofingMaterialId}=${o.RoofingMaterial}`).join(', ')}
- type_Roof: ${ROOF_TYPE_OPTIONS.map((o) => `${o.RoofTypeId}=${o.RoofType}`).join(', ')}
- type_Foundation: ${FOUNDATION_TYPE_OPTIONS.map((o) => `${o.FoundationTypeId}=${o.FoundationType}`).join(', ')}
- type_Pool: ${POOL_TYPE_OPTIONS.map((o) => `${o.PoolTypeId}=${o.PoolType}`).join(', ')}
- type_Construction: numeric id (no fixed option list — use homeowner answer as number)

OUTPUT FORMAT:
Homeowner message: plain text from tool.userFacing only.

Orchestration JSON (never show to homeowner):

After fetch_quote (rates ready — needsPropertyDetails false):
{
  "internal": {
    "userId": "string",
    "formId": 1,
    "quoteId": 123,
    "stateId": "<from fetch_quote internal.stateId>",
    "address": "string",
    "formattedAddress": "string",
    "needsPropertyDetails": false,
    "flow": "rates_ready",
    "awaitingPropertyDetails": false,
    "nextTool": "show_quote_rates"
  }
}

After show_quote_rates (happy flow complete):
{
  "internal": {
    "quoteId": 123,
    "showWidget": true,
    "ratesStreamUrl": "string"
  }
}

Property details required (after fetch_quote — needsPropertyDetails true):
{
  "internal": {
    "userId": "string",
    "formId": 1,
    "quoteId": 123,
    "stateId": "<from fetch_quote internal.stateId>",
    "address": "string",
    "formattedAddress": "string",
    "needsPropertyDetails": true,
    "flow": "property_details",
    "awaitingPropertyDetails": true,
    "nextTool": "recalculate_quote"
  }
}
        `.trim(),
      },
      {
        role: "user" as const,
        content: `Create an insurance quote using the following inputs:
- userId: "${args.userId}"
- formId: "${args.formId}"
- address: "${args.address}"`,
      },
    ];
  }

  // -------------------------------
  // 3. SHOW QUOTE RATES (happy path widget)
  // -------------------------------
  @Prompt({
    name: "show_quote_rates_prompt",
    description:
      "Open the rates widget (only tool that mounts it). If needsPropertyDetails was false after fetch_quote, call immediately after fetch_quote. If true, call only after recalculate_quote succeeded — never before.",
    arguments: [
      {
        name: "quoteId",
        description: "Quote ID from fetch_quote internal response",
        required: true,
      },
      {
        name: "formattedAddress",
        description: "Formatted address from fetch_quote userFacing or quote",
        required: true,
      },
    ],
  })
  async showQuoteRatesPrompt(
    args: { quoteId: number; formattedAddress: string },
    ctx: ExecutionContext,
  ) {
    return [
      {
        role: "user" as const,
        content: `
You are a backend orchestration agent. Your only job is to call the show_quote_rates tool.

CONSTRAINTS:
- Call ONLY the tool: show_quote_rates
- Call show_quote_rates EXACTLY ONCE
- If orchestration has needsPropertyDetails true and recalculate_quote has not run yet, do NOT call this tool — collect property details and recalculate first
- If orchestration has needsPropertyDetails false, call this tool directly (never recalculate)
- Do NOT call fetch_quote

${USER_FACING_RULES}

OUTPUT FORMAT:
Homeowner message: plain text from tool.userFacing.summary only.
        `.trim(),
      },
      {
        role: "user" as const,
        content: `Open the rates widget for quote:
- quoteId: "${args.quoteId}"
- formattedAddress: "${args.formattedAddress}"`,
      },
    ];
  }

  // -------------------------------
  // 4. RECALCULATE QUOTE (API 5.1 negative flow)
  // -------------------------------
  @Prompt({
    name: "recalculate_quote_prompt",
    description:
      "ONLY when fetch_quote returned needsPropertyDetails true and all 10 property fields are collected. Never use for needsPropertyDetails false.",
    arguments: [
      {
        name: "quoteId",
        description: "Quote ID from fetch_quote internal",
        required: true,
      },
      {
        name: "userId",
        description: "User ID from fetch_quote internal",
        required: true,
      },
      {
        name: "stateId",
        description: "Exact stateId from fetch_quote internal (never guessed)",
        required: true,
      },
      {
        name: "formId",
        description: "Form ID from fetch_quote internal",
        required: true,
      },
      {
        name: "address",
        description: "Address from fetch_quote internal",
        required: true,
      },
      {
        name: "propertyAttributes",
        description:
          "All 10 homeowner PropertyAttributes answers as numbers (see TYPE FIELD RULES)",
        required: true,
      },
      {
        name: "apt",
        description: "Apartment or unit (optional, default empty string)",
        required: false,
      },
      {
        name: "lot",
        description: "Lot identifier (optional, default empty string)",
        required: false,
      },
    ],
  })
  async recalculateQuotePrompt(
    args: RecalculateQuoteArgs,
    ctx: ExecutionContext,
  ) {
    const apt = args.apt ?? "";
    const lot = args.lot ?? "";
    const attrs = args.propertyAttributes;

    return [
      {
        role: "user" as const,
        content: `
You are a backend orchestration agent. Your only job is to call the recalculate_quote tool.

${TOOL_CHAINING_IDS}

CONSTRAINTS:
- Run this prompt ONLY if orchestration has needsPropertyDetails true from fetch_quote. If needsPropertyDetails was false, do NOT call recalculate_quote — use show_quote_rates instead.
- Call ONLY the tool: recalculate_quote
- Call recalculate_quote EXACTLY ONCE
- quoteId, stateId, userId, formId, and address MUST come from fetch_quote orchestration internal — never assumed, never derived from city/state text, never placeholder numbers
- Do NOT pass swarmValuation to recalculate_quote; the server loads it from fetch_quote cache by quoteId
- Pass propertyAttributes with all 10 fields as numbers (TYPE FIELD RULES)
- Pass apt and lot as empty strings when not provided
- Do NOT call fetch_quote or show_quote_rates in this step (orchestrator calls show_quote_rates once after recalculate returns)
- Present tool.userFacing.summary to the homeowner; rates widget opens on the follow-up show_quote_rates call
- NEVER ask the homeowner for stateId, quoteId, formId, or userId

${USER_FACING_RULES}

OUTPUT FORMAT:
Homeowner message: plain text from tool.userFacing.summary only.

Orchestration JSON (from tool.internal only; never show to homeowner):
{
  "internal": {
    "userId": "string",
    "formId": 1,
    "quoteId": 123,
    "stateId": "<from fetch_quote internal.stateId>",
    "address": "string",
    "formattedAddress": "string",
    "needsPropertyDetails": false,
    "flow": "rates_ready",
    "awaitingPropertyDetails": false,
    "propertyDetailsCollected": true,
    "nextTool": "show_quote_rates"
  }
}
        `.trim(),
      },
      {
        role: "user" as const,
        content: `Recalculate the insurance quote with property details.
Prerequisite: fetch_quote returned needsPropertyDetails true. If it was false, do not recalculate.
From fetch_quote orchestration internal (never guess stateId):
- quoteId: ${args.quoteId}
- userId: "${args.userId}"
- stateId: ${args.stateId}
- formId: ${args.formId}
- address: "${args.address}"
- apt: "${apt}"
- lot: "${lot}"
Do not pass swarmValuation — server uses cached valuation from fetch_quote.
propertyAttributes (homeowner answers):
  - YearBuilt: ${attrs.YearBuilt}
  - LivingArea: ${attrs.LivingArea}
  - type_Dwelling: ${attrs.type_Dwelling}
  - NumberOfStories: ${attrs.NumberOfStories}
  - YearRoofUpdated: ${attrs.YearRoofUpdated}
  - type_RoofingMaterial: ${attrs.type_RoofingMaterial}
  - type_Roof: ${attrs.type_Roof}
  - type_Construction: ${attrs.type_Construction}
  - type_Foundation: ${attrs.type_Foundation}
  - type_Pool: ${attrs.type_Pool}`.trim(),
      },
    ];
  }
}
