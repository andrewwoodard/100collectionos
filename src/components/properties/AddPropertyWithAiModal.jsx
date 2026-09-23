import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Wand2, ImageOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Property types accepted by the propertiesbase44 house_type column
const VALID_TYPES = new Set(["villa", "apartment", "house", "condo", "estate", "cabin", "other"]);

export default function AddPropertyWithAiModal({ open, onOpenChange, partners = [], onCreated, presetPartnerId }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [partnerId, setPartnerId] = useState(presetPartnerId || "");
  const [scraping, setScraping] = useState(false);
  const [scraped, setScraped] = useState(null);
  const [scrapeError, setScrapeError] = useState("");
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setUrl("");
    setPartnerId(presetPartnerId || "");
    setScraped(null);
    setScrapeError("");
    setScraping(false);
    setCreating(false);
  };

  const close = () => { reset(); onOpenChange(false); };

  const handleScrape = async () => {
    if (!url) return;
    setScraping(true);
    setScrapeError("");
    setScraped(null);
    try {
      const res = await base44.functions.invoke("scrapePropertyUrl", { url, partner_id: partnerId || undefined });
      const data = res?.data?.data;
      if (!data) {
        setScrapeError(res?.data?.error || "Could not extract property data from this URL.");
      } else {
        setScraped(data);
      }
    } catch (e) {
      setScrapeError(e.message || "Scraping failed.");
    } finally {
      setScraping(false);
    }
  };

  const handleCreate = async () => {
    if (!scraped) return;
    setCreating(true);
    try {
      const selectedPartner = partners.find(p => p.id === partnerId);
      const payload = {
        property_name: scraped.property_name || "Untitled Property",
        market: selectedPartner?.market || scraped.location_city || scraped.location_state || undefined,
        address: scraped.location_full || undefined,
        listing_url: url,
        vrm_url: url,
        bedrooms: scraped.bedrooms,
        bathrooms: scraped.bathrooms,
        sleeps: scraped.sleeps,
        property_type: VALID_TYPES.has(scraped.property_type) ? scraped.property_type : undefined,
        partner_id: partnerId || undefined,
        partner_name: selectedPartner?.partner_name || undefined,
        status: "draft",
        images: scraped.photo_urls || [],
        excerpt: scraped.short_summary || undefined,
        unique_feature: scraped.unique_features || undefined,
        why_onehundred: scraped.why_100_collection || undefined,
        text: scraped.description || undefined,
      };
      const res = await base44.functions.invoke("supabaseProperties", { action: "create", data: payload });
      if (res?.data?.error) throw new Error(res.data.error);
      toast({ title: "Property created", description: scraped.property_name || "Added via AI scrape" });
      onCreated?.();
      close();
    } catch (e) {
      toast({ title: "Create failed", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(true); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9A96E]" /> Add Property with AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Listing URL *</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="https://vrbo.com/12345"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={scraping}
              />
              <Button
                onClick={handleScrape}
                disabled={!url || scraping}
                className="bg-[#0F172A] hover:bg-[#1E293B] text-white whitespace-nowrap"
              >
                {scraping ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
                {scraping ? "Scraping..." : "Scrape"}
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Paste any Airbnb, VRBO, or direct booking URL. AI extracts photos, stats, and description.
            </p>
          </div>

          {!presetPartnerId && (
            <div>
              <Label className="text-xs">Partner (optional)</Label>
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Assign to a partner" /></SelectTrigger>
                <SelectContent>
                  {[...partners].sort((a, b) => (a.partner_name || "").localeCompare(b.partner_name || "")).map(p => <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {scrapeError && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-700">
              {scrapeError}
            </div>
          )}

          {scraped && (
            <div className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
              <div className="text-xs font-semibold uppercase tracking-wide text-[#C9A96E]">Extracted Preview</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-gray-400">Name</span>
                  <p className="font-medium text-gray-900">{scraped.property_name || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Location</span>
                  <p className="font-medium text-gray-900">{scraped.location_full || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Type</span>
                  <p className="font-medium text-gray-900 capitalize">{scraped.property_type || "—"}</p>
                </div>
                <div className="flex gap-3">
                  <span><span className="text-xs text-gray-400">BD</span> {scraped.bedrooms || "—"}</span>
                  <span><span className="text-xs text-gray-400">BA</span> {scraped.bathrooms || "—"}</span>
                  <span><span className="text-xs text-gray-400">Sleeps</span> {scraped.sleeps || "—"}</span>
                </div>
              </div>
              {scraped.short_summary && (
                <p className="text-sm text-gray-600 italic line-clamp-2">{scraped.short_summary}</p>
              )}
              <div>
                <span className="text-xs text-gray-400">{(scraped.photo_urls || []).length} photos extracted</span>
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                  {(scraped.photo_urls || []).slice(0, 8).map((u, i) => (
                    <img key={i} src={u} alt="" className="w-16 h-16 object-cover rounded-md border border-gray-200 flex-shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  ))}
                  {(scraped.photo_urls || []).length === 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <ImageOff className="w-4 h-4" /> No photos found
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!scraped || creating} className="bg-[#0F172A] hover:bg-[#1E293B] text-white">
            {creating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            {creating ? "Creating..." : "Create Property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}