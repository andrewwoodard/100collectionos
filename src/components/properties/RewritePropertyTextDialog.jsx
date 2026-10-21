import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

export default function RewritePropertyTextDialog({
  open,
  onOpenChange,
  property,
  currentText,
  onReplace,
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");

  const generate = async ({ previousSuggestion } = {}) => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("rewritePropertyText", {
        property_id: property?.id || property?.supabase_property_id || undefined,
        current_text: currentText || "",
        previous_suggestion: previousSuggestion || undefined,
        context: {
          property_name: property?.property_name || property?.name,
          market: property?.market || property?.destination,
          destination: property?.destination || property?.market,
          address: property?.address,
          location_city: property?.location_city,
          location_state: property?.location_state,
          bedrooms: property?.bedrooms,
          bathrooms: property?.bathrooms,
          half_bathrooms: property?.half_bathrooms,
          sleeps: property?.sleeps || property?.occupancy,
          property_type: property?.property_type || property?.house_type,
          amenities: property?.amenities,
          unique_feature: property?.unique_feature,
          why_onehundred: property?.why_onehundred,
          excerpt: property?.excerpt,
          headline: property?.headline,
          text: currentText || property?.text,
          partner_name: property?.partner_name,
        },
      });
      const body = res?.data || res;
      if (body?.error) throw new Error(body.error);
      const text = String(body?.text || "").trim();
      if (!text) throw new Error("AI returned empty text");
      setDraft(text);
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || "Could not generate text";
      setError(message);
      toast({ variant: "destructive", title: "AI rewrite failed", description: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setDraft("");
    setError("");
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate once when opened
  }, [open]);

  const handleDiscard = () => {
    onOpenChange(false);
  };

  const handleRewrite = () => {
    generate({ previousSuggestion: draft });
  };

  const handleReplace = async () => {
    const next = draft.trim();
    if (!next) {
      toast({ variant: "destructive", title: "Nothing to replace", description: "Suggested text is empty." });
      return;
    }
    setReplacing(true);
    try {
      await onReplace(next);
      onOpenChange(false);
      toast({ title: "Text replaced", description: "Property text updated with the AI draft." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not replace text",
        description: err?.message || "Try again",
      });
    } finally {
      setReplacing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9A96E]" />
            Suggested property text
          </DialogTitle>
          <DialogDescription>
            Review or edit the draft, then rewrite, discard, or replace the current Text field.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-3">
          {loading && !draft ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Writing suggested text…
            </div>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className="min-h-[280px] text-sm resize-y"
              placeholder="Suggested text will appear here…"
              disabled={loading}
            />
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleRewrite}
            disabled={loading || replacing}
            className="border-[#0F172A] text-[#0F172A] hover:bg-[#0F172A]/5"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1.5" />
            )}
            Rewrite
          </Button>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="ghost" onClick={handleDiscard} disabled={replacing}>
              Discard
            </Button>
            <Button
              type="button"
              onClick={handleReplace}
              disabled={loading || replacing || !draft.trim()}
              className="bg-[#0D1B2A] hover:bg-[#1a2d42]"
            >
              {replacing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Replace current text
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
