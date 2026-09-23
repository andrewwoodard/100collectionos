import React from "react";
import { Link } from "react-router-dom";
import PortalLayout from "../../components/portal/PortalLayout";
import HelpContactModal from "../../components/portal/HelpContactModal";
import {
  FileSignature, PenLine,
  CheckCircle2, ArrowRight, Clock, Users, Sparkles, HelpCircle, LayoutTemplate, Rocket
} from "lucide-react";

const NAVY = "#0D1B2A";
const GOLD = "#C9A96E";

const STAGES = [
  {
    id: "approved",
    label: "Approved",
    icon: Sparkles,
    color: "slate",
    tagline: "You're in. Welcome to The 100 Collection.",
    intro: "Your application has been reviewed and approved. A dedicated onboarding contact will reach out within two business days to kick things off.",
    duration: "Same day",
    partnerSteps: [
      { title: "Watch your inbox", body: "Keep an eye out for your kickoff email. It introduces your onboarding team and outlines next steps." },
      { title: "Add your team members", body: "Invite teammates from the Team page so the right people receive updates and can collaborate in the portal.", link: "/portal/team", linkLabel: "Go to Team" },
    ],
    teamSteps: [
      "Your onboarding lead is assigned",
      "Kickoff email sent with your roadmap",
    ],
  },
  {
    id: "contracted",
    label: "Contracted",
    icon: FileSignature,
    color: "blue",
    tagline: "Let's make it official.",
    intro: "We send your licensing agreement and set up billing. This stage locks in your partnership terms and onboarding fee.",
    duration: "1 day",
    partnerSteps: [
      { title: "Review your contract", body: "Read through the licensing agreement sent by your contact. Reach out with any questions before signing." },
      { title: "Sign your contract", body: "E-sign your agreement to move forward. Your onboarding can't proceed until this is complete." },
      { title: "Pay your onboarding fee", body: "Once invoiced, pay the one-time onboarding fee. Billing setup happens on our end in parallel." },
    ],
    teamSteps: [
      "Contract prepared and sent to you",
      "Stripe billing account created",
      "Onboarding fee invoice issued",
    ],
  },
  {
    id: "content",
    label: "Content",
    icon: PenLine,
    color: "purple",
    tagline: "We craft your story.",
    intro: "Our writers interview you and produce the destination write-up and property narrative that will appear on theonehundredcollection.com.",
    duration: "1 day",
    partnerSteps: [
      { title: "Complete the intake form", body: "Fill out the intake form we share with you. The more detail, the richer your write-up." },
      { title: "Schedule your writer interview", body: "Book a short call with our content team. We'll capture what makes your destination and homes distinctive." },
      { title: "Review and approve your write-up", body: "You'll receive a draft to review. Approve it or request edits before it goes live." },
    ],
    teamSteps: [
      "Content folder created for your assets",
      "Post-call recap sent to you",
      "Write-up drafted by our writers",
    ],
  },
  {
    id: "build",
    label: "Build",
    icon: LayoutTemplate,
    color: "amber",
    tagline: "Your listing comes together.",
    intro: "We build out your property pages, install analytics, and coordinate the technical setup with your existing website and VRM.",
    duration: "1 day",
    partnerSteps: [
      { title: "Share your property details", body: "Submit your properties through the portal so our team can build the listings.", link: "/portal/add-property", linkLabel: "Add a Property" },
      { title: "Grant access to your website", body: "Provide access so we can install your header, GA tag, and landing page. Coordinate any logins with your onboarding contact." },
      { title: "Approve your header mock-up", body: "Review the proud header design we prepare for your site and approve it before it's added." },
    ],
    teamSteps: [
      "Analytics and GA tag installed",
      "VRM landing page created",
      "Proud header designed and added to your site",
    ],
  },
  {
    id: "listed",
    label: "Listed",
    icon: Rocket,
    color: "emerald",
    tagline: "You're live with The 100 Collection.",
    intro: "Your properties are live on the site and we announce your launch. Welcome to the Collection.",
    duration: "Same day",
    partnerSteps: [
      { title: "Review your live listing", body: "Visit your property pages on theonehundredcollection.com and confirm everything looks great.", link: "/portal/properties", linkLabel: "My Properties" },
      { title: "Share the announcement", body: "We'll send a launch announcement email. Feel free to share it across your social channels." },
      { title: "Manage billing going forward", body: "Annual licensing renewals appear in Billing. Set up automated billing to keep things hands-off.", link: "/portal/billing", linkLabel: "Billing & Licensing" },
    ],
    teamSteps: [
      "Listing fully live on the site",
      "Launch announcement email sent to your audience",
    ],
  },
];

const COLOR_MAP = {
  slate: { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-200", dot: "bg-slate-400" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", dot: "bg-blue-400" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200", dot: "bg-purple-400" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", dot: "bg-amber-400" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-400" },
};

function StageCard({ stage, index }) {
  const c = COLOR_MAP[stage.color];
  const Icon = stage.icon;
  return (
    <div className="relative">
      {/* Connector */}
      {index < STAGES.length - 1 && (
        <div className="hidden md:block absolute left-[27px] top-16 bottom-0 w-px bg-slate-200" />
      )}
      <div className="flex gap-4 md:gap-6">
        {/* Number bubble */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${c.bg} ring-4 ${c.ring}`}>
            <Icon className={`w-6 h-6 ${c.text}`} />
          </div>
          <span className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Step {index + 1}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 pb-10">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-xl font-medium" style={{ color: NAVY, fontFamily: "var(--font-serif)" }}>
              {stage.label}
            </h2>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text} flex items-center gap-1`}>
              <Clock className="w-3 h-3" /> {stage.duration}
            </span>
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: GOLD }}>{stage.tagline}</p>
          <p className="text-sm text-slate-500 leading-relaxed mb-5 max-w-2xl">{stage.intro}</p>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Partner actions */}
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" style={{ color: NAVY }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY }}>
                  What you do
                </span>
              </div>
              <ul className="space-y-3">
                {stage.partnerSteps.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-700">{step.title}</div>
                      <div className="text-xs text-slate-500 leading-relaxed mt-0.5">{step.body}</div>
                      {step.link && (
                        <Link to={step.link} className="inline-flex items-center gap-1 text-xs font-medium mt-1.5 hover:underline" style={{ color: GOLD }}>
                          {step.linkLabel} <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Team actions */}
            <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  What we handle
                </span>
              </div>
              <ul className="space-y-2.5">
                {stage.teamSteps.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <div className={`w-4 h-4 rounded-full ${c.dot} flex-shrink-0 mt-0.5 flex items-center justify-center`}>
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm text-slate-600">{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingGuide() {
  const [helpOpen, setHelpOpen] = React.useState(false);

  return (
    <PortalLayout>
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl mb-8" style={{ background: NAVY }}>
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #fff 0, transparent 40%)" }} />
          <div className="relative px-6 py-8 md:px-10 md:py-10">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              Property Manager Onboarding
            </span>
            <h1 className="text-3xl md:text-4xl mt-2 mb-3 text-white" style={{ fontFamily: "var(--font-serif)" }}>
              Your journey with The 100 Collection
            </h1>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl">
              From approved application to live listing, here's exactly what to expect at every stage,
              what we'll handle, and what we'll need from you along the way.
            </p>
            <div className="flex flex-wrap gap-4 mt-6">
              <Link to="/portal/dashboard" className="inline-flex items-center gap-2 bg-white text-slate-800 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                onClick={() => setHelpOpen(true)}
                className="inline-flex items-center gap-2 text-slate-300 text-sm font-medium px-4 py-2 rounded-lg hover:bg-white/10 transition-colors border border-white/15"
              >
                <HelpCircle className="w-4 h-4" /> Questions? Reach out
              </button>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { icon: FileSignature, label: "5 stages", sub: "Approved to Listed" },
            { icon: Clock, label: "2–4 days", sub: "Typical end-to-end" },
            { icon: Users, label: "Your team", sub: "Involved at every step" },
            { icon: Rocket, label: "Going live", sub: "The grand finale" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${GOLD}1a` }}>
                  <Icon className="w-4 h-4" style={{ color: GOLD }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{s.label}</div>
                  <div className="text-[11px] text-slate-400 truncate">{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stage timeline */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-8">
          {STAGES.map((stage, i) => (
            <StageCard key={stage.id} stage={stage} index={i} />
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-6 bg-slate-50 rounded-xl border border-slate-100 p-5 flex items-start gap-3">
          <HelpCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
          <div className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Have a question about your onboarding?</strong> Your dedicated
            onboarding contact is your best resource, and you can always reach the team using the help button.
            Timelines are typical but can vary based on how quickly each step is completed.
          </div>
        </div>
      </div>

      {helpOpen && <HelpContactModal partner={null} onClose={() => setHelpOpen(false)} />}
    </PortalLayout>
  );
}