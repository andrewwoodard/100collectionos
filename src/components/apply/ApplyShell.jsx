import React from "react";
import { Link, useLocation } from "react-router-dom";

const LOGO = "https://media.base44.com/images/public/69aee092656fb9813439389b/b7c2bfa5c_100_Collex_Logo_Gold_Type.png";

export function ApplyBreadcrumb({ items }) {
  return (
    <div className="bg-[#FAFAF8] border-b border-[#E8DDD0]">
      <div className="max-w-5xl mx-auto px-6 py-3 text-xs text-[#B0A090]">
        {items.map((it, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-2 text-[#D9C8B4]">/</span>}
            {it.to ? (
              <Link to={it.to} className="hover:text-[#C9A96E] transition-colors">{it.label}</Link>
            ) : (
              <span className="text-[#8B7355]">{it.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ApplyShell({ children, breadcrumb }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col">
      <header className="bg-[#0D1B2A] px-6 py-4 flex items-center justify-center">
        <Link to="/apply">
          <img src={LOGO} alt="The 100 Collection" className="h-10 w-auto" />
        </Link>
      </header>
      {breadcrumb}
      <div id="apply-root" key={location.pathname} className="apply-fade-in flex-1">
        {children}
      </div>
      <footer className="bg-[#0D1B2A] pt-10 pb-14 text-center">
        <img src={LOGO} alt="The 100 Collection" className="h-8 w-auto mx-auto mb-4 opacity-80" />
        <p className="text-[#6B7A8A] text-xs">
          Questions?{" "}
          <a href="mailto:partners@theonehundredcollection.com" className="text-[#C9A96E] hover:underline">
            partners@theonehundredcollection.com
          </a>
        </p>
      </footer>

      {/* Subtle sticky support bar, present on every /apply page */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-[#FAFAF8]/90 backdrop-blur border-t border-[#E8DDD0] py-2 text-center">
        <p className="text-xs text-[#B0A090]">
          Questions? Reply to any email from us, or reach{" "}
          <a href="mailto:hello@theonehundredcollection.com" className="text-[#C9A96E] hover:underline">
            hello@theonehundredcollection.com
          </a>
        </p>
      </div>
    </div>
  );
}