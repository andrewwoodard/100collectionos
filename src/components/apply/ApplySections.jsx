import React from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { FEATURED_PARTNERS } from "./ApplyShared";

export function ValueProps({ items, cols = 3 }) {
  const gridCls = cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">
      <div className={`grid grid-cols-1 ${gridCls} gap-6`}>
        {items.map((c) => (
          <div key={c.title} className="bg-white border border-[#E8DDD0] rounded-2xl p-7 shadow-sm">
            <div className="w-10 h-10 bg-[#FBF6EF] rounded-xl flex items-center justify-center mb-5">
              <c.icon className="w-5 h-5 text-[#C9A96E]" />
            </div>
            <div className="text-base font-semibold text-[#0D1B2A] mb-1.5">{c.title}</div>
            {c.subtitle && (
              <div className="text-[13px] text-[#C9A96E] leading-snug mb-3">{c.subtitle}</div>
            )}
            <div className="text-sm text-[#8B7355] leading-relaxed">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhatToExpect({ callout, linkLabel, linkHref, onLinkClick }) {
  return (
    <div className="max-w-3xl mx-auto px-6 pb-8">
      <div className="bg-[#FBF6EF] border border-[#C9A96E]/30 rounded-2xl p-6 text-center">
        <p className="text-sm text-[#8B7355] leading-relaxed mb-2">{callout}</p>
        {linkLabel && (onLinkClick ? (
          <button onClick={onLinkClick} className="text-sm font-semibold text-[#C9A96E] hover:underline">
            {linkLabel}
          </button>
        ) : linkHref ? (
          <a href={linkHref} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#C9A96E] hover:underline">
            {linkLabel}
          </a>
        ) : null)}
      </div>
    </div>
  );
}

export function SocialProof({ heading = "Partners include" }) {
  return (
    <div className="bg-[#0D1B2A] py-16">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-8">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em]">{heading}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {FEATURED_PARTNERS.map((card) => (
            <a key={card.destination} href={card.url} target="_blank" rel="noreferrer" className="group relative rounded-xl overflow-hidden aspect-[3/4] block">
              <img src={card.img} alt={card.destination} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <div className="text-[9px] font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">{card.destination}</div>
                <div className="text-white text-sm font-medium leading-tight">{card.partner}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Testimonial({ quote, author, role }) {
  return (
    <div className="bg-[#0D1B2A] py-16">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-6">From our homeowners</div>
        <p className="text-white text-xl font-medium leading-relaxed mb-6 font-serif">“{quote}”</p>
        <p className="text-[#9AAAB8] text-sm">{author}{role ? `, ${role}` : ""}</p>
      </div>
    </div>
  );
}

export function ApplyFormCard({ onSubmit, loading, submitLabel, children, title = "Start Your Application", intro, formRef }) {
  return (
    <div id="apply-form" className="bg-[#FAFAF8] py-20">
      <div className="max-w-2xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-3">Apply Now</div>
          <h2 className="text-3xl font-medium text-[#0D1B2A] mb-2 font-serif">{title}</h2>
          {intro && <p className="text-[#B0A090] text-sm">{intro}</p>}
        </div>
        <div className="bg-white border border-[#E8DDD0] rounded-2xl p-8 shadow-sm">
          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            {children}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#0D1B2A] text-white font-semibold text-sm py-4 rounded-full hover:bg-[#1a2f42] disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-4 shadow-md"
            >
              {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>) : (<>{submitLabel}<ArrowRight className="w-4 h-4" /></>)}
            </button>
            <p className="text-[11px] text-[#C0B0A0] text-center leading-relaxed pt-1">
              By submitting, you agree to be contacted by The 100 Collection regarding your application.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}