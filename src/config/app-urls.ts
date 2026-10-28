export const DEPLOYED_APP_URL = 'https://hq-chat-6ae0c37c-hemants-org-d233dcd8.app.nitrocloud.ai';

function isRunningInCloud(): boolean {
  return Boolean(process.env.NITRO_APP_URL || process.env.KUBERNETES_SERVICE_HOST || process.env.NITROCLOUD);
}

export function resolveWorkflowApiUrl(): string {
  return (
    process.env.HQ_SERVICING_API_BASE_URL ||
    process.env.APP_URL ||
    (isRunningInCloud() ? DEPLOYED_APP_URL : 'http://localhost:3000')
  );
}

/** Public HTTPS origin of this app; DocuSign returns the signer here. */
export function resolveSigningPublicUrl(): string {
  const fallback = (process.env.APP_URL || resolveWorkflowApiUrl()).replace(/\/$/, '');
  const configured = process.env.HQ_SIGNING_PUBLIC_URL?.trim().replace(/\/$/, '');
  if (!configured) return fallback;
  try {
    // The workflow repo's URL belongs to a different deployment and has no signing routes here.
    if (new URL(configured).hostname.startsWith('hq-workflow-')) return fallback;
  } catch {
    return fallback;
  }
  return configured;
}

export function toOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).origin;
  } catch {
    return null;
  }
}

// The host sandbox enforces connectDomains as connect-src, so widget calls back to
// this app (payment status, signing status) are blocked unless its origin is listed.
export const APP_CONNECT_DOMAINS = Array.from(
  new Set(
    [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3003',
      DEPLOYED_APP_URL,
      toOrigin(process.env.APP_URL),
      toOrigin(process.env.NITRO_APP_URL),
      toOrigin(process.env.HQ_SERVICING_API_BASE_URL),
      toOrigin(process.env.HQ_SIGNING_PUBLIC_URL),
    ].filter((d): d is string => Boolean(d))
  )
);
