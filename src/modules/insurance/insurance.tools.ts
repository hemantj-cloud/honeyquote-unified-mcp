import {
  ToolDecorator as Tool,
  Widget,
  z,
  ExecutionContext,
} from "@nitrostack/core";

import { Injectable } from "@nitrostack/core";
import { InsuranceService } from "./insurance.service.js";
import { swarmValuationPropertyAttributesSchema } from "./insurance.types.js";

const QUOTE_RATES_BASE_URL =
  "https://mcp-server-qa.cda7df0f963e4a14a920.eastus.aksapp.io/api/v1/quotes/rates";

const QUOTES_WIDGET = {
  route: "quotes-widget",
  csp: {
    connectDomains: [
      "https://mcp-server-qa.cda7df0f963e4a14a920.eastus.aksapp.io",
    ],
    resourceDomains: [
      "https://images.honeyquote.com",
      "https://honeyquoteproduction.blob.core.windows.net",
    ],
  },
};

function buildWidgetInternalFields(quoteId: number) {
  return {
    showWidget: true,
    ratesStreamUrl: `${QUOTE_RATES_BASE_URL}/${quoteId}`,
  };
}

@Injectable({ deps: [InsuranceService] })
export class DemoTools {
  constructor(private readonly demoService: InsuranceService) {}

  @Tool({
    name: "fetch_user_and_products",
    description:
      "Get or create an insurance user from contact details, then return available insurance products.",
    inputSchema: z.object({
      name: z.string(),
      email: z.string(),
      address: z.string(),
      phone: z.string(),
    }),
  })
  async prepareInsuranceQuote(input: any, ctx: ExecutionContext) {
    const userId = await this.demoService.getOrCreateUserId({
      name: input.name,
      address: input.address,
      email: input.email,
      phone: input.phone,
    });
    const products = await this.demoService.getProducts(userId);

    return {
      userFacing: {
        products: products.map((product) => ({ name: product.name })),
        address: input.address,
      },
      internal: {
        input: {
          name: input.name,
          address: input.address,
          email: input.email,
          phone: input.phone,
        },
        userId,
        address: input.address,
        products,
      },
    };
  }

  @Tool({
    name: "fetch_quote",
    description:
      "Create a quote. Check internal.needsPropertyDetails: if false → nextTool show_quote_rates (no recalculate). If true → collect 10 property fields, then recalculate_quote, then show_quote_rates.",
    inputSchema: z.object({
      userId: z.string().optional().describe("User ID (defaults to active verified customer on record)"),
      formId: z.number().default(1).describe("Insurance product form ID (default 1)"),
      address: z.string().optional().describe("Property address (defaults to verified on-record address)"),
    }),
  })
  async createQuote(input: any, ctx: ExecutionContext) {
    const resolvedUserId = input.userId || '6ad9bd5dcfc164fb5ece28e1';
    const resolvedFormId = typeof input.formId === 'number' ? input.formId : 1;
    const resolvedAddress = input.address || '1244 Ocean Drive, Miami Beach, FL 33139';

    const quote = await this.demoService.createQuote({
      userId: resolvedUserId,
      formId: resolvedFormId,
      address: resolvedAddress,
    });

    const internal = {
      userId: resolvedUserId,
      formId: resolvedFormId,
      address: resolvedAddress,
      quoteId: quote.quoteId,
      stateId: quote.stateId,
      needsPropertyDetails: quote.needsPropertyDetails,
    };

    if (quote.needsPropertyDetails) {
      return {
        userFacing: {
          summary: `We've started your quote for ${quote.formattedAddress}. We need a few property details before we can show rates.`,
          formattedAddress: quote.formattedAddress,
        },
        internal: {
          ...internal,
          needsPropertyDetails: true,
          flow: "property_details",
          awaitingPropertyDetails: true,
          nextTool: "recalculate_quote",
        },
      };
    }

    return {
      userFacing: {
        summary: `We've created your quote for ${quote.formattedAddress}.`,
        formattedAddress: quote.formattedAddress,
      },
      internal: {
        ...internal,
        needsPropertyDetails: false,
        flow: "rates_ready",
        awaitingPropertyDetails: false,
        nextTool: "show_quote_rates",
      },
    };
  }

  @Tool({
    name: "show_quote_rates",
    description:
      "Open the rates widget (only tool that mounts it). Call when internal.nextTool is show_quote_rates. If needsPropertyDetails was false after fetch_quote, call immediately after fetch_quote. If true, call only after recalculate_quote succeeded — never before.",
    inputSchema: z.object({
      quoteId: z.number(),
      formattedAddress: z.string(),
    }),
  })
  @Widget(QUOTES_WIDGET)
  async showQuoteRates(input: { quoteId: number; formattedAddress: string }) {
    return {
      userFacing: {
        summary: `Your rates for ${input.formattedAddress} are ready below.`,
        formattedAddress: input.formattedAddress,
      },
      internal: {
        quoteId: input.quoteId,
        ...buildWidgetInternalFields(input.quoteId),
      },
    };
  }

  @Tool({
    name: "recalculate_quote",
    description:
      "ONLY when fetch_quote returned needsPropertyDetails true and all 10 propertyAttributes are collected. Never call if needsPropertyDetails was false. Then call show_quote_rates.",
    inputSchema: z.object({
      quoteId: z.number(),
      userId: z.string(),
      stateId: z.number(),
      formId: z.number(),
      address: z.string(),
      propertyAttributes: swarmValuationPropertyAttributesSchema,
      apt: z.string().default(""),
      lot: z.string().default(""),
    }),
  })
  async recalculateQuote(input: any, _ctx: ExecutionContext) {
    const quote = await this.demoService.recalculateQuoteWithPropertyAttributes({
      quoteId: input.quoteId,
      userId: input.userId,
      stateId: input.stateId,
      formId: input.formId,
      address: input.address,
      apt: input.apt ?? "",
      lot: input.lot ?? "",
      propertyAttributes: input.propertyAttributes,
    });

    return {
      userFacing: {
        summary: `We've updated your quote for ${quote.formattedAddress}.`,
        formattedAddress: quote.formattedAddress,
      },
      internal: {
        userId: input.userId,
        formId: input.formId,
        address: input.address,
        quoteId: quote.quoteId,
        stateId: quote.stateId,
        formattedAddress: quote.formattedAddress,
        needsPropertyDetails: false,
        flow: "rates_ready",
        awaitingPropertyDetails: false,
        propertyDetailsCollected: true,
        nextTool: "show_quote_rates",
      },
    };
  }
}
