import React from "react";

const LOGO =
  "https://media.base44.com/images/public/69aee092656fb9813439389b/b7c2bfa5c_100_Collex_Logo_Gold_Type.png";
const HERO =
  "https://media.base44.com/images/public/69aee092656fb9813439389b/db5556f1a_TKCA.jpg";
const MAIN_SITE = "https://www.theonehundredcollection.com";

export const AUTH_LABEL =
  "text-[11px] font-semibold text-[#8B7355] uppercase tracking-[0.16em] block mb-1.5";
export const AUTH_INPUT =
  "h-12 w-full rounded-lg border border-[#D9C8B4] bg-white pl-10 pr-3 text-[#0D1B2A] text-sm placeholder:text-[#B0A090] shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A96E]/20 focus-visible:border-[#C9A96E]";
export const AUTH_PRIMARY =
  "w-full h-12 rounded-sm bg-[#0D1B2A] border border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E] hover:text-[#0D1B2A] font-semibold uppercase tracking-[0.12em] text-sm shadow-none";
export const AUTH_OUTLINE =
  "w-full h-12 rounded-sm border border-[#D9C8B4] bg-white text-[#0D1B2A] hover:border-[#C9A96E] hover:bg-[#FAFAF8] font-medium shadow-none";
export const AUTH_LINK = "text-[#C9A96E] hover:text-[#b8935a] font-medium transition-colors";

export function AuthDivider({ label = "or" }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-[#E8DDD0]" />
      </div>
      <div className="relative flex justify-center text-[10px] uppercase tracking-[0.18em]">
        <span className="bg-white px-3 text-[#B0A090]">{label}</span>
      </div>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#FAFAF8] font-sans">
      <aside className="relative h-48 sm:h-56 lg:h-auto lg:w-[46%] lg:min-h-screen overflow-hidden bg-[#0D1B2A]">
        <img
          src={HERO}
          alt="A home in The 100 Collection"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D1B2A] via-[#0D1B2A]/55 to-[#0D1B2A]/25" />
        <div className="relative z-10 h-full flex flex-col justify-between p-6 lg:p-10">
          <a href={MAIN_SITE} className="inline-flex items-center">
            <img src={LOGO} alt="The 100 Collection" className="h-10 lg:h-12 w-auto drop-shadow-sm" />
          </a>
          <div className="hidden lg:block max-w-md pb-4">
            <div className="text-[11px] font-semibold text-[#C9A96E] uppercase tracking-[0.34em] mb-5">
              The 100 Collection
            </div>
            <h2 className="font-serif text-white text-4xl xl:text-5xl leading-[1.08] tracking-[-0.01em]">
              Only the best homes, curated for your journey.
            </h2>
            <p className="mt-5 text-[#FAFAF8]/80 text-base font-light leading-relaxed">
              A network of premier vacation rental brands and the distinctive homes they manage.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        <nav className="flex items-center justify-between px-6 lg:px-10 py-5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C9A96E]">
            Partner Portal
          </span>
          <a
            href={MAIN_SITE}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8B7355] hover:text-[#C9A96E] transition-colors"
          >
            Main site
          </a>
        </nav>

        <div className="flex-1 flex items-center justify-center px-6 py-8 lg:py-12">
            <div className="w-full max-w-[420px] min-w-0">
            <div className="mb-8">
              <h1 className="font-serif text-[2.15rem] sm:text-[2.45rem] text-[#0D1B2A] leading-tight tracking-[-0.01em]">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 text-[#8B7355] text-[15px] font-light leading-relaxed">{subtitle}</p>
              )}
            </div>
            <div className="bg-white border border-[#E8DDD0] rounded-2xl p-7 sm:p-8 shadow-sm">
              {children}
            </div>
            {footer && (
              <p className="text-center text-sm text-[#8B7355] mt-7">{footer}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
