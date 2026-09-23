export const TECH_STACK_STEPS = [
  { num: 1, label: "Property Management & Distribution", category: "Distribution & PMS", short: "PMS & Distribution" },
  { num: 2, label: "Pricing & Operations", category: "Pricing & Operations", short: "Pricing & Ops" },
  { num: 3, label: "Guest Experience & Trust", category: "Guest Experience & Trust", short: "Guest Experience" },
  { num: 4, label: "Marketing, Finance & Tools", category: "Marketing, Finance & Tools", short: "Marketing & Finance" },
];

export const STEP_LABELS = TECH_STACK_STEPS.map(s => s.short);

export const TECH_STACK_FIELDS = [
  // Step 1 — Property Management & Distribution
  { key: "pms", label: "PMS", type: "select", step: 1, options: ["Streamline", "Track", "Escapia / V12.NET", "Hostfully", "Guesty", "OwnerRez", "LiveRez", "BookerVille", "Rezfusion / Hospitality Cloud", "Direct (custom)", "Other"] },
  { key: "booking_engine", label: "Booking Engine", type: "select", step: 1, options: ["Rezfusion", "Bookerville", "Lodgify", "Smoobu", "Custom / In-house", "Same as PMS", "Other"] },
  { key: "channel_manager", label: "Channel Manager", type: "select", step: 1, options: ["Rentals United", "Hostaway", "MyVR", "Hostex", "NextPax", "Same as PMS", "None", "Other"] },
  { key: "otas", label: "OTAs", type: "multiselect", step: 1, options: ["Airbnb", "VRBO", "Booking.com", "Expedia", "Marriott Homes & Villas", "Plum Guide", "Tablet Hotels", "None", "Other"] },
  // Step 2 — Pricing & Operations
  { key: "dynamic_pricing", label: "Dynamic Pricing", type: "select", step: 2, options: ["PriceLabs", "Wheelhouse", "Beyond Pricing", "DPGO", "AirDNA Rentalizer", "Manual / In-house", "None", "Other"] },
  { key: "cleaning_software", label: "Cleaning Software", type: "select", step: 2, options: ["Breezeway", "Properly", "Operto Teams", "Turno (TurnoverBnB)", "ResortCleaning", "Manual / Spreadsheets", "Other"] },
  { key: "smart_locks", label: "Smart Locks", type: "select", step: 2, options: ["RemoteLock", "PointCentral", "August", "Schlage Encode", "Operto Boost", "NUKI", "None", "Other"] },
  { key: "noise_monitoring", label: "Noise Monitoring", type: "select", step: 2, options: ["NoiseAware", "Minut", "Roomonitor", "None", "Other"] },
  // Step 3 — Guest Experience & Trust
  { key: "guest_communication", label: "Guest Communication", type: "select", step: 3, options: ["Hostfully Inbox", "Guesty Inbox", "Hospitable (Smartbnb)", "Enso Connect", "Touch Stay messaging", "Manual / Email", "Other"] },
  { key: "digital_guidebook", label: "Digital Guidebook", type: "select", step: 3, options: ["Touch Stay", "Hostfully Guidebooks", "RueBaRue", "YourWelcome", "None", "Other"] },
  { key: "guest_screening", label: "Guest Screening", type: "select", step: 3, options: ["SuperHog", "Safely", "Autohost", "Know Your Guest", "None", "Other"] },
  { key: "damage_protection", label: "Damage Protection", type: "select", step: 3, options: ["Safely", "RentalGuardian", "SuperHog", "Waivo", "Self-insured", "None", "Other"] },
  // Step 4 — Marketing, Finance & Tools
  { key: "website_platform", label: "Website Platform", type: "select", step: 4, options: ["WordPress", "Squarespace", "Webflow", "Shopify", "Custom / Bespoke", "Hosted PMS site", "Other"] },
  { key: "crm", label: "CRM", type: "select", step: 4, options: ["HubSpot", "Salesforce", "Pipedrive", "ActiveCampaign", "Spreadsheets", "None", "Other"] },
  { key: "email_marketing", label: "Email Marketing", type: "select", step: 4, options: ["Klaviyo", "Mailchimp", "ActiveCampaign", "Sendlane", "Sendinblue / Brevo", "None", "Other"] },
  { key: "analytics", label: "Analytics", type: "multiselect", step: 4, options: ["Google Analytics 4", "Google Tag Manager", "Plausible", "Mixpanel", "PMS Native", "None", "Other"] },
  { key: "payment_processor", label: "Payment Processor", type: "select", step: 4, options: ["Stripe", "Lynnbrook Group", "Ascent", "Yapstone", "Square", "PMS Default", "Other"] },
  { key: "accounting", label: "Accounting", type: "select", step: 4, options: ["QuickBooks", "Xero", "Bookkeeper360", "Wave", "Manual / Spreadsheets", "Other"] },
  { key: "additional_tools", label: "Additional Tools", type: "textarea", step: 4, placeholder: "Any other tools or software you use that we should know about…" },
  // Admin-only
  { key: "notes", label: "Internal Notes", type: "textarea", step: 4, adminOnly: true, placeholder: "Internal admin notes — not partner-visible" },
];

export const EMPTY_TECH_STACK = {};
TECH_STACK_FIELDS.forEach(f => {
  EMPTY_TECH_STACK[f.key] = f.type === "multiselect" ? [] : "";
  if (f.type === "select" || f.type === "multiselect") {
    EMPTY_TECH_STACK[f.key + "_other"] = "";
  }
});