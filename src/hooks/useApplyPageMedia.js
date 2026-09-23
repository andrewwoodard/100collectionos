import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Admin-controlled media overrides for the public /apply pages.
// Singleton: at most one record ever exists. Read is public so the
// unauthenticated /apply pages can pull it; writes are admin-only (RLS).
export function useApplyPageMedia() {
  const { data } = useQuery({
    queryKey: ["apply-page-media"],
    queryFn: async () => {
      const records = await base44.entities.ApplyPageMedia.list();
      return records && records[0] ? records[0] : null;
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  return data || {};
}