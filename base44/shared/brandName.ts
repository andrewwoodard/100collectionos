// Canonical brand display name for outbound email (Resend subjects, footers, from).
// Legacy CMS / AppConfig copy may still say "The One Hundred Collection".

export const BRAND_DISPLAY_NAME = "The 100 Collection™";

export function normalizeBrandName(value: string): string {
  if (!value) return value;
  return value
    .replace(/The\s+One\s+Hundred\s+Collection™?/gi, BRAND_DISPLAY_NAME)
    .replace(/(?<![A-Za-z0-9])One\s+Hundred\s+Collection™?/gi, "100 Collection™")
    .replace(/The 100 Collection(?!™)/g, BRAND_DISPLAY_NAME)
    .replace(/the 100 Collection(?!™)/g, "the 100 Collection™")
    .replace(/THE 100 COLLECTION(?!™)/g, "THE 100 COLLECTION™");
}
