import { Injectable } from '@nitrostack/core';
import { request } from 'node:https';

import { McpApiAuthService } from './mcp-api-auth.service.js';
import { MCP_API_BASE_URL } from './mcp-api.constants.js';
import {
    isCompleteSwarmValuation,
    mergeSwarmValuationPropertyAttributes,
    type SwarmValuationPropertyAttributes,
} from './insurance.types.js';

type UserDetails = {
    name: string;
    email: string;
    address: string;
    phone: string;
};

type ExistingUserResponse = {
    exist: boolean;
    data: {
        userId: string;
    } | null;
};

type RegisterUserResponse = {
    data?: {
        userId?: string;
    };
    message?: string | string[];
    error?: string;
    statusCode?: number;
};

export type InsuranceProduct = {
    formId: number;
    name: string;
    apt?: number;
    lot?: number;
};

export type QuoteDetails = {
    quoteId: number;
    formattedAddress: string;
    swarmValuation?: unknown;
    needsPropertyDetails: boolean;
    stateId: number;
};

export type RecalculateQuoteInput = {
    quoteId: number;
    userId: string;
    stateId: number;
    formId: number;
    address: string;
    apt?: string;
    lot?: string;
    swarmValuation: unknown;
};

export type RecalculateQuoteWithPropertyAttributesInput = {
    quoteId: number;
    userId: string;
    stateId: number;
    formId: number;
    address: string;
    propertyAttributes: SwarmValuationPropertyAttributes;
    apt?: string;
    lot?: string;
};

export type QuoteRate = {
    name: string;
    assosiationId: number;
    premium: number;
    logo: string;
};

@Injectable({ deps: [McpApiAuthService] })
export class InsuranceService {
    private readonly swarmValuationByQuoteId = new Map<number, unknown>();

    constructor(private readonly mcpApiAuth: McpApiAuthService) {}

    cacheSwarmValuation(quoteId: number, swarmValuation: unknown): void {
        if (swarmValuation != null) {
            this.swarmValuationByQuoteId.set(quoteId, swarmValuation);
        }
    }

    getCachedSwarmValuation(quoteId: number): unknown | undefined {
        return this.swarmValuationByQuoteId.get(quoteId);
    }

    async getOrCreateUserId(user: UserDetails): Promise<string> {
        const existingUser = await this.findUserByEmail(user.email);

        if (existingUser.exist && existingUser.data?.userId) {
            return existingUser.data.userId;
        }

        return await this.registerUser(user);
    }

    async getProducts(userId: string): Promise<InsuranceProduct[]> {
        return await this.getWithJsonBody<InsuranceProduct[]>(`${MCP_API_BASE_URL}/prodcuts`, {
            userId,
        });
    }

    async createQuote(input: {
        formId: number;
        userId: string;
        address: string;
    }): Promise<QuoteDetails> {
        const response = await this.fetchWithAuth(
            `${MCP_API_BASE_URL}/quotes/${input.formId}?address=${encodeURIComponent(input.address)}`,
            {
                method: 'POST',
                headers: {
                    accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userId: input.userId }),
            },
        );

        if (!response.ok) {
            throw new Error(`Failed to create quote: ${response.status}`);
        }

        const quote = await response.json() as QuoteDetails;

        if (quote.swarmValuation != null) {
            this.cacheSwarmValuation(quote.quoteId, quote.swarmValuation);
        }

        return quote;
    }

    async recalculateQuoteWithPropertyAttributes(
        input: RecalculateQuoteWithPropertyAttributesInput,
    ): Promise<QuoteDetails> {
        const baseSwarmValuation = this.getCachedSwarmValuation(input.quoteId);

        if (!isCompleteSwarmValuation(baseSwarmValuation)) {
            throw new Error(
                'Missing full swarmValuation for this quote. Call fetch_quote first, then recalculate_quote.',
            );
        }

        const swarmValuation = mergeSwarmValuationPropertyAttributes(
            baseSwarmValuation,
            input.propertyAttributes,
        );

        return await this.recalculateQuote({
            quoteId: input.quoteId,
            userId: input.userId,
            stateId: input.stateId,
            formId: input.formId,
            address: input.address,
            apt: input.apt,
            lot: input.lot,
            swarmValuation,
        });
    }

    async recalculateQuote(input: RecalculateQuoteInput): Promise<QuoteDetails> {
        const response = await this.fetchWithAuth(`${MCP_API_BASE_URL}/quotes/recalculate`, {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                quoteId: input.quoteId,
                userId: input.userId,
                stateId: input.stateId,
                formId: input.formId,
                address: input.address,
                apt: input.apt ?? '',
                lot: input.lot ?? '',
                swarmValuation: input.swarmValuation,
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to recalculate quote: ${response.status}`);
        }

        return await response.json() as QuoteDetails;
    }

    async getQuoteRates(quoteId: number): Promise<QuoteRate[]> {
        const response = await fetch(`${MCP_API_BASE_URL}/quotes/rates/${quoteId}`, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch quote rates: ${response.status}`);
        }

        return this.parseSseRates(await response.text());
    }

    private async findUserByEmail(email: string): Promise<ExistingUserResponse> {
        const response = await this.fetchWithAuth(`${MCP_API_BASE_URL}/user/email?email=${encodeURIComponent(email)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to check user by email: ${response.status}`);
        }

        return await response.json() as ExistingUserResponse;
    }

    private async registerUser(user: UserDetails): Promise<string> {
        const { firstName, lastName } = this.splitName(user.name);

        const response = await this.fetchWithAuth(`${MCP_API_BASE_URL}/user/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                firstName,
                lastName,
                email: user.email,
                phoneNumber: user.phone,
                address: user.address,
            }),
        });

        const payload = await response.json() as RegisterUserResponse;

        if (!response.ok || !payload.data?.userId) {
            const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
            throw new Error(message ?? payload.error ?? 'Failed to register user');
        }

        return payload.data.userId;
    }

    private splitName(name: string): { firstName: string; lastName: string } {
        const [firstName, ...rest] = name.trim().split(/\s+/);

        return {
            firstName: firstName || name,
            lastName: rest.join(' '),
        };
    }

    private parseSseRates(streamText: string): QuoteRate[] {
        return streamText
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => JSON.parse(line.slice(6)) as QuoteRate);
    }

    private async fetchWithAuth(url: string, init: RequestInit): Promise<Response> {
        const token = await this.mcpApiAuth.getBearerToken();
        let response = await this.fetchWithBearerToken(url, init, token);

        if (response.status === 401) {
            this.mcpApiAuth.invalidateCachedToken();
            const refreshedToken = await this.mcpApiAuth.getBearerToken();
            response = await this.fetchWithBearerToken(url, init, refreshedToken);
        }

        return response;
    }

    private async fetchWithBearerToken(url: string, init: RequestInit, token: string): Promise<Response> {
        return await fetch(url, {
            ...init,
            headers: {
                ...(init.headers as Record<string, string>),
                Authorization: `Bearer ${token}`,
            },
        });
    }

    private async getWithJsonBody<T>(url: string, body: Record<string, unknown>): Promise<T> {
        const token = await this.mcpApiAuth.getBearerToken();
        let response = await this.getWithJsonBodyUsingToken(url, body, token);

        if (response.statusCode === 401) {
            this.mcpApiAuth.invalidateCachedToken();
            const refreshedToken = await this.mcpApiAuth.getBearerToken();
            response = await this.getWithJsonBodyUsingToken(url, body, refreshedToken);
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Failed to fetch products: ${response.statusCode}`);
        }

        return JSON.parse(response.body) as T;
    }

    private async getWithJsonBodyUsingToken(
        url: string,
        body: Record<string, unknown>,
        token: string,
    ): Promise<{ statusCode: number; body: string }> {
        const payload = JSON.stringify(body);
        const parsedUrl = new URL(url);

        return await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
            const req = request(
                {
                    method: 'GET',
                    hostname: parsedUrl.hostname,
                    path: `${parsedUrl.pathname}${parsedUrl.search}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        Authorization: `Bearer ${token}`,
                    },
                },
                (res) => {
                    let responseBody = '';

                    res.setEncoding('utf8');
                    res.on('data', (chunk: string) => {
                        responseBody += chunk;
                    });
                    res.on('end', () => {
                        const statusCode = res.statusCode ?? 500;
                        resolve({
                            statusCode,
                            body: responseBody,
                        });
                    });
                },
            );

            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
}
