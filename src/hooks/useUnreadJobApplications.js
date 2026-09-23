import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/supabase";

/**
 * Returns the number of unread job applications for a partner.
 * "Unread" = created after the partner's job_apps_last_viewed_at timestamp
 * (or all applications if they've never viewed the tab).
 */
export function useUnreadJobApplications(partnerName, lastViewedAt) {
  return useQuery({
    queryKey: ["unread-job-applications", partnerName, lastViewedAt],
    queryFn: async () => {
      if (!partnerName) return 0;
      const res = await sb.list("job_applications");
      const items = res.items || [];
      const partnerApps = items.filter(
        (a) => (a.partner_name || "").toLowerCase().trim() === partnerName.toLowerCase().trim()
      );
      if (!lastViewedAt) return partnerApps.length;
      const cutoff = new Date(lastViewedAt).getTime();
      return partnerApps.filter((a) => {
        const created = new Date(a.created_at || a.created_date).getTime();
        return created > cutoff;
      }).length;
    },
    enabled: !!partnerName,
    refetchInterval: 60000,
  });
}