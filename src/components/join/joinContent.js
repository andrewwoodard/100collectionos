import {
  Building2,
  Home,
  Users,
  Sparkles,
  UserCheck,
  TrendingUp,
  Network,
  LogIn,
  ClipboardCheck,
  Phone,
  Rocket,
  ShieldCheck,
  KeyRound,
  UserPlus,
} from "lucide-react";

// Segmentation tabs shown on /join. `id` maps to the experiment_segment value
// stored on the PartnerApplication record.
export const SEGMENTS = [
  { id: "property_manager", label: "I manage vacation rentals", icon: Building2 },
  { id: "homeowner", label: "I own a home", icon: Home },
  { id: "existing_partner", label: "I already work with the Collection", icon: Users },
];

// Tailored value props per segment. VRM gets four cards (brand differentiation
// for selling new homeowners is flagged first). Copy uses no em dashes and no
// exclamation points per Buck's brand voice.
export const VALUE_PROPS = {
  property_manager: [
    {
      icon: Users,
      title: "Win New Homeowners",
      body: "Pitch prospective homeowners with a nationally-recognized brand behind your name. Being part of The 100 Collection becomes your differentiator against every other manager in your market.",
    },
    {
      icon: Sparkles,
      title: "Elevate Your Brand",
      body: "Position your company among leading vacation rental brands, building recognition where every rental otherwise looks the same.",
    },
    {
      icon: UserCheck,
      title: "Guests Who Choose the Collection",
      body: "Travelers who plan carefully and stay well. Your properties gain exposure to an audience searching for editorial-quality homes.",
    },
    {
      icon: TrendingUp,
      title: "Grow Direct Bookings",
      body: "Editorial features and destination pages route travelers straight to you, so you build demand while keeping the guest relationship.",
    },
  ],
  homeowner: [
    {
      icon: Sparkles,
      title: "Editorial Presentation",
      body: "A magazine-quality feature written by our team, not a marketplace listing.",
    },
    {
      icon: UserCheck,
      title: "Curated Guests",
      body: "Bookings from travelers who value what you have built.",
    },
    {
      icon: Network,
      title: "A Trusted Network",
      body: "If you want professional management, our partner managers are held to the Collection standard. If you self-manage, you keep full control while gaining the Collection's brand halo.",
    },
  ],
  existing_partner: [
    {
      icon: LogIn,
      title: "Instant Portal Access",
      body: "Sign in with the email your partner uses. If you need access for your team, request it here.",
    },
    {
      icon: Users,
      title: "Team Management",
      body: "Invite teammates in Marketing, Finance, or Operations roles. Everyone sees only what they need.",
    },
  ],
};

// Three-step "what happens next" timeline per segment.
export const WHAT_NEXT = {
  property_manager: [
    { icon: ClipboardCheck, title: "Review", body: "3 days. We read every application personally." },
    { icon: Phone, title: "Onboarding call", body: "Within 1 week, we walk through your portfolio and goals." },
    { icon: Rocket, title: "Live on the Collection", body: "21 to 30 days from approval to fully live." },
  ],
  homeowner: [
    { icon: ClipboardCheck, title: "Review", body: "3 days. We read every application personally." },
    { icon: Phone, title: "Introduction call", body: "Within 1 week, we learn about your home." },
    { icon: Rocket, title: "Live on the Collection", body: "14 to 21 days from approval to fully live." },
  ],
  existing_partner: [
    { icon: ShieldCheck, title: "Verify", body: "24 hours. We confirm your team affiliation." },
    { icon: KeyRound, title: "Portal access granted", body: "Sign in to your partner portal." },
    { icon: UserPlus, title: "Team invited", body: "Invite teammates as needed." },
  ],
};