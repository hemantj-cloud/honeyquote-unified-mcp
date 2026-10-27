const envBaseUrl = (process.env.MCP_API_BASE_URL || '').trim();
export const MCP_API_BASE_URL =
    envBaseUrl.length > 0
        ? envBaseUrl.replace(/\/+$/, '')
        : 'https://mcp-server-qa.cda7df0f963e4a14a920.eastus.aksapp.io/api/v1';

const envClientId = (process.env.MCP_API_CLIENT_ID || '').trim();
export const MCP_API_CLIENT_ID =
    envClientId.length > 0
        ? envClientId
        : 'Xa97kHBu5HMFIGd4WfpzAZgP3Us8J35sARdo1ycPmjQ';

