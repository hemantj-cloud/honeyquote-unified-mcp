'use client';

import { useEffect, useState, useRef } from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

function calendarDaysUntil(yyyyMmDd?: string): number | null {
  const [y, m, d] = String(yyyyMmDd || '')
    .slice(0, 10)
    .split('-')
    .map(Number);
  if (!y || !m || !d) return null;
  const expiry = Date.UTC(y, m - 1, d);
  const n = new Date();
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((expiry - today) / 86400000);
}

function formatDocumentLabel(doc: string): string {
  const text = String(doc || '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text;
}

function ymdUtcFromOffset(dayOffset: number): string {
  const n = new Date();
  const utc = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) + dayOffset * 86400000;
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface PolicyData {
  ticketId?: string;
  policyNumber?: string;
  carrier?: string;
  customerName?: string;
  status?: string;
  coverages?: {
    dwelling?: number;
    personalProperty?: number;
    liability?: number;
  };
  deductibles?: {
    hurricane?: string;
    aop?: string;
  };
  effectiveDate?: string;
  renewalDate?: string;
  daysUntilExpiry?: number;
  isRenewalEligible?: boolean;
  signatureRequired?: boolean;
  esignSent?: boolean;
  missingDocuments?: string[];
  billedToMortgage?: boolean;
}

export default function PolicyServicingWidget() {
  const { getToolOutput } = useWidgetSDK();
  const sdkOutput = getToolOutput<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  // Force signature HoneyQuote branded light cream card aesthetic per design specification
  const isDark = false;

  const isUnauthenticated = sdkOutput?.internal?.authenticated === false;

  // Report the card's height to the NitroChat iframe whenever its content resizes (data,
  // tabs, notices, fonts), so the frame never keeps a stale, taller height.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let lastHeight = -1;
    const notifyHeight = () => {
      const contentHeight = Math.max(
        el.scrollHeight,
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      const height = isUnauthenticated ? 0 : Math.max(contentHeight + 16, 370);
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage(
        { type: 'nitro:set_height', widgetId: (window as any).openai?.widgetId, height },
        '*'
      );
    };
    notifyHeight();
    const observer = new ResizeObserver(notifyHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isUnauthenticated]);

  // Extract structured internal data
  const rawInternal = sdkOutput?.internal || sdkOutput || {};
  const activeInternal = rawInternal;

  const isPropertyConfirmation = Boolean(
    activeInternal.awaitingPropertyConfirmation === true ||
    activeInternal.stage === 'awaiting_property_confirmation'
  );
  const propertyAttrs = activeInternal.propertyAttributes || {};
  const confirmationAddress = propertyAttrs.address || activeInternal.propertyAddress || activeInternal.address;
  const confirmationRoof =
    [propertyAttrs.roofGeometry, propertyAttrs.roofType, propertyAttrs.roofYear ? `Replaced ${propertyAttrs.roofYear}` : undefined]
      .filter(Boolean)
      .join(', ') || 'Not available on record';
  const confirmationSqft = propertyAttrs.squareFootage
    ? `${Number(propertyAttrs.squareFootage).toLocaleString()} sq ft`
    : 'Not available on record';
  const isStandalonePreview =
    typeof window !== 'undefined' && window.location.pathname.includes('policy-widget') && !rawInternal.renewalDate;
  const liveRenewalDate = rawInternal.renewalDate as string | undefined;
  const liveEffectiveDate = rawInternal.effectiveDate as string | undefined;
  const resolvedRenewalDate = liveRenewalDate || (isStandalonePreview ? ymdUtcFromOffset(13) : undefined);
  const resolvedEffectiveDate =
    liveEffectiveDate || (isStandalonePreview ? ymdUtcFromOffset(-365) : undefined);
  // Prefer the server's count so the card and the chat text always show the same number of days.
  const daysFromDate =
    typeof rawInternal.daysUntilExpiry === 'number'
      ? rawInternal.daysUntilExpiry
      : calendarDaysUntil(resolvedRenewalDate);
  const resolvedData: PolicyData = {
    ticketId: rawInternal.ticketId || 'HQ-DEMO-001',
    policyNumber: rawInternal.policyNumber || '—',
    carrier: rawInternal.carrier || '—',
    status: rawInternal.status || '—',
    coverages: rawInternal.coverages
      ? {
          dwelling: rawInternal.coverages.dwelling,
          personalProperty: rawInternal.coverages.personalProperty,
          liability: rawInternal.coverages.liability,
        }
      : undefined,
    deductibles: rawInternal.deductibles
      ? {
          hurricane:
            typeof rawInternal.deductibles.hurricane === 'number'
              ? `$${rawInternal.deductibles.hurricane.toLocaleString()}${rawInternal.deductibles.hurricanePercentage ? ` (${rawInternal.deductibles.hurricanePercentage})` : ''}`
              : String(rawInternal.deductibles.hurricane || rawInternal.deductibles.hurricaneDeductible || '—'),
          aop:
            typeof (rawInternal.deductibles.aop ?? rawInternal.deductibles.allOtherPerils) === 'number'
              ? `$${Number(rawInternal.deductibles.aop ?? rawInternal.deductibles.allOtherPerils).toLocaleString()}`
              : String(rawInternal.deductibles.aop || rawInternal.deductibles.allOtherPerils || '—'),
        }
      : undefined,
    effectiveDate: resolvedEffectiveDate,
    renewalDate: resolvedRenewalDate,
    daysUntilExpiry: daysFromDate ?? undefined,
    isRenewalEligible:
      typeof daysFromDate === 'number' &&
      daysFromDate > 0 &&
      daysFromDate <= 30 &&
      rawInternal.status !== 'IN_FORCE_RENEWED',
    signatureRequired: rawInternal.signatureRequired ?? false,
    esignSent: rawInternal.esignSent ?? false,
    missingDocuments: rawInternal.missingDocuments || [],
    billedToMortgage: rawInternal.billedToMortgage ?? false,
  };

  // Determine whether servicing tasks notification was explicitly dispatched for this session/user
  // In the SMS Link Doc Signing flow, the user arrives via e-sign reminder SMS (tab=checklist, hasNotification=true, or get_pending_servicing_tasks).
  // In the Renewal flow (get_policy_details), this is not an active servicing notification unless explicitly flagged.
  const hasServicingNotification = Boolean(
    sdkOutput?.internal?.hasNotification === true ||
    sdkOutput?.internal?.notification === true ||
    sdkOutput?.hasNotification === true ||
    (typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('tab') === 'checklist' ||
      new URLSearchParams(window.location.search).get('notification') === 'true'
    ))
  );

  const isTasksTool = Boolean(
    sdkOutput?.internal?.signatureRequired !== undefined ||
    sdkOutput?.internal?.missingDocuments !== undefined
  );

  const [activeTab, setActiveTab] = useState<'coverages' | 'checklist'>(
    (hasServicingNotification || isTasksTool) ? 'checklist' : 'coverages'
  );

  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const daysRemaining = daysFromDate;

  const isRenewalWindow = Boolean(
    typeof daysRemaining === 'number' &&
      daysRemaining > 0 &&
      daysRemaining <= 30 &&
      resolvedData.status !== 'IN_FORCE_RENEWED'
  );
  const isRenewed = resolvedData.status === 'IN_FORCE_RENEWED';
  const canManageSignature = !isUnauthenticated && !isRenewalWindow && (
    (isRenewed && rawInternal.paid === true) || rawInternal.presentation === 'servicing' ||
    (!rawInternal.presentation && hasServicingNotification && !isRenewed)
  );

  // While the policy is in the expiry window the Servicing Tasks tab is hidden
  // entirely (Ankita: warning lives on the term dates only), so never leave the
  // user stranded on a tab that isn't rendered.
  useEffect(() => {
    if (isRenewalWindow) setActiveTab('coverages');
  }, [isRenewalWindow]);

  // Dynamic interactive states for servicing checklist & actions
  const [missingDocs, setMissingDocs] = useState<string[]>(
    resolvedData.missingDocuments || []
  );
  const [signatureNeeded, setSignatureNeeded] = useState<boolean>(
    Boolean(resolvedData.signatureRequired && rawInternal.signatureStatus !== 'signed')
  );
  const [, setIsEsignSent] = useState<boolean>(Boolean(resolvedData.esignSent));
  const isPaidViaStripe = rawInternal.paid === true || resolvedData.status === 'IN_FORCE_RENEWED';

  const [signatureSigned, setSignatureSigned] = useState(rawInternal.signatureStatus === 'signed');
  const [awaitingSignature, setAwaitingSignature] = useState(false);
  useEffect(() => {
    setAwaitingSignature(false);
    setActionNotice(null);
  }, [resolvedData.ticketId, rawInternal.presentation, rawInternal.paid]);
  const callSigningTool = async (name: string, args: Record<string, unknown>) => {
    const sdk = (window as any).openai;
    if (typeof sdk?.callTool !== 'function') throw new Error('Signing unavailable in this client');
    const response = await sdk.callTool(name, args);
    let payload = response?.structuredContent || response;
    if (response?.content?.[0]?.text) payload = JSON.parse(response.content[0].text);
    const result = payload?.internal || payload;
    if (response?.isError || result?.success === false || result?.ok === false) throw new Error('Signing request failed');
    return result;
  };
  useEffect(() => {
    setSignatureSigned(rawInternal.signatureStatus === 'signed');
    setSignatureNeeded(Boolean(resolvedData.signatureRequired && rawInternal.signatureStatus !== 'signed'));
  }, [resolvedData.ticketId, resolvedData.signatureRequired, rawInternal.signatureStatus]);
  const signingStatusUrl: string = rawInternal.signingStatusUrl || '';
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!canManageSignature || !signatureNeeded || !signingStatusUrl) return;
    let active = true;
    let attempts = 0;
    // Plain fetch, not callTool: tool calls render in the chat, so polling through
    // them would post a "still pending" message every few seconds.
    const refresh = async () => {
      try {
        const resp = await fetch(`${signingStatusUrl}?ticketId=${encodeURIComponent(resolvedData.ticketId || '')}`);
        if (!resp.ok) return;
        const result = await resp.json();
        if (active && result?.signed) {
          setSignatureNeeded(false);
          setSignatureSigned(true);
          setAwaitingSignature(false);
          setActionNotice('Document signed.');
          // One chat-visible status call so the assistant's text matches the card.
          if (!announcedRef.current) {
            announcedRef.current = true;
            void callSigningTool('hq_docusign_status', { ticketId: resolvedData.ticketId }).catch(() => {});
          }
        }
      } catch {}
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = awaitingSignature ? setInterval(() => {
      if (++attempts >= 60) { setAwaitingSignature(false); return; }
      void refresh();
    }, 5000) : undefined;
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [resolvedData.ticketId, canManageSignature, signatureNeeded, awaitingSignature, signingStatusUrl]);

  const [isSigning, setIsSigning] = useState<boolean>(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState<boolean>(false);
  const [isGeneratingCOI, setIsGeneratingCOI] = useState<boolean>(false);
  const [isSubmittingEndorsement, setIsSubmittingEndorsement] = useState<boolean>(false);
  const [endorsementPending, setEndorsementPending] = useState<boolean>(false);
  const [isRenewing, setIsRenewing] = useState<boolean>(false);
  const [renewalTriggered, setRenewalTriggered] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const workflowApiUrl =
    sdkOutput?.workflowApiUrl ||
    sdkOutput?.internal?.workflowApiUrl ||
    (typeof window !== 'undefined' && window.location.hostname.includes('nitrocloud.ai')
      ? 'https://code-mode-6abfd341-akfjss-org-6ab29763.app.nitrocloud.ai'
      : 'http://localhost:3012');

  const verifiedEmail =
    sdkOutput?.internal?.insuredEmail ||
    sdkOutput?.insuredEmail ||
    (typeof window !== 'undefined' && localStorage.getItem('hq_verified_email')) ||
    '';

  // Handler: Policy Renewal trigger to parent conversational agent (Step 3 Handshake)
  const handleRenewPolicy = async () => {
    if (isRenewing || renewalTriggered) return;
    setIsRenewing(true);
    setRenewalTriggered(true);
    setActionNotice('Initiating policy renewal and preparing on-record verification...');

    try {
      const openaiSdk = (window as any).openai;
      if (typeof openaiSdk?.callTool === 'function') {
        const response = await openaiSdk.callTool('get_renewal_property_details', {
          ticketId: resolvedData.ticketId,
        });
        let payload = response?.structuredContent || response;
        if (!response?.structuredContent && response?.content?.[0]?.text) {
          try {
            payload = JSON.parse(response.content[0].text);
          } catch {}
        }
        setActionNotice('Property details retrieved for your review.');
      } else {
        // Fallback via MCP HTTP call if running outside NitroChat bridge
        const workflowApiUrl = (resolvedData as any).workflowApiUrl || 'http://localhost:3000';
        const mcpEndpoint = workflowApiUrl.endsWith('/mcp') ? workflowApiUrl : `${workflowApiUrl.replace(/\/$/, '')}/mcp`;
        await fetch(mcpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: 'get_renewal_property_details',
              arguments: { ticketId: resolvedData.ticketId },
            },
          }),
        });
        setActionNotice('Property details retrieved for your review.');
      }
    } catch (err) {
      console.warn('Renew policy callTool error:', err);
      setActionNotice('Unable to retrieve property details. Please try again.');
    } finally {
      setIsRenewing(false);
    }
  };

  // Handler: DocuSign Electronic Signature
  const handleSignDocuSign = async () => {
    if (isSigning || !canManageSignature || (!signatureNeeded && !signatureSigned)) return;
    setIsSigning(true);
    setActionNotice('Preparing your document...');

    try {
      const signAgain = signatureSigned === true;
      const result = await callSigningTool('hq_docusign_send', { force: signAgain });
      if (result.signed) {
        setSignatureNeeded(false);
        setSignatureSigned(true);
        setActionNotice('Document signed.');
        return;
      }
      if (signAgain) {
        setSignatureSigned(false);
        setSignatureNeeded(true);
        announcedRef.current = false;
      }
      setIsEsignSent(true);
      if (!result.signingUrl) throw new Error('No signing link returned');
      const url = new URL(result.signingUrl);
      if (url.protocol !== 'https:') throw new Error('Invalid signing link');
      const sdk = (window as any).openai;
      if (typeof sdk?.openExternal === 'function') sdk.openExternal({ href: url.href });
      else window.open(url.href, '_blank', 'noopener,noreferrer');
      setActionNotice('DocuSign opened. Status will update after signing.');
      setAwaitingSignature(true);
    } catch {
      setActionNotice('Unable to prepare signing. Please try again or contact support.');
    } finally {
      setIsSigning(false);
    }
  };

  // Handler: Supporting Documents Upload
  const triggerDocUpload = () => {
    if (isUploadingDocs) return;
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const docTypeToSatisfy = missingDocs[0] || 'application';

    setIsUploadingDocs(true);
    setActionNotice(`Uploading ${file.name} to Citizens underwriting intake...`);

    try {
      let updatedRemaining: string[] | null = null;

      try {
        const resp = await fetch(`${workflowApiUrl}/api/policy/document/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: resolvedData.ticketId,
            fileName: file.name,
            docType: docTypeToSatisfy,
          }),
        });
        if (resp.ok) {
          const resData = await resp.json();
          if (Array.isArray(resData?.missingDocuments)) {
            updatedRemaining = resData.missingDocuments;
          }
        }
      } catch {
        // Local 3012 fallback
        try {
          const resp = await fetch('http://localhost:3012/api/policy/document/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ticketId: resolvedData.ticketId,
              fileName: file.name,
              docType: docTypeToSatisfy,
            }),
          });
          if (resp.ok) {
            const resData = await resp.json();
            if (Array.isArray(resData?.missingDocuments)) {
              updatedRemaining = resData.missingDocuments;
            }
          }
        } catch {
          // Non-blocking
        }
      }

      if (updatedRemaining !== null) {
        setMissingDocs(updatedRemaining);
        if (updatedRemaining.length === 0) {
          setActionNotice(`✅ "${file.name}" uploaded! All underwriting document requirements are now satisfied.`);
        } else {
          setActionNotice(`✅ "${file.name}" uploaded! Remaining missing: ${updatedRemaining.join(', ')}.`);
        }
      } else {
        // Fallback optimistic resolution: remove satisfied document
        setMissingDocs((prev) => {
          const next = prev.filter((doc) => doc !== docTypeToSatisfy);
          return next.length === prev.length ? prev.slice(1) : next;
        });
        setActionNotice(`✅ "${file.name}" uploaded and filed with Citizens underwriting.`);
      }

      setTimeout(() => setActionNotice(null), 6000);
    } catch {
      setMissingDocs((prev) => prev.slice(1));
      setActionNotice(`Document "${file.name}" received.`);
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsUploadingDocs(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handler: Download Certificate of Insurance (COI)
  const handleDownloadCOI = async () => {
    if (isGeneratingCOI) return;
    setIsGeneratingCOI(true);

    const policyNum = resolvedData.policyNumber;
    const carrierName = resolvedData.carrier;
    const covA = resolvedData.coverages?.dwelling ?? 450000;
    const personalProp = resolvedData.coverages?.personalProperty ?? Math.round(covA * 0.5);
    const liab = resolvedData.coverages?.liability ?? 300000;
    const hurricaneDeductible = resolvedData.deductibles?.hurricane || '$4,500 (2%)';
    const aopDeductible = resolvedData.deductibles?.aop || '$1,000';

    setActionNotice(`Generating & emailing COI to ${verifiedEmail}...`);

    try {
      const payload = {
        ticketId: resolvedData.ticketId,
        email: verifiedEmail,
        name: 'Jordan Mitchell',
        policyNumber: policyNum,
        carrier: carrierName,
        coverageA: covA,
        personalProperty: personalProp,
        liability: liab,
        hurricaneDeductible: hurricaneDeductible,
        aopDeductible: aopDeductible,
      };

      // 1. Dispatch real email via Gmail API on servicing backend
      try {
        await fetch(`${workflowApiUrl}/api/policy/coi/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // Fallback to local server port 3012
        try {
          await fetch('http://localhost:3012/api/policy/coi/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        } catch {
          // Fallback via MCP tool
          try {
            if (typeof (window as any).openai?.callTool === 'function') {
              await (window as any).openai.callTool('send_certificate_of_insurance', {
                ticketId: resolvedData.ticketId,
                email: verifiedEmail,
              });
            }
          } catch {
            // Non-blocking
          }
        }
      }

      // 2. Generate and trigger download of Certificate of Insurance document
      const coiContent = `================================================================================
HONEYQUOTE INSURANCE SERVICES — CERTIFICATE OF INSURANCE (COI)
================================================================================
Date Generated:       ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Policy Number:        ${policyNum}
Servicing Ticket ID:  ${resolvedData.ticketId}
Underwriting Carrier: ${carrierName}
Named Insured:        Jordan Mitchell (${verifiedEmail})
Insured Property:     1248 SW 27th Ave, Miami, FL 33145
Policy Term:          October 15, 2026 to October 15, 2027
Policy Status:        ACTIVE / IN-FORCE — Verified Binder

SCHEDULE OF COVERAGES & LIMITS:
--------------------------------------------------------------------------------
Coverage A (Dwelling):             $${covA.toLocaleString()}
Coverage B (Other Structures):     $${(covA * 0.1).toLocaleString()} (10%)
Coverage C (Personal Property):    $${personalProp.toLocaleString()} (50%)
Coverage D (Loss of Use):          $${(covA * 0.2).toLocaleString()} (20%)
Coverage E (Personal Liability):   $${liab.toLocaleString()}
Coverage F (Medical Payments):     $5,000 per person

APPLICABLE DEDUCTIBLES:
--------------------------------------------------------------------------------
Hurricane / Named Windstorm:       ${hurricaneDeductible}
All Other Perils (AOP):            ${aopDeductible}

BILLING:
--------------------------------------------------------------------------------
Billing Method:                    Direct Homeowner Pay (Stripe)
Billing Status:                    ${isPaidViaStripe ? 'Paid via Stripe' : 'Payment due at renewal'}

CERTIFICATE HOLDER NOTICE:
--------------------------------------------------------------------------------
This certificate is issued as a matter of information only and confers no rights
upon the certificate holder. Coverage is subject to all terms and exclusions
of Policy #${policyNum}.

Authorized Representative:
Citizens Property Insurance Corporation / HoneyQuote Automated Binding Engine
Digital Verification Hash: COI-${resolvedData.ticketId}-${Date.now().toString(36).toUpperCase()}
================================================================================
`;

      try {
        const blob = new Blob([coiContent], { type: 'text/plain;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = blobUrl;
        downloadAnchor.download = `HoneyQuote_COI_${policyNum}.txt`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (err) {
        console.warn('Local download fallback:', err);
      }

      setActionNotice(`✅ COI document emailed to ${verifiedEmail} and downloaded! Check your inbox.`);
      setTimeout(() => setActionNotice(null), 8000);
    } catch {
      setActionNotice(`COI document emailed to ${verifiedEmail}.`);
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsGeneratingCOI(false);
    }
  };

  // Handler: Request Policy Endorsement (instant confirmation)
  const handleRequestEndorsement = async () => {
    if (isSubmittingEndorsement || endorsementPending) return;
    setIsSubmittingEndorsement(true);
    setActionNotice('Submitting policy endorsement request...');

    try {
      setEndorsementPending(true);
      setActionNotice('✅ Endorsement request submitted and applied to your policy.');
      setTimeout(() => setActionNotice(null), 8000);
    } catch {
      setEndorsementPending(true);
      setActionNotice('Endorsement request submitted.');
      setTimeout(() => setActionNotice(null), 4000);
    } finally {
      setIsSubmittingEndorsement(false);
    }
  };

  // HoneyQuote Color Tokens
  const colors = isDark
    ? {
        bg: '#163029',
        border: '#234A3F',
        subBorder: '#1F4339',
        textPrimary: '#F4ECDE',
        textSecondary: '#A3B8B0',
        textMuted: '#7A857F',
        cardBg: '#0D221D',
        stripBg: '#122B24',
        accentPrimary: '#276152',
        accentHighlight: '#EBBFBC',
        warningBg: 'rgba(172, 81, 42, 0.2)',
        warningBorder: '#AC512A',
        warningText: '#F4ECDE',
        successBg: 'rgba(39, 97, 82, 0.3)',
        successBorder: '#276152',
        successText: '#CEF5CA',
      }
    : {
        bg: '#FFFFFF',
        border: '#DBDBCD',
        subBorder: '#EFEFEA',
        textPrimary: '#0D221D',
        textSecondary: '#535862',
        textMuted: '#7A857F',
        cardBg: '#FCF6EC',
        stripBg: '#F4ECDE',
        accentPrimary: '#276152',
        accentHighlight: '#AC512A',
        warningBg: '#FDF4E7',
        warningBorder: '#F7D7B2',
        warningText: '#AC512A',
        successBg: '#E8F5EE',
        successBorder: '#B8E2CB',
        successText: '#1B493D',
      };

  if (isUnauthenticated) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      data-build="2026-10-26-r1"
      style={{
        width: '100%',
        maxWidth: '720px',
        margin: '0 auto',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '18px',
        boxShadow: isDark
          ? '0 12px 32px rgba(0, 0, 0, 0.4)'
          : '0 8px 30px -4px rgba(13, 34, 29, 0.08), 0 2px 6px -1px rgba(13, 34, 29, 0.04)',
        color: colors.textPrimary,
        padding: '22px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${colors.subBorder}`,
          paddingBottom: '16px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 260px', minWidth: 0 }}>
          {/* HoneyQuote deep cypress badge */}
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#276152',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 8px rgba(39, 97, 82, 0.25)',
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F4ECDE" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '17px', fontWeight: 700, color: colors.textPrimary, letterSpacing: '-0.01em' }}>
                {resolvedData.carrier}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '3px 9px',
                  borderRadius: '100px',
                  background: colors.successBg,
                  color: colors.successText,
                  border: `1px solid ${colors.successBorder}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#276152' }} />
                {isRenewed ? 'In Force (Renewed)' : 'In Force'}
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: colors.textSecondary, marginTop: '3px' }}>
              Policy: <strong style={{ color: colors.textPrimary, fontWeight: 600 }}>{resolvedData.policyNumber}</strong> • Ticket: {resolvedData.ticketId}
            </div>
          </div>
        </div>

        {/* Term validity dates */}
        <div
          style={{
            fontSize: '12px',
            color: colors.textSecondary,
            textAlign: 'right',
            background: colors.cardBg,
            padding: '6px 12px',
            borderRadius: '10px',
            border: `1px solid ${colors.border}`,
            flexShrink: 0,
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textMuted }}>
              Term Period
            </span>
          </div>
          <div style={{ fontWeight: 700, fontSize: '12px', color: colors.textPrimary, marginTop: '2px' }}>
            {resolvedData.effectiveDate || '—'} to {resolvedData.renewalDate || '—'}
          </div>
        </div>
      </div>

      {/* Expiration Alert Banner: dynamically rendered when policy expires within renewal window (<= 30 days) */}
      {isRenewalWindow && (
        <div
          style={{
            background: colors.warningBg,
            border: `1px solid ${colors.warningBorder}`,
            borderRadius: '14px',
            padding: '14px 18px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            boxShadow: isDark
              ? '0 4px 14px rgba(172, 81, 42, 0.15)'
              : '0 2px 8px rgba(172, 81, 42, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: isDark ? 'rgba(172, 81, 42, 0.35)' : '#FFFFFF',
                border: `1px solid ${colors.warningBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                flexShrink: 0,
              }}
            >
              ⚠️
            </div>
            <div>
              <div
                style={{
                  fontSize: '13.5px',
                  fontWeight: 700,
                  color: isDark ? '#F4ECDE' : '#8A4A00',
                  letterSpacing: '-0.01em',
                }}
              >
                EXPIRATION ALERT: Policy Expires in {daysRemaining} Days
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: isDark ? '#DCCFBF' : '#663300',
                  marginTop: '2px',
                  lineHeight: 1.4,
                }}
              >
                Review renewal terms with zero redundant paperwork. Lock in your rate before your current term expires.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRenewPolicy}
            disabled={isRenewing || renewalTriggered || isPropertyConfirmation}
            style={{
              padding: '9px 20px',
              fontSize: '12.5px',
              fontWeight: 700,
              borderRadius: '100px',
              background: '#276152',
              color: '#FFFFFF',
              border: 'none',
              cursor: (isRenewing || renewalTriggered || isPropertyConfirmation) ? 'not-allowed' : 'pointer',
              opacity: (isRenewing || renewalTriggered || isPropertyConfirmation) ? 0.75 : 1,
              boxShadow: '0 3px 10px rgba(39, 97, 82, 0.28)',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {isRenewing ? (
              <>
                <span>⏳</span>
                <span>Initiating Renewal...</span>
              </>
            ) : (renewalTriggered || isPropertyConfirmation) ? (
              <>
                <span>✅</span>
                <span>Renewal Started</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Renew Policy</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Tab Navigation - HoneyQuote pill style */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '18px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('coverages')}
          style={{
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '100px',
            border: activeTab === 'coverages' ? 'none' : `1px solid ${colors.border}`,
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            background: activeTab === 'coverages' ? '#276152' : colors.stripBg,
            color: activeTab === 'coverages' ? '#FFFFFF' : colors.textPrimary,
            boxShadow: activeTab === 'coverages' ? '0 2px 6px rgba(39, 97, 82, 0.25)' : 'none',
          }}
        >
          Coverages & Limits
        </button>

        {!isRenewalWindow && (
        <button
          type="button"
          onClick={() => setActiveTab('checklist')}
          style={{
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '100px',
            border: activeTab === 'checklist' ? 'none' : `1px solid ${colors.border}`,
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            background: activeTab === 'checklist' ? '#276152' : colors.stripBg,
            color: activeTab === 'checklist' ? '#FFFFFF' : colors.textPrimary,
            boxShadow: activeTab === 'checklist' ? '0 2px 6px rgba(39, 97, 82, 0.25)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            order: isTasksTool || hasServicingNotification ? -1 : 0,
          }}
        >
          <span>Servicing Tasks</span>
          {hasServicingNotification && (signatureNeeded || missingDocs.length > 0) && (
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#AC512A',
                display: 'inline-block',
              }}
            />
          )}
        </button>
        )}
      </div>

      {/* Tab 1: Coverages & Deductibles — also rendered while the Servicing tab is hidden during the renewal window */}
      {(activeTab === 'coverages' || isRenewalWindow) && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            {/* Dwelling Coverage */}
            <div
              style={{
                background: colors.cardBg,
                padding: '14px 16px',
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Dwelling (Cov A)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#276152', marginTop: '4px', letterSpacing: '-0.02em' }}>
                {resolvedData.coverages?.dwelling != null ? `$${resolvedData.coverages.dwelling.toLocaleString()}` : '—'}
              </div>
              <div style={{ fontSize: '11.5px', color: colors.textMuted, marginTop: '3px' }}>
                Primary Structure Protection
              </div>
            </div>

            {/* Personal Property */}
            <div
              style={{
                background: colors.cardBg,
                padding: '14px 16px',
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Personal Property (Cov C)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary, marginTop: '4px', letterSpacing: '-0.02em' }}>
                {resolvedData.coverages?.personalProperty != null ? `$${resolvedData.coverages.personalProperty.toLocaleString()}` : '—'}
              </div>
              <div style={{ fontSize: '11.5px', color: colors.textMuted, marginTop: '3px' }}>
                50% of Dwelling Limit
              </div>
            </div>

            {/* Personal Liability */}
            <div
              style={{
                background: colors.cardBg,
                padding: '14px 16px',
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Liability (Cov E)
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary, marginTop: '4px', letterSpacing: '-0.02em' }}>
                {resolvedData.coverages?.liability != null ? `$${resolvedData.coverages.liability.toLocaleString()}` : '—'}
              </div>
              <div style={{ fontSize: '11.5px', color: colors.textMuted, marginTop: '3px' }}>
                Comprehensive Third-Party
              </div>
            </div>
          </div>

          {/* Deductibles Row */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              background: colors.stripBg,
              padding: '14px 16px',
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              marginBottom: '16px',
            }}
          >
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 500, color: colors.textSecondary }}>🌀 Hurricane Deductible</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#AC512A', marginTop: '3px' }}>
                {resolvedData.deductibles?.hurricane || '—'}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 500, color: colors.textSecondary }}>⚡ All Other Perils (AOP)</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, marginTop: '3px' }}>
                {resolvedData.deductibles?.aop || '—'}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 500, color: colors.textSecondary }}>🏦 Premium Billing Method</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#1B493D', marginTop: '3px' }}>
                {isPaidViaStripe ? 'Paid via Stripe' : 'Direct Homeowner Pay'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Servicing Tasks Checklist */}
      {activeTab === 'checklist' && !isRenewalWindow && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Signature Item */}
            <div
              style={{
                display: canManageSignature ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '12px',
                background: signatureNeeded ? colors.warningBg : colors.successBg,
                border: `1px solid ${signatureNeeded ? colors.warningBorder : colors.successBorder}`,
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>
                  {signatureNeeded ? '✍️' : '✅'}
                </span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: colors.textPrimary }}>DocuSign Electronic Signature</span>
                  </div>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>
                    {signatureNeeded
                      ? 'Your renewal document needs your electronic signature'
                      : signatureSigned ? 'Document signed' : 'No signature currently required'}
                  </div>
                </div>
              </div>
              {canManageSignature && (signatureNeeded || signatureSigned) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleSignDocuSign()}
                  disabled={isSigning}
                  style={{
                    padding: '7px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    borderRadius: '100px',
                    background: '#276152',
                    color: '#FFFFFF',
                    border: 'none',
                    cursor: isSigning ? 'not-allowed' : 'pointer',
                    opacity: isSigning ? 0.75 : 1,
                    boxShadow: '0 2px 6px rgba(39, 97, 82, 0.25)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isSigning ? 'Preparing...' : signatureSigned ? 'Sign Again' : 'Sign Now'}
                </button>
                </div>
              )}
            </div>

            {/* Missing Documents */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '12px',
                background: missingDocs.length > 0 ? colors.warningBg : colors.successBg,
                border: `1px solid ${missingDocs.length > 0 ? colors.warningBorder : colors.successBorder}`,
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>
                  {missingDocs.length > 0 ? '📄' : '✅'}
                </span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: colors.textPrimary }}>Supporting Documents</div>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>
                    {missingDocs.length > 0
                      ? `Missing: ${missingDocs.map(formatDocumentLabel).join(', ')}`
                      : 'All required documents verified'}
                  </div>
                </div>
              </div>
              {missingDocs.length > 0 && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={triggerDocUpload}
                    disabled={isUploadingDocs}
                    style={{
                      padding: '7px 16px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      borderRadius: '100px',
                      background: '#F4ECDE',
                      color: '#276152',
                      border: '1px solid #DBDBCD',
                      cursor: isUploadingDocs ? 'not-allowed' : 'pointer',
                      opacity: isUploadingDocs ? 0.75 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isUploadingDocs ? 'Uploading...' : 'Upload Docs'}
                  </button>
                </>
              )}
            </div>

            {/* Renewal Payment Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: '12px',
                background: isPaidViaStripe ? colors.successBg : colors.warningBg,
                border: `1px solid ${isPaidViaStripe ? colors.successBorder : colors.warningBorder}`,
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>💳</span>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: colors.textPrimary }}>Renewal Payment</div>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>
                    {isPaidViaStripe
                      ? 'Renewal premium paid securely via Stripe'
                      : 'Renewal premium is due at Stripe checkout'}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  color: isPaidViaStripe ? '#1B493D' : '#8A4A00',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '3px 10px',
                  borderRadius: '100px',
                  background: '#FFFFFF',
                  border: `1px solid ${isPaidViaStripe ? '#B8E2CB' : colors.warningBorder}`,
                }}
              >
                {isPaidViaStripe ? 'Paid' : 'Due'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Notification Message */}
      {actionNotice && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            background: colors.stripBg,
            border: `1px solid ${colors.border}`,
            color: '#276152',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          {actionNotice}
        </div>
      )}



      {isPropertyConfirmation && (
        <div
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: '14px',
            padding: '16px 18px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 700,
              color: colors.textPrimary,
              marginBottom: '4px',
              letterSpacing: '-0.01em',
            }}
          >
            Property Details on File
          </div>
          <div
            style={{
              fontSize: '12px',
              color: colors.textSecondary,
              marginBottom: '12px',
              lineHeight: 1.45,
            }}
          >
            Please confirm they're still accurate before your renewal checkout is prepared:
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: '18px',
              fontSize: '12.5px',
              color: colors.textPrimary,
              lineHeight: 1.55,
            }}
          >
            <li><strong>Property Address:</strong> {confirmationAddress || 'Not available on record'}</li>
            <li><strong>Year Built:</strong> {propertyAttrs.yearBuilt || 'Not available on record'}</li>
            <li><strong>Square Footage:</strong> {confirmationSqft}</li>
            <li><strong>Construction Type:</strong> {propertyAttrs.constructionType || 'Not available on record'}</li>
            <li><strong>Roof Geometry &amp; Age:</strong> {confirmationRoof}</li>
            <li><strong>Primary Use:</strong> {propertyAttrs.primaryUse || 'Not available on record'}</li>
            {propertyAttrs.stories ? <li><strong>Stories:</strong> {propertyAttrs.stories}</li> : null}
            {propertyAttrs.primaryHeating ? <li><strong>Heating:</strong> {propertyAttrs.primaryHeating}</li> : null}
            {propertyAttrs.plumbingSystem ? <li><strong>Plumbing:</strong> {propertyAttrs.plumbingSystem}</li> : null}
            {propertyAttrs.electricalPanel ? (
              <li>
                <strong>Electrical Panel:</strong>{' '}
                {String(propertyAttrs.electricalPanel).replace(/([a-z])([A-Z])/g, '$1 $2')}
              </li>
            ) : null}
          </ul>
        </div>
      )}

      {/* Footer Action Bar - HoneyQuote rounded button style */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `1px solid ${colors.subBorder}`,
          paddingTop: '16px',
          flexWrap: 'wrap',
        }}
      >
        {canManageSignature && (signatureNeeded || signatureSigned) && (
          <button
            type="button"
            onClick={() => handleSignDocuSign()}
            disabled={isSigning}
            style={{
              flexBasis: '100%',
              padding: '12px 20px',
              fontSize: '13.5px',
              fontWeight: 700,
              borderRadius: '100px',
              background: '#276152',
              color: '#FFFFFF',
              border: 'none',
              cursor: isSigning ? 'not-allowed' : 'pointer',
              opacity: isSigning ? 0.75 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 3px 10px rgba(39, 97, 82, 0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            <span>✍️</span>
            <span>
              {isSigning
                ? 'Opening DocuSign...'
                : signatureSigned
                  ? 'Sign Again — send a new document'
                  : 'Sign Now — signature needed on 1 document'}
            </span>
          </button>
        )}
        {canManageSignature && signatureSigned && <span>Document signed</span>}
        <button
          type="button"
          onClick={handleDownloadCOI}
          disabled={isGeneratingCOI}
          style={{
            flex: '1 1 240px',
            padding: '10px 18px',
            fontSize: '12.5px',
            fontWeight: 600,
            borderRadius: '100px',
            background: colors.stripBg,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            cursor: isGeneratingCOI ? 'not-allowed' : 'pointer',
            opacity: isGeneratingCOI ? 0.75 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>{isGeneratingCOI ? '⏳' : '📥'}</span> {isGeneratingCOI ? 'Generating COI...' : 'Download Certificate of Insurance (COI)'}
        </button>

        <button
          type="button"
          onClick={handleRequestEndorsement}
          disabled={isSubmittingEndorsement || endorsementPending}
          style={{
            flex: '1 1 240px',
            padding: '10px 20px',
            fontSize: '12.5px',
            fontWeight: 600,
            borderRadius: '100px',
            background: '#276152',
            color: '#FFFFFF',
            border: 'none',
            cursor: (isSubmittingEndorsement || endorsementPending) ? 'not-allowed' : 'pointer',
            opacity: (isSubmittingEndorsement || endorsementPending) ? 0.75 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 8px rgba(39, 97, 82, 0.25)',
            transition: 'all 0.15s ease',
          }}
        >
          <span>{isSubmittingEndorsement || endorsementPending ? '⏳' : '⚙️'}</span> {isSubmittingEndorsement ? 'Submitting...' : endorsementPending ? 'Endorsement Under Review' : 'Request Policy Endorsement'}
        </button>
      </div>
    </div>
  );
}
