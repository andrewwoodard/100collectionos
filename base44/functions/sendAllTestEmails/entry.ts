import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { SOCIAL_PROOF, WHAT_HAPPENS_NEXT, getMarketHeroImage } from '../../shared/socialProofMetrics.ts';

// Email QA test harness: fires every branded email variation to a single test recipient.
// Uses the SAME templates the real triggers use:
//   - Admin emails: buildAdminEmail (the shared branded template) + sendResendEmail
//   - Partner/candidate emails: sendResendEmail's emailTemplate (branded wrapper) with replicated content
// Defensive: each variation is wrapped in try/catch so one failure never stops the run.

const ADMIN_HUB = 'https://100c-os.base44.app/AdminHub';
const PORTAL_URL = 'https://the100collection.com/portal/properties';
const CAREERS_URL = 'https://theonehundredcollection.com/careers';
const ACCEPT_URL = 'https://100c-os.base44.app/portal/accept-invite?token=test-token-qa-001';
const REVIEW_URL = 'https://100c-os.base44.app/admin/review/test-sub-001';

const M = {
  partnerName: 'Test Partner Co',
  partnerEmail: 'sarah@testpartnerco.com',
  propertyName: 'Test Villa Estate',
  location: 'Nags Head, NC',
  listingUrl: 'https://vrbo.com/12345',
  candidateName: 'Jane Applicant',
  candidateEmail: 'jane.applicant@email.com',
  jobTitle: 'Guest Services Manager',
  inviterName: 'Buck Cumbo',
  amount: 498,
  fee: 498,
  licenseNumber: 'T100-2026-0042',
  renewalDate: 'August 16, 2026',
  licenseId: 'test-lic-001',
  invoiceId: 'test-invoice-001',
  invoiceUrl: 'https://dashboard.stripe.com/invoices/test-001',
  partnerId: 'test-partner-001',
  submissionId: 'test-sub-001',
  jobId: 'test-job-001',
  applicationId: 'test-app-001',
  invitationId: 'test-inv-001',
  applicantName: 'Sarah Mitchell',
  applicantEmail: 'sarah@testpartnerco.com',
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Mock hero images for test emails
const MOCK_PROPERTY_HERO = 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200&auto=format&fit=crop&q=80';
const MOCK_DESTINATION_HERO = getMarketHeroImage('Nags Head');

// ── Send helpers ──────────────────────────────────────────────────────────

// Build admin email via buildAdminEmail, then send via sendResendEmail (pre-wrapped html)
async function sendAdmin(base44, to, prefix, payload) {
  const built = await base44.functions.invoke('buildAdminEmail', payload);
  const d = built?.data;
  if (!d?.html) throw new Error('buildAdminEmail returned no html');
  const subject = prefix + (d.subject || payload.headline || 'Test');
  const res = await base44.functions.invoke('sendResendEmail', { to, subject, html: d.html, text: d.text || '' });
  const rd = res?.data || {};
  return { subject, ok: rd.ok === true || !!rd.skipped, skipped: !!rd.skipped };
}

// Send partner/candidate email via sendResendEmail with content (branded template wrapping)
async function sendPartner(base44, to, prefix, subject, content, text) {
  const res = await base44.functions.invoke('sendResendEmail', { to, subject: prefix + subject, content, text: text || '' });
  const rd = res?.data || {};
  return { subject: prefix + subject, ok: rd.ok === true || !!rd.skipped, skipped: !!rd.skipped };
}

// ── Content builders (replicated from real functions) ────────────────────

function activationContent(firstName, partnerName, acceptUrl) {
  return `<h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;color:#0D1B2A;margin:0 0 20px;">Welcome to your 100 Collection Partner Portal</h1>
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Your account for ${partnerName} is ready. Your portal is one place for every part of your relationship with The 100 Collection:</p>
<ul style="margin:0 0 24px;padding-left:20px;color:#334155;font-size:15px;line-height:1.8;">
<li>Manage your properties — add new listings, submit edits, track submissions</li>
<li>View billing and licensing at a glance</li>
<li>Post open roles and receive career applications from candidates on our shared 100 Collection careers page</li>
<li>Update your public profile shown on theonehundredcollection.com</li>
</ul>
<a href="${acceptUrl}" style="display:inline-block;background:#C9A96E;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">Activate my portal &rarr;</a>
<p style="margin:16px 0 0;color:#94A3B8;font-size:12px;">This link expires in 14 days.</p>
<p style="margin:24px 0 0;color:#64748B;font-size:14px;line-height:1.6;">The 100 Collection team<br><a href="https://theonehundredcollection.com" style="color:#C9A96E;text-decoration:none;">theonehundredcollection.com</a></p>`;
}

function activationExistingContent(firstName, partnerName, acceptUrl) {
  return `<h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;color:#0D1B2A;margin:0 0 20px;">You have been granted portal access</h1>
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Your access to the ${partnerName} portal on The 100 Collection is ready. You can now manage properties, view billing, post jobs, and update your public profile.</p>
<a href="${acceptUrl}" style="display:inline-block;background:#C9A96E;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600;">Activate my portal &rarr;</a>
<p style="margin:16px 0 0;color:#94A3B8;font-size:12px;">This link expires in 14 days.</p>
<p style="margin:24px 0 0;color:#64748B;font-size:14px;line-height:1.6;">The 100 Collection team<br><a href="https://theonehundredcollection.com" style="color:#C9A96E;text-decoration:none;">theonehundredcollection.com</a></p>`;
}

function teammateInviteContent(inviterName, partnerName, acceptUrl) {
  return `
<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">You're Invited</h2>
<p style="margin:0 0 16px;"><strong>${inviterName}</strong> has invited you to join <strong>${partnerName}</strong>'s team on the 100 Collection Partner Portal.</p>
<p style="margin:0 0 24px;color:#64748B;font-size:13px;">Click below to accept and create your account. This invitation expires in 14 days.</p>
<a href="${acceptUrl}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">Accept Invitation &rarr;</a>
`;
}

function propertyEmailContent(status, propertyName, partnerFacingMessage, opts) {
  const msg = partnerFacingMessage || '';
  const location = opts?.locationFull || '';
  const listingUrl = opts?.listingUrl || '';
  const partnerName = opts?.partnerName || '';
  const reviewedBy = opts?.reviewedBy || '';
  const signOff = reviewedBy ? reviewedBy : 'The 100 Collection team';
  const locationLine = location ? `<p style="margin:0 0 16px;font-size:14px;color:#64748B;">${location}</p>` : '';
  const listingLink = '';
  const quoteHtml = msg
    ? `<blockquote style="margin:0 0 16px;padding:16px 20px;background:#FAFAF8;border-left:3px solid #C9A96E;border-radius:8px;font-size:14px;line-height:1.6;color:#0D1B2A;white-space:pre-wrap;">${msg}</blockquote>`
    : '';

  if (status === 'needs_revision') {
    const feedbackHtml = msg
      ? `<p style="margin:0 0 16px;">Our curation team has reviewed <strong>${propertyName}</strong> and has the following feedback:</p>${quoteHtml}`
      : `<p style="margin:0 0 16px;">Our curation team has reviewed <strong>${propertyName}</strong> and left comments for your review. Please log in to your portal, review the feedback, and resubmit when ready.</p>`;
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Revisions Requested for ${propertyName}</h2>${locationLine}${feedbackHtml}${listingLink}<a href="${PORTAL_URL}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View Feedback &rarr;</a><p style="margin:16px 0 0;color:#64748B;font-size:14px;line-height:1.6;">${signOff}</p>`;
  }
  if (status === 'active') {
    return `<h1 style="margin:0 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:500;color:#0D1B2A;">Welcome to the Collection</h1>
<p style="margin:0 0 16px;font-size:16px;color:#0D1B2A;font-weight:500;">${propertyName} has been approved.</p>
${locationLine}
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">This is a milestone moment for ${partnerName}. Your property is now officially part of The 100 Collection, and we're thrilled to have it. Our licensing team will be in touch within 48 hours to finalize the details, and your listing will be live on theonehundredcollection.com shortly after.</p>
${listingLink}
<a href="${PORTAL_URL}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">View in Your Portal &rarr;</a>
<p style="margin:16px 0 0;color:#64748B;font-size:14px;line-height:1.6;">Cheers to the beginning of a great partnership.<br/><br/>${signOff}</p>`;
  }
  if (status === 'rejected') {
    const feedbackHtml = msg
      ? `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">After careful review, our curation team has decided that <strong>${propertyName}</strong> is not the right fit for The 100 Collection at this time.</p>${quoteHtml}`
      : `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">After careful review, our curation team has decided that <strong>${propertyName}</strong> is not the right fit for The 100 Collection at this time.</p>`;
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Update on your submission</h2>
<p style="margin:0 0 4px;font-size:15px;color:#0D1B2A;font-weight:500;">${propertyName}${location ? ' — ' + location : ''}</p>
${feedbackHtml}
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">We appreciate the time and detail you shared with us. If your circumstances change or you'd like feedback, please reach out.</p>
${listingLink}
<a href="${PORTAL_URL}" style="display:inline-block;background:#0D1B2A;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">Return to Portal &rarr;</a>
<p style="margin:16px 0 0;color:#64748B;font-size:14px;line-height:1.6;">${signOff}</p>`;
  }
  if (status === 'under_review') {
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">${propertyName} is Now Under Review</h2>
${locationLine}
<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">Your property <strong>${propertyName}</strong> is now being reviewed by our curation team. We'll be in touch soon with an update.</p>
${listingLink}
<p style="margin:16px 0 0;color:#64748B;font-size:14px;line-height:1.6;">${signOff}</p>`;
  }
  return '';
}

function jobAppEmailContent(status, candidateName, jobTitle, partnerName, message) {
  const partnerIntro = partnerName ? ` at ${partnerName}` : '';
  const signOff = partnerName ? `The team at ${partnerName}` : 'The 100 Collection Careers Team';
  const msg = message || '';
  const quoteHtml = msg
    ? `<blockquote style="margin:0 0 16px;padding:16px 20px;background:#FAFAF8;border-left:3px solid #C9A96E;border-radius:8px;font-size:14px;line-height:1.6;color:#0D1B2A;white-space:pre-wrap;">${msg}</blockquote>`
    : '';

  if (status === 'under_review') {
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Application Received</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
<p style="margin:0 0 16px;">Thank you for applying for <strong>${jobTitle}</strong>${partnerIntro}. We have received your application and our team is reviewing it now. We will be in touch soon with an update.</p>
<p style="margin:0;color:#94A3B8;font-size:13px;">Warm regards,<br/>${signOff}</p>`;
  }
  if (status === 'interview') {
    const fallback = `<p style="margin:0 0 16px;">Please reply to this email to let us know your availability and we will set up a time that works.</p>`;
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Interview Invitation</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
<p style="margin:0 0 16px;">We have reviewed your application for <strong>${jobTitle}</strong>${partnerIntro} and would love to invite you to interview.</p>
${quoteHtml || fallback}
<p style="margin:0;color:#94A3B8;font-size:13px;">Warm regards,<br/>${signOff}</p>`;
  }
  if (status === 'offer') {
    const fallback = `<p style="margin:0 0 16px;">Please review the details below and let us know if you have any questions.</p>`;
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">We Would Like to Offer You the Role</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
<p style="margin:0 0 16px;">We are pleased to extend an offer for <strong>${jobTitle}</strong>${partnerIntro}.</p>
${quoteHtml || fallback}
<p style="margin:0;color:#94A3B8;font-size:13px;">Warm regards,<br/>${signOff}</p>`;
  }
  if (status === 'hired') {
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Welcome Aboard!</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
<p style="margin:0 0 16px;">Welcome to the team. We are excited to have you on board for <strong>${jobTitle}</strong>${partnerIntro} and cannot wait to get started.</p>
${quoteHtml}
<p style="margin:0;color:#94A3B8;font-size:13px;">Warm regards,<br/>${signOff}</p>`;
  }
  if (status === 'rejected') {
    const feedbackHtml = msg
      ? `<p style="margin:0 0 16px;">Thank you for taking the time to apply for <strong>${jobTitle}</strong>${partnerIntro}. We genuinely appreciate your interest and the effort you put into your application.</p>${quoteHtml}`
      : `<p style="margin:0 0 16px;">Thank you for taking the time to apply for <strong>${jobTitle}</strong>${partnerIntro}. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches what we are looking for right now.</p>`;
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Application Update</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
${feedbackHtml}
<p style="margin:0 0 16px;">We wish you all the best in your job search and hope our paths cross again in the future.</p>
<p style="margin:0;color:#94A3B8;font-size:13px;">Warm regards,<br/>${signOff}</p>`;
  }
  return '';
}

function positionClosedContent(mode, candidateName, jobTitle, partnerName, customMessage) {
  const signOff = partnerName ? `The team at ${partnerName}` : 'The 100 Collection Careers Team';
  const isFilled = mode === 'filled';
  const msg = customMessage || '';
  const quoteHtml = msg
    ? `<blockquote style="margin:0 0 16px;padding:16px 20px;background:#FAFAF8;border-left:3px solid #C9A96E;border-radius:8px;font-size:14px;line-height:1.6;color:#0D1B2A;white-space:pre-wrap;">${msg}</blockquote>`
    : '';

  if (isFilled) {
    return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Position Filled</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
<p style="margin:0 0 16px;">Thank you for your interest in the <strong>${jobTitle}</strong> role. We wanted to let you know that this position has been filled.</p>
<p style="margin:0 0 16px;">We appreciate the time you took to apply and wish you the best in your job search.</p>
<p style="margin:0 0 16px;">Please keep an eye on our careers page at <a href="${CAREERS_URL}" style="color:#C9A96E;text-decoration:none;">theonehundredcollection.com/careers</a> for future openings that may be a great fit.</p>
<p style="margin:0;color:#94A3B8;font-size:13px;">Warmly,<br/>${signOff}</p>`;
  }
  return `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:500;color:#0D1B2A;">Position Closed</h2>
<p style="margin:0 0 16px;">Hi ${candidateName},</p>
<p style="margin:0 0 16px;">Thank you for your interest in the <strong>${jobTitle}</strong> role. We've made the decision to close this position at this time.</p>
<p style="margin:0 0 16px;">We appreciate the time you took to apply and wish you the best in your job search.</p>
${quoteHtml}
<p style="margin:0 0 16px;">Please keep an eye on our careers page at <a href="${CAREERS_URL}" style="color:#C9A96E;text-decoration:none;">theonehundredcollection.com/careers</a> for future openings.</p>
<p style="margin:0;color:#94A3B8;font-size:13px;">Warmly,<br/>${signOff}</p>`;
}

// ── Variation definitions ─────────────────────────────────────────────────

const VARIATIONS = [
  // A. Partner-facing (routed through buildAdminEmail for Wander polish)
  {
    category: 'Partner-facing',
    name: 'Activation email (new partner)',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'WELCOME TO THE COLLECTION',
      urgency: 'success',
      headline: 'Welcome to your 100 Collection Partner Portal',
      subheadline: `Your account for ${M.partnerName} is ready.`,
      contextBlock: `Hi Sarah, your portal is one place for every part of your relationship with The 100 Collection: manage your properties, view billing and licensing, post open roles, and update your public profile shown on theonehundredcollection.com.`,
      ctaLabel: 'Activate my portal',
      ctaUrl: ACCEPT_URL,
      footerNote: 'This link expires in 14 days.',
      subject: 'Welcome to your 100 Collection Partner Portal',
      heroImage: MOCK_DESTINATION_HERO,
      whatHappensNext: WHAT_HAPPENS_NEXT.activation,
      socialProof: SOCIAL_PROOF.activation,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Activation email (existing-partner access)',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PORTAL ACCESS GRANTED',
      urgency: 'success',
      headline: 'You have been granted portal access',
      subheadline: `Your access to the ${M.partnerName} portal is ready.`,
      contextBlock: `Hi Sarah, your access to the ${M.partnerName} portal on The 100 Collection is ready. You can now manage properties, view billing, post jobs, and update your public profile.`,
      ctaLabel: 'Activate my portal',
      ctaUrl: ACCEPT_URL,
      footerNote: 'This link expires in 14 days.',
      subject: 'Your 100 Collection portal access is ready',
      heroImage: MOCK_DESTINATION_HERO,
      whatHappensNext: WHAT_HAPPENS_NEXT.activation,
      socialProof: SOCIAL_PROOF.activation,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Teammate invitation',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'TEAM INVITATION',
      urgency: 'default',
      headline: "You're Invited",
      subheadline: `${M.inviterName} has invited you to join ${M.partnerName}'s team.`,
      contextBlock: `${M.inviterName} has invited you to join ${M.partnerName}'s team on the 100 Collection Partner Portal. Click below to accept and create your account. This invitation expires in 14 days.`,
      ctaLabel: 'Accept Invitation',
      ctaUrl: ACCEPT_URL,
      footerNote: 'The 100 Collection team',
      subject: `You're invited to ${M.partnerName}'s 100 Collection Partner Portal`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Property approved (celebratory)',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'WELCOME TO THE COLLECTION',
      urgency: 'success',
      headline: 'Welcome to the Collection',
      subheadline: `${M.propertyName} has been approved.`,
      contextBlock: `This is a milestone moment for ${M.partnerName}. Your property is now officially part of The 100 Collection, and we're thrilled to have it. Our licensing team will be in touch within 48 hours to finalize the details, and your listing will be live on theonehundredcollection.com shortly after. Located in ${M.location}.`,
      ctaLabel: 'View in Your Portal',
      ctaUrl: PORTAL_URL,
      footerNote: 'Cheers to the beginning of a great partnership. — The 100 Collection Team',
      subject: `${M.propertyName} is joining The 100 Collection`,
      heroImage: MOCK_PROPERTY_HERO,
      whatHappensNext: WHAT_HAPPENS_NEXT.homeowner,
      socialProof: SOCIAL_PROOF.activation,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Property submission needs revision',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'REVISIONS REQUESTED',
      urgency: 'warning',
      headline: `Revisions Requested for ${M.propertyName}`,
      subheadline: `Located in ${M.location}.`,
      contextBlock: `Our curation team has reviewed ${M.propertyName} and has the following feedback: Photos need to be higher resolution and better lit. Please resubmit with professional photography. Please log in to your portal, review the feedback, and resubmit when ready.`,
      ctaLabel: 'View Feedback',
      ctaUrl: PORTAL_URL,
      footerNote: '— The 100 Collection Team',
      subject: `Revisions requested for ${M.propertyName}`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Property rejected (respectful)',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'UPDATE ON YOUR SUBMISSION',
      urgency: 'alert',
      headline: 'Update on your submission',
      subheadline: `${M.propertyName} — ${M.location}`,
      contextBlock: `After careful review, our curation team has decided that ${M.propertyName} is not the right fit for The 100 Collection at this time. After careful review, this property does not fit our current luxury positioning. We appreciate the time and detail you shared with us. If your circumstances change or you'd like feedback, please reach out.`,
      ctaLabel: 'Return to Portal',
      ctaUrl: PORTAL_URL,
      footerNote: '— The 100 Collection Team',
      subject: `An update on ${M.propertyName} at The 100 Collection`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Property submission under review',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'UNDER REVIEW',
      urgency: 'default',
      headline: `${M.propertyName} is Now Under Review`,
      subheadline: `Located in ${M.location}.`,
      contextBlock: `Your property ${M.propertyName} is now being reviewed by our curation team. We'll be in touch soon with an update.`,
      ctaLabel: 'View in Portal',
      ctaUrl: PORTAL_URL,
      footerNote: '— The 100 Collection Team',
      subject: `${M.propertyName} is now under review`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Property edit request approved',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'WELCOME TO THE COLLECTION',
      urgency: 'success',
      headline: 'Welcome to the Collection',
      subheadline: `Your edit request for ${M.propertyName} has been approved.`,
      contextBlock: `This is a milestone moment for ${M.partnerName}. Your property is now officially part of The 100 Collection, and we're thrilled to have it. Our licensing team will be in touch within 48 hours to finalize the details, and your listing will be live on theonehundredcollection.com shortly after. Located in ${M.location}.`,
      ctaLabel: 'View in Your Portal',
      ctaUrl: PORTAL_URL,
      footerNote: 'Cheers to the beginning of a great partnership. — The 100 Collection Team',
      subject: `${M.propertyName} is joining The 100 Collection`,
      heroImage: MOCK_PROPERTY_HERO,
      whatHappensNext: WHAT_HAPPENS_NEXT.homeowner,
      socialProof: SOCIAL_PROOF.activation,
      replyPrompt: true,
    }),
  },
  {
    category: 'Partner-facing',
    name: 'Property edit request rejected',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'UPDATE ON YOUR SUBMISSION',
      urgency: 'alert',
      headline: 'Update on your submission',
      subheadline: `${M.propertyName} — ${M.location}`,
      contextBlock: `After careful review, our curation team has decided that ${M.propertyName} is not the right fit for The 100 Collection at this time. The updated description does not meet our editorial guidelines. Please revise and resubmit.`,
      ctaLabel: 'Return to Portal',
      ctaUrl: PORTAL_URL,
      footerNote: '— The 100 Collection Team',
      subject: `An update on ${M.propertyName} at The 100 Collection`,
      replyPrompt: true,
    }),
  },

  // B. Candidate-facing (via buildAdminEmail, replyPrompt only — simple)
  {
    category: 'Candidate-facing',
    name: 'Application under review',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'APPLICATION RECEIVED',
      urgency: 'default',
      headline: 'Application Received',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, thank you for applying for ${M.jobTitle} at ${M.partnerName}. We have received your application and our team is reviewing it now. We will be in touch soon with an update.`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Your application for ${M.jobTitle}`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Candidate-facing',
    name: 'Interview invitation',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'INTERVIEW INVITATION',
      urgency: 'success',
      headline: 'Interview Invitation',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, we have reviewed your application for ${M.jobTitle} at ${M.partnerName} and would love to invite you to interview. We would like to schedule a first-round interview this week. Are you available Thursday or Friday afternoon?`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Interview invitation for ${M.jobTitle}`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Candidate-facing',
    name: 'Offer extended',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'OFFER EXTENDED',
      urgency: 'success',
      headline: 'We Would Like to Offer You the Role',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, we are pleased to extend an offer for ${M.jobTitle} at ${M.partnerName}. We are pleased to extend an offer for the Guest Services Manager role. Please review the details and let us know if you have any questions.`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Offer from ${M.partnerName}`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Candidate-facing',
    name: 'Hired welcome',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'WELCOME ABOARD',
      urgency: 'success',
      headline: 'Welcome Aboard!',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, welcome to the team. We are excited to have you on board for ${M.jobTitle} at ${M.partnerName} and cannot wait to get started.`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Welcome to ${M.partnerName}!`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Candidate-facing',
    name: 'Application rejected',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'APPLICATION UPDATE',
      urgency: 'default',
      headline: 'Application Update',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, thank you for taking the time to apply for ${M.jobTitle} at ${M.partnerName}. After careful review, we have decided to move forward with other candidates. We wish you all the best in your job search.`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Update on your application for ${M.jobTitle}`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Candidate-facing',
    name: 'Position filled courtesy email',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'POSITION FILLED',
      urgency: 'default',
      headline: 'Position Filled',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, thank you for your interest in the ${M.jobTitle} role. We wanted to let you know that this position has been filled. We appreciate the time you took to apply and wish you the best in your job search.`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Update on your application for ${M.jobTitle} at ${M.partnerName}`,
      replyPrompt: true,
    }),
  },
  {
    category: 'Candidate-facing',
    name: 'Position closed no-hire courtesy email',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'POSITION CLOSED',
      urgency: 'default',
      headline: 'Position Closed',
      subheadline: `${M.jobTitle} at ${M.partnerName}`,
      contextBlock: `Hi ${M.candidateName}, thank you for your interest in the ${M.jobTitle} role. We've made the decision to close this position at this time. We have decided to pause this search and may revisit it in the future. We appreciate the time you took to apply and wish you the best in your job search.`,
      footerNote: `Warm regards, The team at ${M.partnerName}`,
      subject: `Update on your application for ${M.jobTitle} at ${M.partnerName}`,
      replyPrompt: true,
    }),
  },

  // C. Admin-facing (Tier 0-1)
  {
    category: 'Admin-facing',
    name: 'New partner application received',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'NEW PARTNER APPLICATION',
      urgency: 'default',
      headline: `New application from ${M.partnerName}`,
      subheadline: 'Property Manager track with 12 properties.',
      contextBlock: `${M.applicantName} applied to join The 100 Collection as a property manager.`,
      dataRows: [
        { label: 'Applicant', value: M.applicantName },
        { label: 'Company', value: M.partnerName },
        { label: 'Track', value: 'Property Manager' },
        { label: 'Properties', value: '12' },
        { label: 'Locations', value: 'Outer Banks, NC' },
        { label: 'Email', value: M.applicantEmail },
        { label: 'How They Heard', value: 'Referral from existing partner' },
      ],
      ctaLabel: 'Review in Admin Hub',
      ctaUrl: `${ADMIN_HUB}?tab=applications`,
      subject: `New application — ${M.partnerName} (Property Manager)`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'New property submission received',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'NEW PROPERTY SUBMISSION',
      urgency: 'default',
      headline: `${M.partnerName} submitted ${M.propertyName}`,
      subheadline: 'A new property is ready for review.',
      contextBlock: `${M.partnerName} submitted ${M.propertyName} for review.`,
      dataRows: [
        { label: 'Property', value: M.propertyName },
        { label: 'Partner', value: M.partnerName },
        { label: 'Market', value: M.location },
        { label: 'Submitted', value: 'July 17, 2026' },
      ],
      ctaLabel: 'Review Submission',
      ctaUrl: REVIEW_URL,
      subject: `NEW PROPERTY SUBMISSION — ${M.propertyName} (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'New job posting created',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'NEW JOB POSTING',
      urgency: 'default',
      headline: `${M.partnerName} posted a new job`,
      subheadline: 'A partner posted a position for review.',
      contextBlock: `${M.partnerName} posted "${M.jobTitle}" in ${M.location}.`,
      dataRows: [
        { label: 'Title', value: M.jobTitle },
        { label: 'Partner', value: M.partnerName },
        { label: 'Location', value: M.location },
        { label: 'Type', value: 'Full Time' },
        { label: 'Department', value: 'Guest Services' },
        { label: 'Compensation', value: '$48,000 to $55,000' },
      ],
      ctaLabel: 'Review Posting',
      ctaUrl: `https://100c-os.base44.app/JobApplications?tab=postings&postingId=${M.jobId}`,
      subject: `New job posting — ${M.jobTitle} (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'New user requesting portal access',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PORTAL ACCESS REQUEST',
      urgency: 'default',
      headline: `${M.applicantName} requested portal access`,
      subheadline: 'Top match: Test Partner Co (92% confidence)',
      contextBlock: `${M.applicantName} from ${M.partnerName} requested access to an existing partner portal.`,
      dataRows: [
        { label: 'Applicant Name', value: M.applicantName },
        { label: 'Email', value: M.applicantEmail },
        { label: 'Company', value: M.partnerName },
        { label: 'Match Confidence', value: '92%' },
        { label: 'Matched Partner', value: M.partnerName },
      ],
      ctaLabel: 'Review Request',
      ctaUrl: `${ADMIN_HUB}?tab=applications`,
      subject: `Portal access request — ${M.applicantName}`,
    }),
  },
  {
    category: 'Admin-facing',
    name: '@mention in review note',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'REVIEW NOTE',
      urgency: 'default',
      headline: `${M.inviterName} mentioned you on ${M.propertyName}`,
      subheadline: 'You were tagged in a review note. Open the submission to see the full context and reply.',
      contextBlock: 'Can you take a look at the photo quality on slide 3? I think we need to request reshoots before this goes live.',
      dataRows: [
        { label: 'Property', value: M.propertyName },
        { label: 'Mentioned By', value: M.inviterName },
      ],
      ctaLabel: 'View Note',
      ctaUrl: REVIEW_URL,
      subject: `You were mentioned on ${M.propertyName}`,
    }),
  },
  {
    category: 'Admin-facing',
    name: '@mention in funnel comment',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'FUNNEL COMMENT',
      urgency: 'default',
      headline: `${M.inviterName} tagged you on ${M.partnerName}`,
      subheadline: 'You were tagged in an onboarding thread comment. Open the funnel tracker to see the full conversation.',
      contextBlock: 'The contract is signed and billing is set up. Can you kick off the listing build this week?',
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Tagged By', value: M.inviterName },
      ],
      ctaLabel: 'Open the thread',
      ctaUrl: `https://100c-os.base44.app/PartnerFunnelTracker?partnerId=${M.partnerId}`,
      subject: `You were tagged on ${M.partnerName}'s onboarding thread`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'Job posting filled',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'JOB POSTING CLOSED',
      urgency: 'success',
      headline: `${M.partnerName} filled ${M.jobTitle}`,
      subheadline: 'The listing is wrapped up and remaining candidates were notified.',
      contextBlock: `${M.partnerName} marked ${M.jobTitle} as filled and noted the hire.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Position', value: M.jobTitle },
        { label: 'Location', value: M.location },
        { label: 'Closed Reason', value: 'Position Filled' },
        { label: 'Hired Person', value: 'Jane Applicant' },
        { label: 'Candidates Notified', value: '7' },
        { label: 'Closed By', value: M.inviterName },
      ],
      ctaLabel: 'View in Admin Hub',
      ctaUrl: `https://100c-os.base44.app/JobApplications?tab=postings&postingId=${M.jobId}`,
      subject: `Position filled — ${M.jobTitle} (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'Job posting closed no-hire',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'JOB POSTING CLOSED',
      urgency: 'default',
      headline: `${M.partnerName} closed ${M.jobTitle}`,
      subheadline: 'The listing has been closed and pending applicants were notified.',
      contextBlock: `${M.partnerName} closed the listing for ${M.jobTitle}.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Position', value: M.jobTitle },
        { label: 'Location', value: M.location },
        { label: 'Closed Reason', value: 'Did not find the right fit' },
        { label: 'Candidates Notified', value: '5' },
        { label: 'Closed By', value: M.inviterName },
      ],
      ctaLabel: 'View in Admin Hub',
      ctaUrl: `https://100c-os.base44.app/JobApplications?tab=postings&postingId=${M.jobId}`,
      subject: `Position closed — ${M.jobTitle} (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'Property edit request submitted',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PROPERTY EDIT REQUEST',
      urgency: 'default',
      headline: `${M.partnerName} requested edits to ${M.propertyName}`,
      subheadline: 'A partner is requesting changes to an existing property.',
      contextBlock: `${M.partnerName} submitted an edit request for ${M.propertyName}. Review the changes before approving.`,
      dataRows: [
        { label: 'Property', value: M.propertyName },
        { label: 'Partner', value: M.partnerName },
        { label: 'Market', value: M.location },
        { label: 'Submitted', value: 'July 17, 2026' },
        { label: 'Existing Property ID', value: 'prop-existing-001' },
      ],
      ctaLabel: 'Review Edit',
      ctaUrl: REVIEW_URL,
      subject: `PROPERTY EDIT REQUEST — ${M.propertyName} (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'Existing-partner access request submitted',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PORTAL ACCESS REQUEST',
      urgency: 'default',
      headline: `${M.applicantName} requested portal access`,
      subheadline: 'No confident match found. Manual review needed.',
      contextBlock: `${M.applicantName} from ${M.partnerName} requested access to an existing partner portal.`,
      dataRows: [
        { label: 'Applicant Name', value: M.applicantName },
        { label: 'Email', value: M.applicantEmail },
        { label: 'Company', value: M.partnerName },
        { label: 'Match Confidence', value: 'No match' },
        { label: 'Matched Partner', value: '—' },
      ],
      ctaLabel: 'Review Request',
      ctaUrl: `${ADMIN_HUB}?tab=applications`,
      subject: `Portal access request — ${M.applicantName}`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'Teammate joined (accepted invitation)',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'TEAMMATE JOINED',
      urgency: 'success',
      headline: `Sarah Mitchell joined ${M.partnerName}`,
      subheadline: 'A teammate accepted their portal invitation and is now active.',
      contextBlock: `Sarah Mitchell accepted the invitation from ${M.inviterName} and now has portal access to ${M.partnerName}.`,
      dataRows: [
        { label: 'Teammate', value: 'Sarah Mitchell' },
        { label: 'Email', value: 'sarah.mitchell@testpartnerco.com' },
        { label: 'Partner', value: M.partnerName },
        { label: 'Invited By', value: M.inviterName },
      ],
      ctaLabel: 'View Partner',
      ctaUrl: `https://100c-os.base44.app/PartnerDetail?id=${M.partnerId}&tab=portal`,
      subject: `Teammate joined — Sarah Mitchell (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing',
    name: 'Teammate invited',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'TEAMMATE INVITED',
      urgency: 'default',
      headline: `${M.inviterName} invited a teammate to ${M.partnerName}`,
      subheadline: 'An invitation email was sent. The teammate will appear in the portal once they accept.',
      contextBlock: `${M.inviterName} sent a portal invitation to sarah.mitchell@testpartnerco.com for ${M.partnerName}.`,
      dataRows: [
        { label: 'Invitee', value: 'sarah.mitchell@testpartnerco.com' },
        { label: 'Email', value: 'sarah.mitchell@testpartnerco.com' },
        { label: 'Role', value: 'Partner (pending acceptance)' },
        { label: 'Partner', value: M.partnerName },
        { label: 'Invited By', value: M.inviterName },
      ],
      ctaLabel: 'View Partner',
      ctaUrl: `https://100c-os.base44.app/PartnerDetail?id=${M.partnerId}&tab=portal`,
      subject: `Teammate invited — sarah.mitchell@testpartnerco.com (${M.partnerName})`,
    }),
  },

  // D. Admin-facing (Tier 2 financial)
  {
    category: 'Admin-facing (Financial)',
    name: 'Payment succeeded',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PAYMENT RECEIVED',
      urgency: 'success',
      headline: `Payment received from ${M.partnerName}`,
      subheadline: `${M.partnerName} just paid their license for ${M.propertyName}.`,
      contextBlock: `A payment was successfully processed for ${M.propertyName}'s license.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Property', value: M.propertyName },
        { label: 'License Number', value: M.licenseNumber },
        { label: 'Amount', value: '$498.00' },
        { label: 'Payment Method', value: 'Visa ending in 4242' },
        { label: 'Stripe Invoice', value: M.invoiceUrl },
      ],
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${M.licenseId}`,
      subject: `Payment received — $498.00 (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing (Financial)',
    name: 'Payment failed',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PAYMENT FAILED',
      urgency: 'alert',
      headline: `Payment failed for ${M.partnerName}`,
      subheadline: 'Immediate follow-up recommended',
      contextBlock: `A payment for ${M.propertyName}'s license could not be processed.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Property', value: M.propertyName },
        { label: 'License Number', value: M.licenseNumber },
        { label: 'Amount', value: '$498.00' },
        { label: 'Failure Reason', value: 'Card declined' },
        { label: 'Attempts', value: '2' },
        { label: 'Next Retry', value: 'July 19, 2026' },
      ],
      callout: 'Suggested next step: Reach out to Sarah Mitchell to update their payment method.',
      ctaLabel: 'View in Stripe',
      ctaUrl: M.invoiceUrl,
      secondaryCtaLabel: 'Manage License',
      secondaryCtaUrl: `https://100c-os.base44.app/Licenses?licenseId=${M.licenseId}`,
      subject: `Payment failed — $498.00 (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing (Financial)',
    name: 'Renewal reminder 30 days',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'RENEWAL DUE — 30 DAYS',
      urgency: 'warning',
      headline: `${M.partnerName} renewal in 30 days`,
      subheadline: 'Heads up so you can plan outreach before the renewal date.',
      contextBlock: `The license for ${M.propertyName} is scheduled to renew on ${M.renewalDate}.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Property', value: M.propertyName },
        { label: 'License Number', value: M.licenseNumber },
        { label: 'Renewal Date', value: M.renewalDate },
        { label: 'Annual Fee', value: '$498' },
        { label: 'Auto-Renew', value: 'Yes' },
      ],
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${M.licenseId}`,
      subject: `Renewal in 30 days — ${M.partnerName} (${M.propertyName})`,
    }),
  },
  {
    category: 'Admin-facing (Financial)',
    name: 'Renewal reminder 14 days',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'RENEWAL DUE — 14 DAYS',
      urgency: 'warning',
      headline: `${M.partnerName} renewal in 14 days`,
      subheadline: 'Heads up so you can plan outreach before the renewal date.',
      contextBlock: `The license for ${M.propertyName} is scheduled to renew on ${M.renewalDate}.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Property', value: M.propertyName },
        { label: 'License Number', value: M.licenseNumber },
        { label: 'Renewal Date', value: M.renewalDate },
        { label: 'Annual Fee', value: '$498' },
        { label: 'Auto-Renew', value: 'Yes' },
      ],
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${M.licenseId}`,
      subject: `Renewal in 14 days — ${M.partnerName} (${M.propertyName})`,
    }),
  },
  {
    category: 'Admin-facing (Financial)',
    name: 'Renewal reminder 7 days',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'RENEWAL DUE — 7 DAYS',
      urgency: 'alert',
      headline: `${M.partnerName} renewal in 7 days`,
      subheadline: 'This renewal is coming up soon. Confirm the partner is ready.',
      contextBlock: `The license for ${M.propertyName} is scheduled to renew on ${M.renewalDate}.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Property', value: M.propertyName },
        { label: 'License Number', value: M.licenseNumber },
        { label: 'Renewal Date', value: M.renewalDate },
        { label: 'Annual Fee', value: '$498' },
        { label: 'Auto-Renew', value: 'No' },
      ],
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${M.licenseId}`,
      subject: `Renewal in 7 days — ${M.partnerName} (${M.propertyName})`,
    }),
  },
  {
    category: 'Admin-facing (Financial)',
    name: 'License expired',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'LICENSE EXPIRED',
      urgency: 'alert',
      headline: `License expired for ${M.partnerName}`,
      subheadline: 'The property has been taken off-market. Follow up with the partner about renewal.',
      contextBlock: `The license for ${M.propertyName} expired on July 16, 2026 and the property has been automatically marked as inactive.`,
      dataRows: [
        { label: 'Partner', value: M.partnerName },
        { label: 'Property', value: M.propertyName },
        { label: 'License Number', value: M.licenseNumber },
        { label: 'Expired Date', value: 'July 16, 2026' },
        { label: 'Annual Fee', value: '$498' },
        { label: 'Days Past Due', value: '1' },
      ],
      callout: 'Suggested next step: Contact the partner to confirm renewal intent or initiate offboarding.',
      ctaLabel: 'View License',
      ctaUrl: `https://100c-os.base44.app/Licenses?licenseId=${M.licenseId}`,
      subject: `License expired — ${M.propertyName} (${M.partnerName})`,
    }),
  },
  {
    category: 'Admin-facing (Financial)',
    name: 'Property paused/off-market',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'PROPERTY PAUSED',
      urgency: 'warning',
      headline: `${M.propertyName} was paused by ${M.partnerName}`,
      subheadline: 'The partner paused this property. It is no longer bookable on the site.',
      contextBlock: `${M.partnerName} changed the status of ${M.propertyName} to paused. The listing has been removed from the public site.`,
      dataRows: [
        { label: 'Property', value: M.propertyName },
        { label: 'Partner', value: M.partnerName },
        { label: 'Market', value: M.location },
        { label: 'Previous Status', value: 'Active' },
        { label: 'New Status', value: 'Paused' },
        { label: 'Changed By', value: M.inviterName },
      ],
      ctaLabel: 'View Property',
      ctaUrl: `https://100c-os.base44.app/PropertyDetail?id=${M.submissionId}`,
      subject: `Property paused — ${M.propertyName} (${M.partnerName})`,
    }),
  },

  // E. Admin-facing digests (Tier 3)
  {
    category: 'Admin-facing (Digests)',
    name: 'Daily briefing',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'DAILY BRIEFING',
      urgency: 'default',
      headline: 'Yesterday at The 100 Collection',
      subheadline: 'Thursday, July 16',
      contextBlock: 'Here is a quick rundown of yesterday\'s activity.',
      sections: [
        { title: 'You received 3 new applications', dataRows: [
          { label: 'Seaside Vacations', value: 'Property Manager' },
          { label: 'Coastal Retreats LLC', value: 'Property Manager' },
          { label: 'Buck Cumbo', value: 'Property Owner' },
        ]},
        { title: 'You received 2 new property submissions', dataRows: [
          { label: 'Test Partner Co', value: 'Test Villa Estate' },
          { label: 'Seaside Vacations', value: 'Oceanview Penthouse' },
        ]},
        { title: 'You collected 4 payments totaling $1,992', dataRows: [
          { label: 'Test Partner Co', value: '$498' },
          { label: 'Coastal Retreats', value: '$498' },
          { label: 'Outer Banks Rentals', value: '$498' },
          { label: 'Seaside Vacations', value: '$498' },
        ]},
        { title: 'No payment failures', dataRows: [] },
        { title: '2 new portal signups', dataRows: [
          { label: 'Seaside Vacations', value: 'admin@seaside.com' },
          { label: 'Coastal Retreats', value: 'info@coastalretreats.com' },
        ]},
        { title: '1 job posting closed', dataRows: [
          { label: 'Test Partner Co', value: 'Guest Services Manager (Filled)' },
        ]},
      ],
      ctaLabel: 'Open Admin Hub',
      ctaUrl: ADMIN_HUB,
      subject: 'Daily briefing — Thursday, July 16',
    }),
  },
  {
    category: 'Admin-facing (Digests)',
    name: 'Weekly Monday digest',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'WEEKLY DIGEST',
      urgency: 'default',
      headline: 'Last week at The 100 Collection',
      subheadline: 'July 7 to July 13',
      contextBlock: 'Here is your weekly rhythm summary across partners, properties, and revenue.',
      sections: [
        { title: '12 new applications this week', dataRows: [
          { label: 'Seaside Vacations', value: 'Property Manager' },
          { label: 'Coastal Retreats LLC', value: 'Property Manager' },
          { label: 'Buck Cumbo', value: 'Property Owner' },
          { label: 'Oceanfront Properties', value: 'Property Manager' },
        ]},
        { title: '8 new property submissions', dataRows: [
          { label: 'Test Partner Co', value: 'Test Villa Estate' },
          { label: 'Seaside Vacations', value: 'Oceanview Penthouse' },
          { label: 'Coastal Retreats', value: 'Beachfront Cottage' },
        ]},
        { title: '18 payments collected totaling $8,964', dataRows: [
          { label: 'Test Partner Co', value: '$498' },
          { label: 'Seaside Vacations', value: '$996' },
          { label: 'Coastal Retreats', value: '$498' },
        ]},
        { title: '3 new partners went live', dataRows: [
          { label: 'Seaside Vacations', value: 'Nags Head, NC' },
          { label: 'Coastal Retreats', value: 'Kill Devil Hills, NC' },
          { label: 'Oceanfront Properties', value: 'Kitty Hawk, NC' },
        ]},
        { title: '2 payment failures need attention', dataRows: [
          { label: 'Outer Banks Rentals', value: 'Card declined' },
          { label: 'Beachfront Co', value: 'Insufficient funds' },
        ]},
        { title: '5 job postings closed', dataRows: [
          { label: 'Test Partner Co', value: 'Guest Services Manager (Filled)' },
          { label: 'Seaside Vacations', value: 'Housekeeper (Closed)' },
        ]},
      ],
      ctaLabel: 'Open Admin Hub',
      ctaUrl: ADMIN_HUB,
      subject: 'Weekly digest — July 7 to July 13',
    }),
  },
  {
    category: 'Admin-facing (Digests)',
    name: 'Monthly billing summary',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'MONTHLY BILLING SUMMARY',
      urgency: 'default',
      headline: 'June billing summary',
      subheadline: 'June 1 to June 30',
      contextBlock: 'Here is your monthly financial rhythm and billing health summary.',
      sections: [
        { title: 'Revenue collected: $42,834', dataRows: [
          { label: 'License fees', value: '$38,346' },
          { label: 'Onboarding fees', value: '$4,488' },
          { label: 'Outstanding', value: '$2,988' },
        ]},
        { title: '64 active licenses', dataRows: [
          { label: 'New this month', value: '8' },
          { label: 'Renewed', value: '12' },
          { label: 'Expired', value: '2' },
          { label: 'Avg annual fee', value: '$498' },
        ]},
        { title: 'Payment health', dataRows: [
          { label: 'Successful payments', value: '52' },
          { label: 'Failed payments', value: '6' },
          { label: 'Success rate', value: '89.7%' },
          { label: 'Recovery rate', value: '83%' },
        ]},
        { title: '4 partners need billing follow-up', dataRows: [
          { label: 'Outer Banks Rentals', value: '2 failed payments' },
          { label: 'Beachfront Co', value: 'Overdue invoice' },
          { label: 'Coastal Retreats', value: 'Expired card' },
          { label: 'Seaside Vacations', value: 'Pending renewal' },
        ]},
        { title: 'Upcoming renewals (next 30 days)', dataRows: [
          { label: 'Test Partner Co', value: 'Aug 16 — $498' },
          { label: 'Seaside Vacations', value: 'Aug 22 — $996' },
          { label: 'Coastal Retreats', value: 'Aug 28 — $498' },
        ]},
      ],
      ctaLabel: 'Open Billing',
      ctaUrl: 'https://100c-os.base44.app/Billing',
      subject: 'Monthly billing summary — June 2026',
    }),
  },

  // F. Auto-reply (via buildAdminEmail with Wander polish)
  {
    category: 'Auto-reply',
    name: 'PartnerApplication auto-reply to applicant',
    run: async (b, to, p) => sendAdmin(b, to, p, {
      eventType: 'APPLICATION RECEIVED',
      urgency: 'default',
      headline: 'Thank You for Your Interest',
      subheadline: 'Your application to join The 100 Collection is under review.',
      contextBlock: `Hi ${M.applicantName}, thank you for applying to join The 100 Collection. We have received your application and our team will review it carefully. If your properties are a good fit for our curated collection, we will reach out within 3 to 5 business days to schedule an introductory call. In the meantime, feel free to explore theonehundredcollection.com to learn more about our partner community.`,
      ctaLabel: 'Explore The Collection',
      ctaUrl: 'https://theonehundredcollection.com',
      footerNote: 'Warm regards, The 100 Collection Partnerships Team',
      subject: 'Thank you for your interest in The 100 Collection',
      heroImage: MOCK_DESTINATION_HERO,
      whatHappensNext: WHAT_HAPPENS_NEXT.application,
      socialProof: SOCIAL_PROOF.application,
      replyPrompt: true,
    }),
  },
];

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { recipient_email, subjectPrefix = '[TEST] ' } = body;

    if (!recipient_email) {
      return Response.json({ error: 'recipient_email is required' }, { status: 400 });
    }

    const prefix = subjectPrefix || '[TEST] ';

    // Get current user for audit log
    let actorEmail = 'unknown';
    try {
      const user = await base44.auth.me();
      if (user?.email) actorEmail = user.email;
    } catch (e) {}

    const sent = [];
    const failed = [];
    const skipped = [];

    for (const v of VARIATIONS) {
      try {
        const r = await v.run(base44, recipient_email, prefix);
        if (r.skipped) {
          skipped.push({ variation: v.name, subject: r.subject, status: 'skipped', reason: 'Resend not configured' });
        } else if (r.ok) {
          sent.push({ variation: v.name, subject: r.subject, status: 'sent' });
        } else {
          failed.push({ variation: v.name, subject: r.subject, status: 'failed', error: 'Send returned non-ok' });
        }
        console.log(`[sendAllTestEmails] ${v.name}: ${r.skipped ? 'skipped' : r.ok ? 'sent' : 'failed'}`);
      } catch (e) {
        const errMsg = e?.message || 'unknown error';
        if (errMsg.includes('not yet deployed') || errMsg.includes('Could not find function')) {
          skipped.push({ variation: v.name, subject: '', status: 'skipped', reason: 'not yet deployed' });
          console.log(`[sendAllTestEmails] ${v.name}: skipped (not yet deployed)`);
        } else {
          failed.push({ variation: v.name, subject: '', status: 'failed', error: errMsg });
          console.log(`[sendAllTestEmails] ${v.name}: failed — ${errMsg}`);
        }
      }
      await delay(500);
    }

    // Create audit entry
    try {
      await base44.asServiceRole.entities.AuditEntry.create({
        actor_email: actorEmail,
        actor_role: 'admin',
        action: 'email_qa_run',
        entity_type: 'EmailQA',
        details: JSON.stringify({
          recipient: recipient_email,
          sent_count: sent.length,
          failed_count: failed.length,
          skipped_count: skipped.length,
          run_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.warn('[sendAllTestEmails] could not create audit entry:', e.message);
    }

    return Response.json({
      ok: true,
      recipient: recipient_email,
      sent,
      failed,
      skipped,
      total: VARIATIONS.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});