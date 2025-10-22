export const BASE_PRICE_CENTS = Number(process.env.BASE_PRICE_CENTS || 29900);
export const DEFAULT_REFERRAL_DISCOUNT_CENTS = Number(
  process.env.DEFAULT_REFERRAL_DISCOUNT_CENTS || 2500
);

export function computeFinal(baseCents, discountCents) {
  const base = Math.max(0, Number(baseCents || 0));
  const discount = Math.max(0, Number(discountCents || 0));
  return Math.max(0, base - discount);
}

export function formatEUR(cents) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format((Number(cents) || 0) / 100);
}

export function isReferral(order) {
  return (
    order?.referral_channel === "referral" ||
    Number(order?.discount_cents || 0) > 0 ||
    !!order?.referral_code
  );
}

