/** Accept only the HTTPS hosted checkout URL returned by Paystack. */
export function safePaystackCheckoutUrl(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || candidate.length > 2048) return null;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'checkout.paystack.com' ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
