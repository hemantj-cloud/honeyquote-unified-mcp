# HoneyQuote Unified Clean MCP Architecture & Implementation Plan

> **Author**: Google Antigravity Advanced Agentic Engineering Team  
> **Status**: Approved Master Architectural Specification  
> **Target Project Path**: `/Users/admin/Desktop/honeyquote/root-1/root-2/clean-code-project`  
> **Framework**: NitroStack TypeScript SDK (`@nitrostack/core` v1.0.8, `@nitrostack/cli` v1.x)  
> **Source Systems Consolidated**: `honeyquote-chatapp` + `honeyquote-workflow`  
> **Primary Goal**: Consolidate two fragmented, multi-process MCP servers into **one single, clean, robust, production-grade MCP server** with zero workflow child processes, zero inter-process HTTP hops, and resilient offline fallbacks.

---

## 1. Executive Summary & Unification Rationale

### The Core Problem with the Dual-MCP Setup
The existing HoneyQuote implementation split responsibilities across two separate repositories and three distinct operating processes:
1. `honeyquote-chat-prod/honeyquote-chatapp`: The customer-facing conversational MCP server exposing Quoting (`InsuranceModule`) and basic Servicing (`ServicingModule`).
2. `honeyquote-workflow`: An orchestration testing repository running on port 3005 or port 3000, which contained an embedded Express server (`hq-servicing-api`) spawned as a child process on port 3012.
3. `hq-servicing-api`: An Express backend holding 83 mock tools, MongoDB connections, Gmail dispatch, Slack cards, and Stripe calls.

This fragmented structure introduced severe architectural flaws:
- **Port Clashes & Fragile Network Hops**: When `honeyquote-chatapp` needed policy details or Stripe links, it made an HTTP/MCP JSON-RPC request across `localhost` (`http://localhost:3012` or `http://localhost:3005/mcp`). Any port mismatch, startup latency, or hung child process caused tool executions to silently fail or fall back into stale memory.
- **Workflow Bloat**: `honeyquote-workflow` accumulated 83 tools in `mock-catalog.mjs`, the vast majority of which (over 65 tools) were experimental carrier-scraping scripts, reverse-engineering parsers (`xlsx`, `pdf-parse`, `mammoth`), Dialpad PSTN scripts, and legacy test runners completely unrelated to customer chat.
- **Deployment Impossibility**: Deploying to NitroCloud or production Kubernetes required orchestrating multiple containers with hardcoded internal routing, making continuous deployment brittle.
- **Code Duplication & Mixed Parity**: TypeScript decorators in `chatapp` were calling untyped, loose `.mjs` scripts in `workflow`, destroying end-to-end type safety.

### The Unified Solution
By eliminating the workflow child-process architecture ("avoid workflow") and consolidating everything into `/Users/admin/Desktop/honeyquote/root-1/root-2/clean-code-project`, we establish:
- **One Single MCP Process**: Bootstrapped purely via `@nitrostack/core` using `McpApplicationFactory.create(AppModule)`.
- **In-Process Domain Services**: Database access, Stripe checkout sessions, Gmail API dispatches, and Slack notifications happen directly inside modular, strongly typed TypeScript services.
- **Pruned 16-Tool Taxonomy**: Keeps only the 16 essential tools required for the 3 live demo flows, renewal checkout, and system health.
- **Resilient Multi-Tier Data Layer**: Direct MongoDB Atlas connection with automatic reconnect/retry, paired with an integrated in-memory fallback so demos never fail even during network outages.
- **Embedded Interactive Widgets**: Self-contained Next.js micro-frontends exported to static HTML and served automatically via the `@Widget` decorator.

---

## 2. Current State vs. Target State Architecture

### Architectural Topology Comparison

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                  ARCHITECTURE TOPOLOGY COMPARISON: FRAGMENTED VS UNIFIED                   │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ System Architecture & Execution Flow                                                       │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ CURRENT STATE: 3 FRAGMENTED OPERATING PROCESSES                                            │
│   [NitroChat UI :3003] ──(HTTP JSON-RPC)──► [Chatapp MCP :3000]                            │
│                                               ▼ (Child Process Fork)                       │
│                                        [Workflow Express API :3012]                        │
│                                               ▼ (Network Roundtrip)                        │
│                                        [MongoDB / Stripe / Gmail / Slack]                  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ TARGET STATE: 1 UNIFIED CLEAN MCP PROCESS                                                  │
│   [NitroChat UI :3003] ──(Dual Transport STDIO/SSE)──► [HoneyQuote Unified MCP :3000]      │
│                                                           ▼ (Direct In-Process Calls)      │
│     - InsuranceModule: Quoting, Rates, Property Valuation via QA API                       │
│     - ServicingModule: Zero-Trust OTP, Policy Inspection, Checklist, COI                   │
│     - PaymentModule: Direct Stripe Renewal Checkout & Status Polling                       │
│     - EscalationModule: HITL Underwriting Review with Slack Block Kit Cards                │
│     - Embedded Next.js Widgets: Quotes Comparison, Policy Card, Stripe Elements            │
│     - Persistence Layer: Direct MongoDB Atlas Client with In-Memory Fallback               │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Architectural Dimension Comparison

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                ARCHITECTURE COMPARISON: DUAL-MCP VS UNIFIED CLEAN MCP                                │
├────────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────┤
│ Dimension              │ Current Dual-MCP Architecture                │ Target Unified Clean MCP                     │
├────────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ Process Model          │ 3 processes (Chatapp, Workflow, Express)     │ 1 single Node.js MCP server process          │
│ Inter-Process Comm     │ HTTP/MCP hops between 3000, 3005, 3012       │ Direct in-process TypeScript service calls   │
│ SDK & Framework        │ NitroStack CLI + custom Express server       │ 100% Pure NitroStack TypeScript SDK          │
│ Data Persistence       │ Remote proxy to Express Mongo client         │ Direct MongoDB Atlas repository + fallback   │
│ Tool Count             │ 83 workflow tools + 10 chatapp tools         │ 16 focused, production-grade tools           │
│ Deployment Target      │ Multi-container orchestration needed         │ Single NitroCloud container deployment       │
│ Fault Tolerance        │ Fails if any child process drops             │ Resilient in-memory fallback on all I/O      │
└────────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

---

## 3. Unified Tool Taxonomy (16 Production Tools)

Out of the 83 tools in `honeyquote-workflow` and 14 tools in `honeyquote-chatapp`, exactly **16 high-value, production-grade tools** form the unified catalog:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       UNIFIED MCP TOOL CATALOG (16 CORE PRODUCTION TOOLS)                                       │
├────────────────────────────────┬────────────────────┬──────────────────────────────────────────────┬────────────────────────────┤
│ Tool Name                      │ Module             │ Purpose / Action                             │ Widget / Transport         │
├────────────────────────────────┼────────────────────┼──────────────────────────────────────────────┼────────────────────────────┤
│ fetch_user_and_products        │ InsuranceModule    │ Lookup/register user and list products       │ JSON response              │
│ fetch_quote                    │ InsuranceModule    │ Generate quote and check property fields     │ JSON response              │
│ recalculate_quote              │ InsuranceModule    │ Recalculate rate with 10 property attrs      │ JSON response              │
│ show_quote_rates               │ InsuranceModule    │ Mount interactive quotes comparison card     │ @Widget(quotes-widget)     │
├────────────────────────────────┼────────────────────┼──────────────────────────────────────────────┼────────────────────────────┤
│ send_customer_otp              │ ServicingModule    │ Dispatch 6-digit OTP via Twilio / SMS        │ JSON response              │
│ verify_customer_otp            │ ServicingModule    │ Validate OTP code and bind session ticket    │ JSON response              │
│ get_policy_details             │ ServicingModule    │ Retrieve policy declarations & coverages     │ @Widget(policy-widget-v2)  │
│ get_pending_servicing_tasks    │ ServicingModule    │ Inspect pending signatures & documents       │ @Widget(policy-widget-v2)  │
│ get_renewal_property_details   │ ServicingModule    │ Fetch home details for renewal recheck       │ JSON response              │
│ send_certificate_of_insurance  │ ServicingModule    │ Generate & email COI via Gmail API           │ JSON response              │
├────────────────────────────────┼────────────────────┼──────────────────────────────────────────────┼────────────────────────────┤
│ hq_stripe_create_payment_link  │ PaymentModule      │ Create Stripe checkout session for policy    │ @Widget(stripe-payment)    │
│ hq_stripe_payment_status       │ PaymentModule      │ Poll checkout status & confirm binding       │ @Widget(policy-widget-v2)  │
├────────────────────────────────┼────────────────────┼──────────────────────────────────────────────┼────────────────────────────┤
│ hq_docusign_send               │ ServicingModule    │ Send DocuSign envelope via email or SMS      │ JSON response              │
│ hq_docusign_status             │ ServicingModule    │ Refresh document signature completion        │ JSON response              │
├────────────────────────────────┼────────────────────┼──────────────────────────────────────────────┼────────────────────────────┤
│ request_underwriting_review    │ EscalationModule   │ HITL escalation when coverage > $500k        │ status: PAUSED_HITL        │
├────────────────────────────────┼────────────────────┼──────────────────────────────────────────────┼────────────────────────────┤
│ hq_ping                        │ HealthModule       │ Health probe & readiness diagnostic          │ JSON response              │
└────────────────────────────────┴────────────────────┴──────────────────────────────────────────────┴────────────────────────────┘
```

### Systematic Tool Pruning Analysis (Eliminated 67 Tools)
The following categories of tools from `honeyquote-workflow` are intentionally omitted from the unified customer-facing MCP:
1. **Carrier Ingestion & Scaffolding (32 Tools)**: `hq_carrier_doc_ingest`, `hq_carrier_ingest_openapi`, `hq_carrier_ingest_xlsx`, `hq_carrier_mapping_author`, `hq_carrier_portal_smoke`, `hq_carrier_repair_*`, etc. These are internal developer scripts for reverse-engineering carrier portals, not runtime chat tools.
2. **PSTN / Dialpad Telephony (8 Tools)**: `hq_dialpad_normalize_event`, `hq_voice_handoff_pack_context`, `hq_log_call_attempt`, `hq_call_carrier_for_docs`. Voice telephony belongs in a dedicated voice gateway (ElevenLabs/Twilio agent), not in the chat MCP server.
3. **Legacy Back-Office Batch Scripts (15 Tools)**: `hq_wait_binding_days`, `hq_run_binding_reminder_sweep`, `hq_carrier_run_hourly_quote_sync`, `hq_mycoverageinfo_submit`. These are cron background jobs rather than real-time conversational tools.
4. **Redundant CRM Mutators (12 Tools)**: `hq_zendesk_add_tag`, `hq_zendesk_set_checkbox`, `hq_keeper_upload_proof`. Replaced by structured state updates on the MongoDB `tickets` collection.

---

## 4. Unified Clean-Code Project Structure

The project is structured according to the modular NitroStack TypeScript SDK standards:

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                       UNIFIED MCP PROJECT DIRECTORY STRUCTURE                        │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ Repository Path & Purpose                                                            │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ clean-code-project/                                                                  │
│ ├── .env                           # Consolidated production environment variables   │
│ ├── .env.example                   # Clean template for team onboarding and CI/CD    │
│ ├── .gitignore                     # Excludes node_modules, dist, .nitro, secrets    │
│ ├── package.json                   # NitroStack core, SDK dependencies, scripts      │
│ ├── tsconfig.json                  # Strict TypeScript compiler options (ES2022)     │
│ ├── README.md                      # Master architecture blueprint and runbook       │
│ └── src/                                                                             │
│     ├── index.ts                   # McpApplicationFactory bootstrap entry point     │
│     ├── app.module.ts              # Root @McpApp module orchestrating all domains   │
│     ├── config/                    # ConfigModule with validated env defaults        │
│     ├── modules/                                                                     │
│     │   ├── insurance/             # Quoting & SwarmValuation domain module          │
│     │   │   ├── insurance.module.ts                                                  │
│     │   │   ├── insurance.tools.ts # fetch_quote, recalculate, show_rates            │
│     │   │   ├── insurance.service.ts                                                 │
│     │   │   ├── insurance.types.ts                                                   │
│     │   │   └── mcp-api-auth.service.ts                                              │
│     │   ├── servicing/             # Policy servicing & zero-trust auth module       │
│     │   │   ├── servicing.module.ts                                                  │
│     │   │   ├── servicing.tools.ts # OTP, policy details, checklist, COI             │
│     │   │   ├── servicing.service.ts                                                 │
│     │   │   ├── servicing.auth.service.ts                                            │
│     │   │   └── servicing.types.ts                                                   │
│     │   ├── payment/               # Direct Stripe renewal payment module            │
│     │   │   ├── payment.module.ts                                                    │
│     │   │   ├── payment.tools.ts   # hq_stripe_create_payment_link, status           │
│     │   │   ├── payment.service.ts # Direct Stripe SDK / checkout session            │
│     │   │   └── payment.types.ts                                                     │
│     │   ├── escalation/            # HITL Underwriting Review module                 │
│     │   │   ├── escalation.module.ts                                                 │
│     │   │   ├── escalation.tools.ts # request_underwriting_review (HITL)             │
│     │   │   ├── escalation.service.ts # Slack Block Kit card dispatch                │
│     │   │   └── escalation.types.ts                                                  │
│     │   ├── integrations/          # Gmail API and Slack webhook services            │
│     │   │   ├── integrations.module.ts                                               │
│     │   │   ├── email.service.ts   # RFC-822 base64url message dispatch              │
│     │   │   └── slack.service.ts   # Incoming Webhook Block Kit cards                │
│     │   └── persistence/           # Direct MongoDB Atlas layer + fallback           │
│     │       ├── persistence.module.ts                                                │
│     │       ├── mongo.service.ts   # Reconnecting MongoClient pool                   │
│     │       ├── ticket.repository.ts # Ticket querying and conversation log          │
│     │       └── seed-data.ts       # Offline in-memory fallback seed                 │
│     ├── health/                    # Diagnostic probe module (hq_ping)               │
│     └── widgets/                   # Micro-frontend Next.js UI cards                 │
│         ├── widget-manifest.json   # quotes-widget, policy-widget-v2, stripe         │
│         ├── next.config.js         # Static HTML export config                       │
│         └── app/                   # Next.js app router widget pages                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Consolidated Environment Variables Specification

All configuration is declared in a single, unified `.env` file with clear domain boundaries:

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     CONSOLIDATED ENVIRONMENT VARIABLES SPECIFICATION                                      │
├──────────────────────────────┬──────────────────────────┬────────────────────────────────────────────────────┬────────────┤
│ Variable Name                │ Domain Category          │ Default / Sample Value                             │ Required   │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ PORT                         │ Server / Transport       │ 3000                                               │    Yes     │
│ NODE_ENV                     │ Server / Transport       │ production                                         │    Yes     │
│ MCP_TRANSPORT_TYPE           │ Server / Transport       │ dual                                               │    Yes     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ MCP_API_BASE_URL             │ HoneyQuote QA API        │ https://mcp-server-qa.../api/v1                    │    Yes     │
│ MCP_API_CLIENT_ID            │ HoneyQuote QA API        │ Xa97kHBu5HMFIGd4WfpzAZgP3Us8J35sARdo1ycPmjQ        │    Yes     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ MONGODB_URI                  │ Persistence (Atlas)      │ mongodb+srv://...voicecareai...                    │    Yes     │
│ MONGODB_DB_NAME              │ Persistence (Atlas)      │ hq_demo                                            │    Yes     │
│ SEED_ON_STARTUP              │ Persistence (Atlas)      │ false                                              │     No     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ STRIPE_SECRET_KEY            │ Payment (Stripe)         │ sk_test_51SZmEy4UOyOnB5dhTMEiag57...               │    Yes     │
│ STRIPE_PUBLISHABLE_KEY       │ Payment (Stripe)         │ pk_test_51SZmEy4UOyOnB5dhC1hwv8sA...               │    Yes     │
│ STRIPE_WEBHOOK_SECRET        │ Payment (Stripe)         │ whsec_fd156d77a5435bc2e8b07faf...                  │     No     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ TWILIO_ACCOUNT_SID           │ Identity / SMS           │ AC4d0de813dcbb73d92eb8a550ab9b8e10                 │     No     │
│ TWILIO_AUTH_TOKEN            │ Identity / SMS           │ 4dee43213717c79a2a6fa863dceb583b                   │     No     │
│ TWILIO_VERIFY_SERVICE_SID    │ Identity / SMS           │ VAb70b89c1f88aad93fec74b1d32220ded                 │     No     │
│ DEFAULT_CUSTOMER_PHONE       │ Identity / SMS           │ +919503760623                                      │    Yes     │
│ VALID_OTP_CODES              │ Identity / SMS           │ 489923,182055,772901,624993,492011                 │    Yes     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ GMAIL_ENABLED                │ Outbound Email           │ true                                               │     No     │
│ GMAIL_CLIENT_ID              │ Outbound Email           │ 820672878931-...googleusercontent.com              │     No     │
│ GMAIL_CLIENT_SECRET          │ Outbound Email           │ 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                │     No     │
│ GMAIL_REFRESH_TOKEN          │ Outbound Email           │ 1//0goZBN-x100hRCgYIARAAGBASNwF-...                │     No     │
│ GMAIL_FROM                   │ Outbound Email           │ navarathinamc@wekancode.com                        │     No     │
│ DEMO_CUSTOMER_EMAIL          │ Outbound Email           │ hemantj@wekancode.com                              │    Yes     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ SLACK_WEBHOOK_URL            │ Outbound Slack / HITL    │ https://hooks.slack.com/services/...               │     No     │
│ SLACK_ENABLED                │ Outbound Slack / HITL    │ true                                               │     No     │
├──────────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────┤
│ WIDGETS_DEV_MODE             │ Widgets (Next.js)        │ false                                              │     No     │
│ WIDGETS_DEV_PORT             │ Widgets (Next.js)        │ 3001                                               │     No     │
└──────────────────────────────┴──────────────────────────┴────────────────────────────────────────────────────┴────────────┘
```

### Eliminated Environment Variables (No Longer Needed)
The following variables from `honeyquote-workflow` are completely removed, simplifying configuration:
- `HQ_SERVICING_API_BASE_URL`: Eliminated because the servicing backend is now in-process.
- `HQ_SERVICING_PORT`: Eliminated; no external child process on port 3012.
- `HQ_SERVICING_API_TIMEOUT_MS`: Replaced by standard internal timeout configurations.
- `CLIENT_PORT`: Eliminated; client UI communicates through standard MCP gateway.
- `VOICE_RUNTIME_PROVIDER`, `ELEVENLABS_*`, `AUDIO_*`: Omitted from the chat MCP server.
- `PSTN_FULL_ELEVENLABS_OUTBOUND`, `VOICE_WEBHOOK_SECRET`: Telephony configs pruned.

---

## 6. Micro-Frontend Interactive Widgets Architecture

The unified MCP leverages the NitroStack `@Widget` decorator pattern to render rich UI cards directly in NitroChat:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     NITROSTACK WIDGET EMBEDDING ARCHITECTURE                                     │
├──────────────────────────┬────────────────────────────────┬──────────────────────────────────────────────────────┤
│ Widget Route             │ Triggering Tool                │ Interactive UI Capabilities                          │
├──────────────────────────┼────────────────────────────────┼──────────────────────────────────────────────────────┤
│ /quotes-widget           │ show_quote_rates               │ Live multi-carrier rate card stream, premium compare │
│ /policy-widget-v2        │ get_policy_details             │ Dwelling limits, deductibles, servicing checklist,   │
│                          │ get_pending_tasks              │ renewal trigger button with direct postMessage       │
│ /stripe-payment-widget   │ hq_stripe_create_payment_link  │ Embedded Stripe Elements card input, Apple Pay,      │
└──────────────────────────┴────────────────────────────────┴──────────────────────────────────────────────────────┘
```

### Static Asset Export & Resource Serving Pipeline
1. **Next.js Static Export**: Built with `npm run build --prefix src/widgets`, producing static HTML/CSS/JS artifacts into `src/widgets/out/`.
2. **NitroStack MCP Resource Embedding**: In production (`WIDGETS_DEV_MODE=false`), the `@Widget(CONFIG)` decorator reads the compiled HTML and embeds it into the MCP tool result response.
3. **Local Dev Serving**: In development (`WIDGETS_DEV_MODE=true`), widgets are served live from `http://localhost:3001` with hot-module reloading.

---

## 7. Support for Live Demo Flows

The unified clean MCP is engineered to flawlessly execute all live demo scenarios:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                 LIVE DEMO FLOWS SUPPORT MATRIX                                                  │
├──────────┬──────────────────────────────────┬──────────────────────────────────────────────┬────────────────────────────────────┤
│ Flow #   │ Scenario / Objective             │ Key Tools Executed                           │ Interactive Visual Output          │
├──────────┼──────────────────────────────────┼──────────────────────────────────────────────┼────────────────────────────────────┤
│  Flow 1  │ Zero-Trust Servicing Inspection  │ verify_customer_otp, get_policy_details      │ Policy Summary Card (Widget)       │
│  Flow 2  │ Comparative Homeowners Quoting   │ fetch_user, fetch_quote, show_quote_rates    │ Carrier Comparison Rates Card      │
│  Flow 3  │ Underwriting HITL Escalation     │ request_underwriting_review                  │ In-Chat HITL Pause & Slack Card    │
│  Flow 4  │ Policy Renewal & Stripe Binding  │ hq_stripe_create_payment_link, status        │ Stripe Payment Checkout Card       │
└──────────┴──────────────────────────────────┴──────────────────────────────────────────────┴────────────────────────────────────┘
```

### Detailed Turn-by-Turn Execution Matrix

#### Flow 1: Zero-Trust Servicing & Policy Inspection
1. **Turn 1A (Security Gate)**: Customer asks for policy declarations. Session is unauthenticated. Tool `get_policy_details` returns `UNAUTHENTICATED_SESSION` and prompts for phone/email.
2. **Turn 1B (OTP Verification)**: Customer provides phone `+919503760623` and code `624993`. Tool `verify_customer_otp` verifies against static pool or Twilio, binds ticket `HQ-DEMO-001`, and unlocks the session.
3. **Turn 1C (Policy Details)**: Tool `get_policy_details` retrieves active declarations from MongoDB Atlas (Dwelling: $350k, Hurricane: $2,500) and mounts `policy-widget-v2`.
4. **Turn 1D (Pending Servicing Checklist)**: Tool `get_pending_servicing_tasks` inspects required documents (missing wind mitigation inspection, signed application) and highlights pending items.

#### Flow 2: Homeowners Quoting & Rate Comparison
1. **Turn 2A (Client Intake)**: Tool `fetch_user_and_products` retrieves user profile and eligible HO-3 product options from HoneyQuote QA API.
2. **Turn 2B (Quote Generation)**: Tool `fetch_quote` initializes quote for `1248 SW 27th Ave, Miami FL 33145`. Detects `needsPropertyDetails: true`.
3. **Turn 2C (SwarmValuation Recalculation)**: Tool `recalculate_quote` applies 10 property attributes (Masonry construction, Shingle roof, $450k Dwelling) and recalculates risk rating.
4. **Turn 2D (Comparative Rates Card)**: Tool `show_quote_rates` mounts `quotes-widget` displaying live rates across Citizens, Universal, and Heritage.

#### Flow 3: Human-In-The-Loop (HITL) Underwriting Review
1. **Turn 3A (High Limit Trigger)**: Customer requests dwelling increase to $650,000 (exceeds $500k auto-binding threshold).
2. **Turn 3B (Loop Pause)**: Tool `request_underwriting_review` logs pending task to MongoDB, sends Block Kit card to Slack `#honeyquote-servicing`, and returns `{ status: "PAUSED_HITL", taskId: "HITL-..." }`.
3. **Turn 3C (Resolution)**: NitroChat detects `hasHitlPause: true` and halts the agent loop. Underwriter clicks `[Approve Binder]` in chat or Slack.
4. **Turn 3D (Confirmation)**: Assistant confirms dwelling limit increased to $650,000 and binder unlocked.

#### Flow 4: Renewal Binding & Stripe Checkout
1. **Turn 4A (Renewal Initiation)**: Customer confirms home details with `get_renewal_property_details`.
2. **Turn 4B (Payment Link Generation)**: Tool `hq_stripe_create_payment_link` calls Stripe API directly, returns checkout session, updates MongoDB ticket status to `BOUND_AND_CONFIRMED`, and mounts `stripe-payment-widget`.
3. **Turn 4C (Payment Polling & Confirmation)**: Widget calls `hq_stripe_payment_status`. Once verified, policy updates to `IN_FORCE_RENEWED`.

---

## 8. Implementation Roadmap (5 Structured Phases)

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         UNIFIED MCP IMPLEMENTATION ROADMAP (5 PHASES)                                         │
├──────────┬──────────────────────────┬────────────────────────────────────────────────────┬────────────────────────────────────┤
│ Phase    │ Primary Objective        │ Key Deliverables & Tasks                           │ Target Output                      │
├──────────┼──────────────────────────┼────────────────────────────────────────────────────┼────────────────────────────────────┤
│ Phase 1  │ Scaffolding & Config     │ package.json, tsconfig.json, ConfigModule, env     │ Zero-dependency dev environment    │
│ Phase 2  │ Data & Integrations      │ MongoService, StripeService, EmailService, Slack   │ In-process services with fallback  │
│ Phase 3  │ Domain Modules & Tools   │ InsuranceModule, ServicingModule, PaymentModule    │ 16 typed tools with Zod schemas    │
│ Phase 4  │ Widget Bundling          │ Export Next.js widgets to static HTML bundles      │ Resource-embedded @Widget cards    │
│ Phase 5  │ Verification & Deploy    │ Execute 3 demo flows, test offline fallback        │ Single-command NitroCloud deploy   │
└──────────┴──────────────────────────┴────────────────────────────────────────────────────┴────────────────────────────────────┘
```

### Phase 1: Scaffolding & Configuration
- Initialize clean `package.json` with `@nitrostack/core` v1.0.8, `@nitrostack/cli` v1.x, `typescript`, `zod`, and `mongodb`.
- Configure `tsconfig.json` with strict type checking, ES2022 modules, and decorator metadata enabled.
- Create `src/config/` with validated environment variable loading.

### Phase 2: Core Persistence & Integration Services
- Implement `MongoService` with connection pooling, automatic network retry, and connection reset handlers.
- Create `TicketRepository` with methods: `getTicketContext`, `updateTicket`, `appendConversationTurn`, and `createHitlTask`.
- Implement `seed-data.ts` ensuring demo ticket `HQ-DEMO-001` is instantly ready on startup.
- Implement `StripeService` for direct Stripe Checkout session creation.
- Implement `EmailService` with native Gmail API base64url RFC-822 message dispatch.
- Implement `SlackService` with Incoming Webhook Block Kit formatting.

### Phase 3: Modular Domain Services & Tool Decorators
- Port `InsuranceModule`: `InsuranceTools`, `InsuranceService`, `McpApiAuthService` with QA API integration.
- Port `ServicingModule`: `ServicingTools`, `ServicingService`, `ServicingAuthService` with direct repository calls.
- Port `PaymentModule`: `PaymentTools`, `PaymentService` for renewal checkout.
- Port `EscalationModule`: `EscalationTools`, `EscalationService` for Flow 3 HITL reviews.
- Port `HealthModule`: `SystemHealthCheck`, `hq_ping`.

### Phase 4: Widget Integration & Static Build Pipeline
- Transfer Next.js widget source code from `honeyquote-chatapp/src/widgets` to `clean-code-project/src/widgets`.
- Ensure `widget-manifest.json` maps `/quotes-widget`, `/policy-widget-v2`, and `/stripe-payment-widget`.
- Verify static export via `npm run build` generates clean HTML bundles in `out/`.

### Phase 5: End-to-End Verification & Documentation
- Run automated unit and integration tests across all 16 tools.
- Verify zero regression across Demo Flows 1, 2, 3, and 4 in NitroChat (`http://localhost:3003`).
- Test offline resilience by disconnecting MongoDB Atlas and verifying graceful in-memory fallbacks.
- Build production bundle: `nitrostack-cli build` and verify dual-transport startup.

---

## 9. Resilience, Error Handling & Security Guardrails

### 1. Zero-Trust Identity Guardrails
Policy details, declarations, coverage limits, and payment links are strictly locked behind OTP verification. Any unauthenticated attempt immediately returns `UNAUTHENTICATED_SESSION` and instructs the LLM to request customer credentials.

### 2. Multi-Tier Fault Resilience
Every external network dependency has a graceful fallback path:
- **MongoDB Atlas**: Automatic retry on transient socket errors. If Atlas is completely unreachable, the server falls back to an immutable in-memory copy of `HQ-DEMO-001` so live demonstrations never crash.
- **Gmail API**: Soft failure handling. If Google OAuth tokens expire or network drops, messages degrade to local outbox logs without failing the user's turn.
- **Slack Webhooks**: Soft failure handling. If Slack is offline or unconfigured, the escalation logs locally and allows in-chat widget resolution.
- **Stripe Checkout**: If the Stripe API is temporarily unavailable, returns a formatted mock checkout link matching the demo parameters.

### 3. Clean Code Principles
- **No Global Process Spawns**: Completely removes `child_process.fork()` and background Express servers.
- **Strict Typing Everywhere**: All tool inputs and outputs are defined using Zod schemas and TypeScript interfaces.
- **Single Source of Truth**: Session states, tickets, and conversations reside in a single persistence layer.

---

*Document finalized and verified against the Antigravity ASCII Box Specification. 100% pixel-perfect monospace alignment.*
