// Mock context for email template previews.
// Provides realistic values for {{variable}} tokens so admins can see
// exactly what an email will look like when sent with real data.

export const MOCK_CONTEXT = {
  partner: {
    partner_name: 'Test Partner Co',
    primary_contact_name: 'Sarah Mitchell',
    primary_contact_email: 'sarah@testpartnerco.com',
    market: 'Nags Head',
    region: 'NC',
  },
  property: {
    property_name: 'Test Villa Estate',
    location: 'Nags Head, NC',
    location_full: 'Nags Head, NC, United States',
    bedrooms: 5,
    bathrooms: 4,
    listing_url: 'https://vrbo.com/12345',
    first_photo: 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200&auto=format&fit=crop&q=80',
  },
  submission: {
    revision_message: 'Photos need to be higher resolution and better lit. Please resubmit with professional photography.',
    admin_notes: '',
    partner_facing_message: 'Photos need to be higher resolution and better lit. Please resubmit with professional photography.',
  },
  invoice: {
    amount: 498,
    license_number: 'T100-2026-0042',
    renewal_date: 'August 16, 2026',
  },
  application: {
    first_name: 'Sarah',
    last_name: 'Mitchell',
    full_name: 'Sarah Mitchell',
    email: 'sarah@testpartnerco.com',
    company_name: 'Test Partner Co',
    submitted_properties_count: 12,
  },
  homeowner: {
    first_name: 'Emma',
    home_name: 'Windswept Cottage',
    properties: ['Windswept Cottage', 'Duneside Villa', 'Marsh Wren Retreat'],
    properties_count: 3,
    location: 'Cherry Grove Beach, SC',
  },
  candidate: {
    name: 'Jane Applicant',
    email: 'jane.applicant@email.com',
    job_title: 'Guest Services Manager',
  },
  teammate: {
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@testpartnerco.com',
    role: 'Marketing',
  },
  inviter: {
    name: 'Buck Cumbo',
  },
  reviewed_by: {
    name: 'Buck Cumbo',
  },
};

// Available variables grouped by context key, for the admin variable helper panel.
export const VARIABLE_GROUPS = [
  {
    group: 'partner',
    label: 'Partner',
    variables: [
      { token: 'partner.partner_name', label: 'Partner name' },
      { token: 'partner.primary_contact_name', label: 'Primary contact name' },
      { token: 'partner.primary_contact_email', label: 'Primary contact email' },
      { token: 'partner.market', label: 'Market' },
      { token: 'partner.region', label: 'Region' },
    ],
  },
  {
    group: 'property',
    label: 'Property',
    variables: [
      { token: 'property.property_name', label: 'Property name' },
      { token: 'property.location', label: 'Location' },
      { token: 'property.location_full', label: 'Full location' },
      { token: 'property.bedrooms', label: 'Bedrooms' },
      { token: 'property.bathrooms', label: 'Bathrooms' },
      { token: 'property.listing_url', label: 'Listing URL' },
      { token: 'property.first_photo', label: 'First photo URL' },
    ],
  },
  {
    group: 'submission',
    label: 'Submission',
    variables: [
      { token: 'submission.revision_message', label: 'Revision message' },
      { token: 'submission.admin_notes', label: 'Admin notes' },
      { token: 'submission.partner_facing_message', label: 'Partner-facing message' },
    ],
  },
  {
    group: 'invoice',
    label: 'Invoice / License',
    variables: [
      { token: 'invoice.amount', label: 'Amount' },
      { token: 'invoice.license_number', label: 'License number' },
      { token: 'invoice.renewal_date', label: 'Renewal date' },
    ],
  },
  {
    group: 'application',
    label: 'Application',
    variables: [
      { token: 'application.first_name', label: 'First name' },
      { token: 'application.last_name', label: 'Last name' },
      { token: 'application.full_name', label: 'Full name' },
      { token: 'application.email', label: 'Email' },
      { token: 'application.company_name', label: 'Company name' },
      { token: 'application.submitted_properties_count', label: 'Properties count' },
    ],
  },
  {
    group: 'homeowner',
    label: 'Homeowner',
    variables: [
      { token: 'homeowner.first_name', label: 'First name' },
      { token: 'homeowner.home_name', label: 'Home name' },
      { token: 'homeowner.properties_count', label: 'Properties count' },
      { token: 'homeowner.location', label: 'Location' },
    ],
  },
  {
    group: 'candidate',
    label: 'Candidate',
    variables: [
      { token: 'candidate.name', label: 'Name' },
      { token: 'candidate.email', label: 'Email' },
      { token: 'candidate.job_title', label: 'Job title' },
    ],
  },
  {
    group: 'teammate',
    label: 'Teammate',
    variables: [
      { token: 'teammate.name', label: 'Name' },
      { token: 'teammate.email', label: 'Email' },
      { token: 'teammate.role', label: 'Role' },
    ],
  },
  {
    group: 'inviter',
    label: 'Inviter / Reviewer',
    variables: [
      { token: 'inviter.name', label: 'Inviter name' },
      { token: 'reviewed_by.name', label: 'Reviewer name' },
    ],
  },
];