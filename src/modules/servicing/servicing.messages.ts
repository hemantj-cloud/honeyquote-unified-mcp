/** Homeowner-visible chat copy (verbatim sample; dynamic segments only). */

export const WELCOME_AND_IDENTITY_PROMPT =
  "Welcome to HoneyQuote! I'm here to help you manage or renew your insurance policy. Let's start by locating your account using your registered email or phone number.";

export const IDENTITY_REMINDER_PROMPT =
  "Please share your registered email or phone number so I can send a one-time verification code.";

export const OTP_SENT_PROMPT =
  "To keep your account secure, we've sent a one-time verification code to your registered contact. Please enter the code to continue.";

export function verificationSuccessIntro(firstName: string): string {
  return `You're verified, ${firstName}! I've retrieved your policy details, and you can review your current coverage below.`;
}

export const POLICY_DETAILS_REPEAT_INTRO = 'Your policy details are in the card below.';

export const POLICY_EXPIRY_RENEWAL_INVITE =
  "Your policy is approaching its renewal date. Let's explore your renewal options to help keep your home protected.";

export const RENEWAL_PROPERTY_CONFIRM_INTRO =
  "Great! Before we find your renewal quotes, let's quickly confirm your existing property details.";

export const PROPERTY_UPDATE_ASK =
  'Of course! Please share your updated property address, including the street, city, state, and ZIP code.';

export const PROPERTY_UPDATED_SUCCESS =
  'Your property details have been updated successfully! Please review the information below before we proceed.';

export const FETCHING_QUOTES_INVITE =
  "Everything looks good! I'll now check available insurance quotes based on your updated property details.";

export const QUOTES_READY_SUMMARY =
  'Good news! Your insurance quotes are ready. Compare the available plans below and choose the coverage that works best for you.';

export function stripeCheckoutIntro(premiumFormatted: string): string {
  return `Excellent choice! Your selected premium is ${premiumFormatted}. Let's complete your payment securely through Stripe.`;
}

export function stripePaymentSuccess(premiumFormatted: string): string {
  return `Payment confirmed! Stripe has successfully processed your ${premiumFormatted} payment. Let's complete your policy documents with a digital signature.`;
}

export const DOCUSIGN_SIGN_INVITE =
  "You're almost done! Please select **Sign Now** to review and securely sign your insurance documents through DocuSign.";

export const SIGNATURE_CONFIRMED =
  'All set! DocuSign has confirmed your electronic signature, and your policy records have been updated successfully.';

export function renewalCompletedCongrats(firstName: string): string {
  return `Congratulations, ${firstName}! Your insurance renewal is complete, and your updated policy details are available below.`;
}

export const CLOSING_THANK_YOU =
  "Thank you for choosing HoneyQuote! I'm always here to help with your policy, coverage, or insurance-related questions.";

export const PROPERTY_CONFIRM_YES_INVITE =
  'When your property details look correct, type **yes** to continue to secure payment through Stripe.';
