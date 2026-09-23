import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { MapPin, Clock, ArrowRight, Briefcase } from "lucide-react";
import CompanyLogo from "@/components/shared/CompanyLogo";
import { usePageMeta } from "@/hooks/usePageMeta";

const JOB_TYPE_LABELS = {
  full_time: "Full Time", part_time: "Part Time",
  contract: "Contract", seasonal: "Seasonal", internship: "Internship",
};

const DEPT_LABELS = {
  operations: "Operations", guest_services: "Guest Services",
  housekeeping: "Housekeeping", maintenance: "Maintenance",
  marketing: "Marketing", management: "Management", other: "Other",
};

export default function PublicCareers() {
  usePageMeta("careers");
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["public-jobs"],
    queryFn: () => base44.entities.JobPosting.filter({ status: "active" }),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["partner-profiles-public"],
    queryFn: () => base44.entities.PartnerProfile.list(),
    enabled: jobs.length > 0,
  });

  // Build a map: partner_id → profile
  const profileByPartnerId = useMemo(() => {
    const map = {};
    profiles.forEach(p => {
      if (p.partner_id) map[p.partner_id] = p;
    });
    return map;
  }, [profiles]);

  const getProfile = (job) => profileByPartnerId[job.partner_id] || null;

  return (
    <div className="min-h-screen bg-[#FDFAF6]" style={{ fontFamily: "'Lato', system-ui, sans-serif" }}>

      {/* Nav */}
      <div className="bg-[#0D1B2A] px-6 py-4 flex items-center justify-between">
        <img
          src="https://media.base44.com/images/public/69aee092656fb9813439389b/b7c2bfa5c_100_Collex_Logo_Gold_Type.png"
          alt="The 100 Collection"
          className="h-9 w-auto"
        />
        <Link to="/apply" className="text-xs font-semibold text-[#C9A96E] hover:text-[#b8935a] transition-colors uppercase tracking-widest">
          Become a Partner
        </Link>
      </div>

      {/* Header */}
      <div className="bg-[#0D1B2A] pb-16 pt-10 px-6 text-center">
        <div className="inline-block text-[10px] font-semibold text-[#C9A96E] uppercase tracking-[0.2em] border border-[#C9A96E]/30 rounded-full px-4 py-1.5 mb-6">
          We're Hiring
        </div>
        <h1 className="text-4xl font-light text-white mb-3" style={{ fontFamily: 'Georgia, serif' }}>
          Careers at The 100 Collection
        </h1>
        <p className="text-[#9AAAB8] text-sm max-w-xl mx-auto leading-relaxed">
          Join one of our partner companies and help deliver exceptional experiences in the world's finest vacation destinations.
        </p>
      </div>

      {/* Gold divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#C9A96E] to-transparent" />

      {/* Jobs */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        {jobsLoading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-[#E8DDD0] rounded-2xl p-6 animate-pulse h-28" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-14 h-14 bg-[#F5EFE7] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-6 h-6 text-[#C9A96E]" />
            </div>
            <h2 className="text-lg font-light text-[#0D1B2A] mb-2" style={{ fontFamily: 'Georgia, serif' }}>
              No openings right now
            </h2>
            <p className="text-[#B0A090] text-sm">Check back soon — our partner network is always growing.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map(job => {
              const profile = getProfile(job);
              const logoUrl = profile?.company_logo_url || null;
              const companyName = job.partner_name || profile?.company_name || "";
              const applyHref = job.application_url || (job.application_email ? `mailto:${job.application_email}` : null);

              return (
                <div key={job.id} className="bg-white border border-[#E8DDD0] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow group">
                  <div className="flex items-start gap-4">
                    <CompanyLogo logoUrl={logoUrl} companyName={companyName} size={52} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <h2 className="font-semibold text-[#0D1B2A] text-base leading-tight">{job.title}</h2>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-sm text-[#8B7355]">{companyName}</span>
                            {job.location && (
                              <>
                                <span className="text-[#D9C8B4]">·</span>
                                <span className="flex items-center gap-1 text-xs text-[#B0A090]">
                                  <MapPin className="w-3 h-3" />{job.location}
                                </span>
                              </>
                            )}
                            {job.job_type && (
                              <>
                                <span className="text-[#D9C8B4]">·</span>
                                <span className="flex items-center gap-1 text-xs text-[#B0A090]">
                                  <Clock className="w-3 h-3" />{JOB_TYPE_LABELS[job.job_type]}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {applyHref && (
                          <a
                            href={applyHref}
                            target={job.application_url ? "_blank" : undefined}
                            rel="noreferrer"
                            className="flex-shrink-0 flex items-center gap-1.5 text-[#C9A96E] text-xs font-semibold hover:text-[#b8935a] transition-colors"
                          >
                            Apply <ArrowRight className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {job.department && (
                          <span className="text-[10px] font-medium bg-[#F5EFE7] text-[#8B7355] px-2.5 py-1 rounded-full uppercase tracking-wide">
                            {DEPT_LABELS[job.department]}
                          </span>
                        )}
                        {job.compensation && (
                          <span className="text-xs text-[#C9A96E] font-medium">{job.compensation}</span>
                        )}
                        {job.closes_at && (
                          <span className="text-xs text-[#B0A090]">
                            Closes {new Date(job.closes_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                      </div>

                      {job.description && (
                        <p className="text-xs text-[#B0A090] mt-3 leading-relaxed line-clamp-2">{job.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-[#0D1B2A] py-10 text-center">
        <img
          src="https://media.base44.com/images/public/69aee092656fb9813439389b/b7c2bfa5c_100_Collex_Logo_Gold_Type.png"
          alt="The 100 Collection"
          className="h-8 w-auto mx-auto mb-4 opacity-70"
        />
        <p className="text-[#6B7A8A] text-xs">
          Are you a property manager?{" "}
          <Link to="/apply" className="text-[#C9A96E] hover:underline">Apply to become a partner →</Link>
        </p>
      </div>
    </div>
  );
}