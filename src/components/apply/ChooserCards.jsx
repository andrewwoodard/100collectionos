import React from "react";
import ApplyImage from "./ApplyImage";

function Badge({ children }) {
  return (
    <span className="text-[10px] text-[#8B7355] bg-[#FBF6EF] border border-[#E8DDD0] rounded-full px-2.5 py-1 whitespace-nowrap">
      {children}
    </span>
  );
}

function ChooserCard({ href, image, alt, caption, headline, sub, badges, cta, outline, onChoose }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChoose(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoose(href);
        }
      }}
      className="group cursor-pointer text-left bg-white border border-[#E8DDD0] rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ease-out flex flex-col min-h-[480px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A96E]"
    >
      <div className="w-full aspect-[4/3] flex-shrink-0 overflow-hidden">
        <ApplyImage
          src={image}
          alt={alt || "The 100 Collection"}
          aspect="4/3"
          widths={[400, 600, 900]}
          quality={70}
          className="w-full h-full"
          imgClassName="group-hover:scale-105 transition-transform duration-700"
        />
      </div>
      <div className="flex-1 p-6 flex flex-col">
        <div className="text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] mb-2.5">
          {caption}
        </div>
        <div className="font-serif text-[22px] leading-snug text-[#0D1B2A] mb-2">{headline}</div>
        <p className="text-sm text-[#8B7355] leading-relaxed mb-4">{sub}</p>
        <div className="flex flex-wrap gap-1.5 mb-5 mt-auto">
          {badges.map((b) => (
            <Badge key={b}>{b}</Badge>
          ))}
        </div>
        <span
          className={
            outline
              ? "inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-[#0D1B2A] text-[#0D1B2A] text-sm font-semibold transition-colors group-hover:bg-[#0D1B2A] group-hover:text-[#C9A96E]"
              : "inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#0D1B2A] text-[#C9A96E] text-sm font-semibold transition-colors group-hover:bg-[#162535]"
          }
        >
          {cta}
        </span>
      </div>
    </div>
  );
}

export default function ChooserCards({
  managerCard,
  managerAlt,
  homeownerCard,
  homeownerAlt,
  partnerCard,
  partnerAlt,
  managerHref,
  homeownerHref,
  partnerHref,
  onChoose,
}) {
  return (
    <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ChooserCard
          href={managerHref}
          image={managerCard}
          alt={managerAlt}
          caption="Professional Partners"
          headline="For managers building something distinctive"
          sub="Curated portfolios of 5+ premium properties across leading destinations"
          badges={["5+ properties", "Editorial features", "Direct booking network"]}
          cta="Apply as manager"
          outline={false}
          onChoose={onChoose}
        />
        <ChooserCard
          href={homeownerHref}
          image={homeownerCard}
          alt={homeownerAlt}
          caption="Private Homes"
          headline="For homeowners who love their home"
          sub="Individual owners with 1 to 15 professionally-cared-for homes"
          badges={["1 to 15 homes", "Concierge-supported", "Guest-curated"]}
          cta="Apply as homeowner"
          outline={false}
          onChoose={onChoose}
        />
        <ChooserCard
          href={partnerHref}
          image={partnerCard}
          alt={partnerAlt}
          caption="Portal Access"
          headline="Already part of the Collection?"
          sub="Sign in to your Partner Portal or request access for your team"
          badges={["Instant access", "Team invitations", "Portfolio management"]}
          cta="Access the portal"
          outline
          onChoose={onChoose}
        />
      </div>
    </div>
  );
}