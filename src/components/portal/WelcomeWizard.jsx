import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, ArrowRight, Home, User, CreditCard, PartyPopper, X, ListChecks } from "lucide-react";
import HelpContactModal from "./HelpContactModal";

// Step order leads with "Add Properties" so new partners immediately see the
// primary instruction (adding their properties) right after the welcome.
const STEPS = [
  { id: "welcome",  label: "Welcome" },
  { id: "property", label: "Add Properties" },
  { id: "profile",  label: "Profile" },
  { id: "payment",  label: "Payment" },
  { id: "done",     label: "Done" },
];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
            i < current ? "bg-[#C9A96E] text-[#0D1B2A]"
            : i === current ? "bg-[#0D1B2A] text-white"
            : "bg-slate-100 text-slate-400"
          }`}>
            {i < current ? <CheckCircle className="w-4 h-4" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 transition-all ${i < current ? "bg-[#C9A96E]" : "bg-slate-200"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function WelcomeWizard({ user, onDismiss }) {
  const [step, setStep] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  const next = () => setStep(s => s + 1);

  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="text-center">
            <div className="w-16 h-16 bg-[#C9A96E]/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <span className="text-3xl">👋</span>
            </div>
            <h2 className="text-2xl font-light text-[#0D1B2A] mb-3">
              Welcome to The 100 Collection, {user?.full_name?.split(" ")[0] || "Partner"}
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-5">
              You're now part of an exclusive network of the world's finest vacation properties. The first thing you'll do is <strong className="text-[#0D1B2A]">add your properties</strong> so our curation team can review them.
            </p>
            <div className="bg-[#0D1B2A] rounded-2xl p-4 text-left max-w-sm mx-auto mb-6">
              <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-widest mb-2">Here's what's next</div>
              <ol className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0" /> Add your properties for review</li>
                <li className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0" /> Complete your partner profile</li>
                <li className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0" /> We set up your billing</li>
              </ol>
            </div>
            <button onClick={next} className="inline-flex items-center gap-2 bg-[#0D1B2A] text-white font-medium text-sm px-6 py-3 rounded-xl hover:bg-[#1a2e45] transition-colors">
              Let's add your properties <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      case 1:
        return (
          <div className="text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Home className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-xl font-light text-[#0D1B2A] mb-2">Add Your Properties</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-4">
              Ready to get listed? Add each property you'd like in The 100 Collection and submit it for our curation team to review. We'll guide you through every step.
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-left text-sm text-slate-600 leading-relaxed max-w-sm mx-auto mb-6 space-y-2">
              <p className="flex items-start gap-2"><span className="text-[#C9A96E] font-semibold mt-0.5">1.</span> Paste a listing URL (Airbnb, VRBO, or your direct site)</p>
              <p className="flex items-start gap-2"><span className="text-[#C9A96E] font-semibold mt-0.5">2.</span> We auto-extract photos and details, then you refine them</p>
              <p className="flex items-start gap-2"><span className="text-[#C9A96E] font-semibold mt-0.5">3.</span> Submit for review — you can add as many as you like</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/portal/add-property" onClick={onDismiss}
                className="inline-flex items-center justify-center gap-2 bg-[#C9A96E] text-[#0D1B2A] font-semibold text-sm px-6 py-3 rounded-xl hover:bg-[#b8935a] transition-colors">
                Add a Property <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={next} className="inline-flex items-center justify-center gap-2 text-slate-500 text-sm px-6 py-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors">
                I'll do this later
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <User className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-xl font-light text-[#0D1B2A] mb-2">Complete Your Profile</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-8">
              Add your company details, bio, and contact information so our team can get in touch and feature your brand correctly.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/portal/profile" onClick={onDismiss}
                className="inline-flex items-center justify-center gap-2 bg-[#0D1B2A] text-white font-medium text-sm px-6 py-3 rounded-xl hover:bg-[#1a2e45] transition-colors">
                Go to Profile <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={next} className="inline-flex items-center justify-center gap-2 text-slate-500 text-sm px-6 py-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors">
                Skip for now
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="text-center">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <CreditCard className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-light text-[#0D1B2A] mb-2">Setting up payment</h2>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-sm text-slate-600 leading-relaxed max-w-sm mx-auto mb-6 text-left space-y-3">
              <p className="text-slate-700">Your dedicated 100 Collection contact will reach out within <strong>2 business days</strong> to set up your annual licensing payment.</p>
              <p className="text-slate-600">Your first property won't be billed until it's approved and listed.</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <button onClick={next} className="inline-flex items-center justify-center gap-2 text-slate-500 text-sm px-6 py-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors">
                Continue
              </button>
              <button
                onClick={() => setShowHelp(true)}
                className="text-xs text-[#C9A96E] hover:underline"
              >
                Need to reach us first? Contact us
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="text-center">
            <div className="w-16 h-16 bg-[#C9A96E]/15 rounded-full flex items-center justify-center mx-auto mb-5">
              <PartyPopper className="w-8 h-8 text-[#C9A96E]" />
            </div>
            <h2 className="text-2xl font-light text-[#0D1B2A] mb-2">You're all set!</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-sm mx-auto mb-8">
              Your partner account is ready. Explore your dashboard, manage properties, and track billing all in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              <button onClick={onDismiss} className="inline-flex items-center justify-center gap-2 bg-[#0D1B2A] text-white font-medium text-sm px-5 py-3 rounded-xl hover:bg-[#1a2e45] transition-colors">
                Go to Dashboard
              </button>
              <Link to="/portal/properties" onClick={onDismiss}
                className="inline-flex items-center justify-center gap-2 text-slate-600 text-sm px-5 py-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors">
                My Properties
              </Link>
              <Link to="/portal/billing" onClick={onDismiss}
                className="inline-flex items-center justify-center gap-2 text-slate-600 text-sm px-5 py-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors">
                Billing
              </Link>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 relative max-h-[90vh] overflow-y-auto">
          <button onClick={onDismiss} className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
          <StepIndicator current={step} />
          {stepContent()}
        </div>
      </div>
      {showHelp && <HelpContactModal onClose={() => setShowHelp(false)} partner={null} />}
    </>
  );
}