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
const MAX_PHOTOS = 40;
const MAX_TEXT = 6000;
function isHeavyScrapeHost(listingUrl) {
  try {
    const host = new URL(listingUrl).hostname.replace(/^www\./, "").toLowerCase();
    // Coastal Carolina (OBX + Carolina Beach), Streamline VRS, LMPM hub links
    if (host.includes("coastalcarolina")) return true;
    if (host.includes("streamlinevrs")) return true;
    if (/[?&]hub_property_id=/.test(listingUrl)) return true;
    return false;
  } catch {
    return false;
  }
}

function hostHintFromUrl(listingUrl) {
  try {
    return new URL(listingUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Property";
  }
}

function nameFromUrlSlug(listingUrl) {
  try {
    const slug = new URL(listingUrl).pathname.split("/").filter(Boolean).pop() || "";
    if (!slug || slug.length < 3) return hostHintFromUrl(listingUrl);
    return slug
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b([a-z]?[a-z]{0,3})(\d+)\b/gi, (_, letters, digits) => `${letters.toUpperCase()}${digits}`)
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .trim();
  } catch {
    return hostHintFromUrl(listingUrl);
  }
}

function isBadScrapedName(name) {
  const n = String(name || "").trim().toLowerCase();
  return !n || n === "403 forbidden" || n === "404 not found" || n.startsWith("403 ") || n.includes("access denied");
}

function truncate(value, max) {
  const s = String(value || "");
  if (s.length <= max) return s || undefined;
  return s.slice(0, max);
}

function friendlyNetError(err, fallback) {
  const msg = err?.message || err?.toString?.() || fallback;
  if (msg === "Network Error" || /timeout|timed out|ETIMEDOUT|ECONNABORTED/i.test(msg)) {
    return "The request timed out (common with large photo sets). Try again — the property may still create with a lighter photo scan.";
  }
  return msg;
}

function normalizePhotos(list) {
  return (Array.isArray(list) ? list : [])
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .slice(0, MAX_PHOTOS);
}

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

  // Local Vercel HTML scrape — no Base44 LLM / fingerprint (those time out).
  const scrapeViaLight = async () => {
    const res = await base44.functions.invoke("scrapePropertyLight", { url });
    // SDK returns response.data already — so shape is { success, data } (not axios-wrapped).
    const body =
      res && (res.success !== undefined || res.error !== undefined)
        ? res
        : res?.data && (res.data.success !== undefined || res.data.error !== undefined)
          ? res.data
          : res?.data || res;
    const data = body?.data;
    if (!body?.success || !data) {
      throw new Error(body?.error || "Light scrape found no listing data.");
    }
    const photo_urls = normalizePhotos(data.photo_urls);
    const property_name = isBadScrapedName(data.property_name)
      ? nameFromUrlSlug(url)
      : data.property_name;
    // Treat WAF block pages (title "403 Forbidden", zero photos) as failure.
    if (isBadScrapedName(data.property_name) && photo_urls.length === 0) {
      throw new Error(body?.error || "Listing site blocked the scrape.");
    }
    return {
      ...data,
      property_name,
      photo_urls,
      _discoverFallback: true,
    };
  };

  const scrapeViaDiscover = async () => {
    const discoverRes = await base44.functions.invoke("scrapePropertyUrl", {
      url,
      mode: "discover",
      partner_id: partnerId || undefined,
    });
    const payload = discoverRes?.data || discoverRes;
    const candidates = payload?.data?.candidates || payload?.candidates || [];
    if (!candidates.length) {
      throw new Error(payload?.error || "No listing photos found for this URL.");
    }
    const photo_urls = normalizePhotos(candidates.map((c) => c.url || c).filter(Boolean));
    return {
      property_name: nameFromUrlSlug(url),
      photo_urls,
      _discoverFallback: true,
    };
  };

  const minimalFromUrl = () => ({
    property_name: nameFromUrlSlug(url),
    photo_urls: [],
    _discoverFallback: true,
    _urlOnly: true,
  });

  const handleScrape = async () => {
    if (!url) return;
    setScraping(true);
    setScrapeError("");
    setScraped(null);
    try {
      // Heavy / large-gallery hosts: never call full Base44 AI scrape (timeouts).
      if (isHeavyScrapeHost(url)) {
        try {
          const light = await scrapeViaLight();
          setScraped(light);
          toast({
            title: "Scrape complete",
            description: `${(light.photo_urls || []).length} photos ready${light.property_name ? ` · ${light.property_name}` : ""}. Review the preview, then create.`,
          });
        } catch (lightErr) {
          try {
            const discovered = await scrapeViaDiscover();
            setScraped(discovered);
            toast({
              title: "Scrape complete",
              description: `${(discovered.photo_urls || []).length} photos ready · ${discovered.property_name}. Review the preview, then create.`,
            });
          } catch {
            setScraped(minimalFromUrl());
            toast({
              title: "URL saved — listing site blocked the scrape",
              description: friendlyNetError(lightErr, "Create the draft from this URL, then add photos/details manually."),
            });
          }
        }
        return;
      }

      try {
        const res = await base44.functions.invoke("scrapePropertyUrl", {
          url,
          partner_id: partnerId || undefined,
        });
        const data = res?.data?.data;
        if (data) {
          setScraped({
            ...data,
            photo_urls: normalizePhotos(data.photo_urls),
          });
          return;
        }
      } catch {
        // Fall through to light scrape.
      }

      try {
        const light = await scrapeViaLight();
        setScraped(light);
        toast({
          title: "Scrape complete",
          description: `${(light.photo_urls || []).length} photos ready from a page scan. Review the preview, then create.`,
        });
      } catch (lightErr) {
        setScraped(minimalFromUrl());
        toast({
          title: "URL saved — scrape timed out",
          description: friendlyNetError(lightErr, "Create the draft now, then add photos/details manually."),
        });
      }
    } finally {
      setScraping(false);
    }
  };

  const handleCreate = async () => {
    if (!scraped) return;
    setCreating(true);
    try {
      const selectedPartner = partners.find((p) => p.id === partnerId);
      const photos = normalizePhotos(scraped.photo_urls);

      // Slim create first — large photo_urls + long AI text in one request
      // was timing out for Coastal Carolina Vacations listings.
      const slimPayload = {
        property_name: scraped.property_name || "Untitled Property",
        market: selectedPartner?.market || scraped.location_city || scraped.location_state || undefined,
        address: truncate(scraped.location_full, 500),
        listing_url: url,
        vrm_url: url,
        bedrooms: scraped.bedrooms,
        bathrooms: scraped.bathrooms,
        sleeps: scraped.sleeps,
        property_type: VALID_TYPES.has(scraped.property_type) ? scraped.property_type : undefined,
        partner_id: partnerId || undefined,
        partner_name: selectedPartner?.partner_name || undefined,
        status: "draft",
        short_summary: truncate(scraped.short_summary, 800),
        excerpt: truncate(scraped.short_summary, 800),
      };

      const created = await base44.entities.Property.create(slimPayload);

      // Attach photos + long copy in the background — awaiting this was still
      // hitting gateway timeouts on 40+ photo Coastal Carolina listings.
      void base44.entities.Property.update(created.id, {
        photo_urls: photos,
        unique_feature: truncate(scraped.unique_features, 2000),
        why_onehundred: truncate(scraped.why_100_collection, 2000),
        text: truncate(scraped.description, MAX_TEXT),
        description: truncate(scraped.description, MAX_TEXT),
      }).catch((err) => {
        console.warn("[AddPropertyWithAi] detail update failed", err);
      });

      // Mirror to admin Properties table in the background — do not block success.
      const sbImages = photos.slice(0, 24);
      void base44.functions
        .invoke("supabaseProperties", {
          action: "create",
          skip_image_ingest: true,
          data: {
            property_name: slimPayload.property_name,
            market: slimPayload.market,
            address: slimPayload.address,
            listing_url: url,
            vrm_url: url,
            bedrooms: slimPayload.bedrooms,
            bathrooms: slimPayload.bathrooms,
            sleeps: slimPayload.sleeps,
            property_type: slimPayload.property_type,
            partner_id: partnerId || undefined,
            partner_name: slimPayload.partner_name,
            status: "draft",
            active: false,
            images: sbImages,
            excerpt: slimPayload.excerpt,
            text: truncate(scraped.description, 2000),
          },
        })
        .then(async (sbRes) => {
          const sbBody = sbRes?.data || sbRes;
          const sbId = sbBody?.property?.id ?? sbBody?.property?.row_id;
          if (sbId) {
            await base44.entities.Property.update(created.id, {
              supabase_property_id: String(sbId),
            }).catch(() => {});
          }
        })
        .catch((err) => console.warn("[AddPropertyWithAi] supabase mirror failed", err));

      toast({
        title: "Property created",
        description: scraped.property_name || "Added via AI scrape",
      });
      onCreated?.(created);
      close();
    } catch (e) {
      toast({
        title: "Create failed",
        description: friendlyNetError(e, "Could not create property"),
        variant: "destructive",
      });
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
                onChange={(e) => setUrl(e.target.value)}
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
                  {[...partners].sort((a, b) => (a.partner_name || "").localeCompare(b.partner_name || "")).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.partner_name}</SelectItem>
                  ))}
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
              {scraped._urlOnly && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                  Scrape timed out — you can still create a draft from this URL, then add photos and details manually.
                </p>
              )}
              {scraped._discoverFallback && !scraped._urlOnly && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                  Ready — {(scraped.photo_urls || []).length} photos pulled from the listing page. Review details below, then create.
                </p>
              )}
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
                <span className="text-xs text-gray-400">
                  {(scraped.photo_urls || []).length} photos ready
                </span>
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
