import { useImpersonation } from "@/lib/ImpersonationContext";
import { useToast } from "@/components/ui/use-toast";

/**
 * Returns helpers for gating mutations during impersonation.
 * - canWrite: boolean — false when impersonating
 * - gateMutation: wrap a mutation fn; if impersonating, shows toast and returns false instead of executing
 */
export function useCanWrite() {
  const { isImpersonating } = useImpersonation();
  const { toast } = useToast();

  const canWrite = !isImpersonating;

  const gateMutation = (fn, message) => {
    if (isImpersonating) {
      toast({
        title: message || "View-only mode — actions are disabled during impersonation.",
        variant: "destructive",
      });
      return Promise.resolve(false);
    }
    return fn();
  };

  return { canWrite, isImpersonating, gateMutation };
}