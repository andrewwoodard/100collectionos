import React, { useState } from "react";

function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join("");
}

export default function CompanyLogo({ logoUrl, companyName = "", size = 48 }) {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(companyName);

  const style = {
    width: size,
    height: size,
    flexShrink: 0,
  };

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={companyName}
        onError={() => setImgError(true)}
        style={style}
        className="rounded-xl object-contain bg-white border border-[#E8DDD0] p-1"
      />
    );
  }

  // Initials fallback
  return (
    <div
      style={style}
      className="rounded-xl bg-[#0D1B2A] flex items-center justify-center flex-shrink-0 border border-[#1a2e45]"
    >
      <span
        className="text-[#C9A96E] font-semibold select-none"
        style={{ fontSize: Math.max(10, size * 0.33) }}
      >
        {initials || "?"}
      </span>
    </div>
  );
}