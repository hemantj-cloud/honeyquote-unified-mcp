import { Injectable } from '@nitrostack/core';

import { MCP_API_BASE_URL, MCP_API_CLIENT_ID } from './mcp-api.constants.js';

/**
 * OAuth client-credentials token for the MCP HTTP API.
 * Owns caching and invalidation so callers can retry after 401.
 */
@Injectable()
export class McpApiAuthService {
    private accessToken: string | null = null;

    async getBearerToken(): Promise<string> {
        if (this.accessToken) {
            return this.accessToken;
        }

        const response = await fetch(`${MCP_API_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: MCP_API_CLIENT_ID,
            }),
        });

        const payload = await response.json() as { access_token?: string };

        if (!response.ok || !payload.access_token) {
            throw new Error('Failed to fetch API access token');
        }

        this.accessToken = payload.access_token;
        return payload.access_token;
    }

    invalidateCachedToken(): void {
        this.accessToken = null;
    }
}
