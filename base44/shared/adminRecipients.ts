// Admin email recipients for all admin-facing notifications.
// Centralized here so every admin notification function resolves to the same list.
//
// Runtime override: AppConfig key ADMIN_NOTIFICATION_LIST (comma-separated).
// This constant is the fallback used by sendAdminNotification when that config
// value is empty.
//
// Verified against the User table (role="admin") on 2026-09-08:
//   Buck Cumbo     -> buck@seamountainvacations.com (User record)
//                    buck@theonehundredcollection.com (preferred notification address)
//   Andrew Woodard -> andrew@bluecedarpartners.com
//   Paige Spencer  -> paige@the100collection.com (short domain, NOT theonehundredcollection.com)
export const ADMIN_NOTIFICATION_RECIPIENTS = [
  'buck@theonehundredcollection.com',
  'andrew@bluecedarpartners.com',
  'paige@the100collection.com',
];

// Comma-joined string for send paths that take a single "to" field
// (Resend accepts a comma-separated recipient list).
export const ADMIN_NOTIFICATION_RECIPIENTS_CSV = ADMIN_NOTIFICATION_RECIPIENTS.join(', ');