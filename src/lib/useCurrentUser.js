import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useImpersonation } from "@/lib/ImpersonationContext";

/**
 * Returns the "current user" for portal rendering.
 * If an admin is impersonating, fetches and returns the impersonated User record.
 * Otherwise returns the real authenticated user.
 *
 * Guardrail: impersonation is ONLY honored when the real user's role === "admin".
 */
export function useCurrentUser() {
  const { user: realUser, isLoadingAuth } = useAuth();
  const { impersonatedUserId, isImpersonating } = useImpersonation();

  const shouldFetchImpersonated = isImpersonating && impersonatedUserId && realUser?.role === "admin";

  const { data: impersonatedUser, isLoading: isLoadingImpersonated } = useQuery({
    queryKey: ["impersonated-user", impersonatedUserId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getUserById', { userId: impersonatedUserId });
      return res?.data?.user || null;
    },
    enabled: shouldFetchImpersonated,
    staleTime: 30 * 1000,
  });

  if (isLoadingAuth) return { user: null, isLoading: true };
  if (shouldFetchImpersonated) {
    return { user: impersonatedUser, isLoading: isLoadingImpersonated };
  }
  return { user: realUser, isLoading: false };
}