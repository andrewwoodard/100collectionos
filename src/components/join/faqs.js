// Per-segment FAQ content for the /join experiment. Hardcoded here so the
// marketing copy stays versioned with the page and doesn't require a DB round
// trip. Keys match the experiment_segment values stored on applications.

export const FAQS = {
  property_manager: [
    {
      question: "What kind of vacation rental company is a fit for the Collection?",
      answer:
        "We look for professionally-managed companies with 5 or more premium properties in destinations our travelers seek out. Editorial-quality photography, hospitality standards that go beyond a keycode drop, and a real story behind the brand all matter more than size alone.",
    },
    {
      question: "How does being in the Collection help me win new homeowners?",
      answer:
        "Prospective homeowners are choosing between vacation rental managers who mostly look alike from the outside. Being able to say your company is one of 91+ managers curated into a national brand gives you a differentiator that's hard for a solo manager to match.",
    },
    {
      question: "Do you take a commission on our bookings?",
      answer:
        "No. We license your inclusion in the Collection annually per property. Bookings flow to your direct booking channels and you keep the guest relationship.",
    },
    {
      question: "What's required from us to be listed?",
      answer:
        "A signed Partner License Agreement, brand integration on four surfaces (your website header, footer, email confirmations, and social bio), a short editorial interview with our writer, and high-resolution photography for each property.",
    },
    {
      question: "How long does onboarding take?",
      answer:
        "Most VRM partners are fully live within 21 to 30 days of acceptance. Timing depends on how quickly we can finalize agreements and receive photography.",
    },
  ],
  homeowner: [
    {
      question: "Do I need to have a professional manager to join?",
      answer:
        "No. We accept both owner-operated homes and homes managed by our partner property managers. Either way, your home is presented editorially and gains the Collection's brand association.",
    },
    {
      question: "What kind of homes are accepted?",
      answer:
        "Distinctive homes with a real point of view. Architectural personality, professional photography, and a story behind the property matter more than size or price point. We are curating, not aggregating.",
    },
    {
      question: "How much does it cost?",
      answer:
        "We license your home in the Collection annually. Pricing is on a per-property basis and we'll share specifics on the introduction call. Bookings flow to your direct booking channels or your chosen manager.",
    },
    {
      question: "Who books my home?",
      answer:
        "Travelers who found your listing through The 100 Collection editorial site or your existing direct booking channels. We don't take bookings ourselves. Guests come to your platform through us.",
    },
    {
      question: "How long does onboarding take?",
      answer: "Most homeowner partners are fully live within 14 to 21 days of acceptance.",
    },
  ],
  existing_partner: [
    {
      question: "I already work with a Collection partner. Why do I need my own portal login?",
      answer:
        "Teammates get their own login so notifications, permissions, and audit history stay clean. Your owner can invite you in Marketing, Finance, or Operations roles and you only see what you need.",
    },
    {
      question: "I forgot which email is on file for our company. What do I do?",
      answer:
        "Enter the email you'd like to use below. If it doesn't match our records, we'll route your request to your company's primary contact for approval.",
    },
    {
      question: "How quickly will I get access?",
      answer:
        "Existing partner access requests are typically approved within 24 hours during weekdays.",
    },
  ],
};