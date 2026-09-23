import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye } from "lucide-react";
import MediaSlotRow from "@/components/admin/apply-media/MediaSlotRow";
import FeaturedPropertySlotRow from "@/components/admin/apply-media/FeaturedPropertySlotRow";

const HERO_SLOT_COUNT = 5;
const DEFAULT_QUOTE = "Every home is a story worth telling.";
const emptySlot = () => ({ url: "", alt: "" });
const emptyFeaturedSlot = () => ({
  url: "",
  name: "",
  partner_name: "",
  market: "",
  photo_url: "",
  photo_alt: "",
});

// Flatten the 3 curator-pick slot objects into the featured_property_N_*
// fields on the singleton. Empty slots write empty strings so removals persist.
function buildFeaturedPayload(slots) {
  const payload = {};
  slots.forEach((s, i) => {
    const n = i + 1;
    payload[`featured_property_${n}_url`] = (s.url || "").trim();
    payload[`featured_property_${n}_name`] = (s.name || "").trim();
    payload[`featured_property_${n}_partner_name`] = (s.partner_name || "").trim();
    payload[`featured_property_${n}_market`] = (s.market || "").trim();
    payload[`featured_property_${n}_photo_url`] = (s.photo_url || "").trim();
    payload[`featured_property_${n}_photo_alt`] = (s.photo_alt || "").trim();
  });
  return payload;
}

function SectionHeader({ title, sub, children }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-medium text-[#0D1B2A] mb-1">{title}</h3>
      {sub && <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">{sub}</p>}
      {children}
    </div>
  );
}

export default function AdminApplyMedia({ embedded }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: records, isLoading } = useQuery({
    queryKey: ["apply-page-media"],
    queryFn: () => base44.entities.ApplyPageMedia.list(),
  });
  const record = records && records[0] ? records[0] : null;

  const [initialized, setInitialized] = useState(false);
  const [heroSlots, setHeroSlots] = useState(Array.from({ length: HERO_SLOT_COUNT }, emptySlot));
  const [managerCard, setManagerCard] = useState(emptySlot());
  const [homeownerCard, setHomeownerCard] = useState(emptySlot());
  const [partnerCard, setPartnerCard] = useState(emptySlot());
  const [closing, setClosing] = useState(emptySlot());
  const [managerFormHero, setManagerFormHero] = useState("");
  const [homeownerFormHero, setHomeownerFormHero] = useState("");
  const [quote, setQuote] = useState(DEFAULT_QUOTE);
  const [featuredSlots, setFeaturedSlots] = useState(Array.from({ length: 3 }, emptyFeaturedSlot));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!record || initialized) return;
    setHeroSlots(
      Array.from({ length: HERO_SLOT_COUNT }, (_, i) => ({
        url: (record.hero_rotation_urls || [])[i] || "",
        alt: (record.hero_rotation_alt_texts || [])[i] || "",
      }))
    );
    setManagerCard({ url: record.manager_card_hero_url || "", alt: record.manager_card_hero_alt || "" });
    setHomeownerCard({ url: record.homeowner_card_hero_url || "", alt: record.homeowner_card_hero_alt || "" });
    setPartnerCard({ url: record.existing_partner_card_hero_url || "", alt: record.existing_partner_card_hero_alt || "" });
    setClosing({ url: record.closing_editorial_url || "", alt: record.closing_editorial_alt || "" });
    setManagerFormHero(record.manager_form_hero_url || "");
    setHomeownerFormHero(record.homeowner_form_hero_url || "");
    setQuote(record.closing_editorial_quote || DEFAULT_QUOTE);
    setFeaturedSlots(
      Array.from({ length: 3 }, (_, i) => ({
        url: record[`featured_property_${i + 1}_url`] || "",
        name: record[`featured_property_${i + 1}_name`] || "",
        partner_name: record[`featured_property_${i + 1}_partner_name`] || "",
        market: record[`featured_property_${i + 1}_market`] || "",
        photo_url: record[`featured_property_${i + 1}_photo_url`] || "",
        photo_alt: record[`featured_property_${i + 1}_photo_alt`] || "",
      }))
    );
    setInitialized(true);
  }, [record, initialized]);

  const setHeroSlot = (i, field) => (value) =>
    setHeroSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  const setSlotField = (setter, field) => (value) => setter((s) => ({ ...s, [field]: value }));

  const hasAnyPhoto = [heroSlots, managerCard, homeownerCard, partnerCard, closing]
    .flat()
    .some((s) => s.url && s.url.trim());

  const handleSave = async () => {
    setSaving(true);
    try {
      const filledHeroes = heroSlots.filter((s) => s.url && s.url.trim());
      const payload = {
        hero_rotation_urls: filledHeroes.map((s) => s.url.trim()),
        hero_rotation_alt_texts: filledHeroes.map((s) => (s.alt || "").trim()),
        manager_card_hero_url: managerCard.url.trim(),
        manager_card_hero_alt: managerCard.alt.trim(),
        homeowner_card_hero_url: homeownerCard.url.trim(),
        homeowner_card_hero_alt: homeownerCard.alt.trim(),
        existing_partner_card_hero_url: partnerCard.url.trim(),
        existing_partner_card_hero_alt: partnerCard.alt.trim(),
        closing_editorial_url: closing.url.trim(),
        closing_editorial_alt: closing.alt.trim(),
        closing_editorial_quote: quote.trim(),
        manager_form_hero_url: managerFormHero.trim(),
        homeowner_form_hero_url: homeownerFormHero.trim(),
        ...buildFeaturedPayload(featuredSlots),
        updated_by: (user && user.id) || "",
        updated_at: new Date().toISOString(),
      };
      if (record) {
        await base44.entities.ApplyPageMedia.update(record.id, payload);
      } else {
        await base44.entities.ApplyPageMedia.create(payload);
      }
      await base44.entities.AuditEntry.create({
        actor_email: (user && user.email) || "",
        actor_role: "admin",
        action: "apply_media_updated",
        entity_type: "ApplyPageMedia",
        entity_id: record ? record.id : null,
        details: "Updated /apply landing page media",
      });
      qc.invalidateQueries({ queryKey: ["apply-page-media"] });
      toast({
        title: "Media updated.",
        description: "Landing page refreshes in ~1 minute for public visitors.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: (err && (err.message || err.error)) || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="pb-28">
      {!embedded && (
        <div className="mb-6">
          <div className="text-xs font-semibold text-[#C9A96E] uppercase tracking-widest mb-1">Content</div>
          <h1 className="text-2xl font-light text-[#0D1B2A]">Apply Page Media</h1>
        </div>
      )}

      {!hasAnyPhoto && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm mb-6">
          The landing page is using auto-selected photos from your Property catalog. Upload custom photos here for a stronger first impression.
        </div>
      )}

      <div className="max-w-3xl space-y-10">
        {/* Section 1 — Hero rotation */}
        <section>
          <SectionHeader
            title="Hero rotation — landing page top"
            sub="These photos rotate every 6 seconds behind the landing page headline. Aim for cinematic, editorial framing. Landscape orientation, minimum 1920x1080."
          >
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-3 py-2 mt-3 max-w-2xl leading-relaxed">
              Tip: If your photos are in Google Drive, download the ones you want, then use the Upload button above. Direct Google Drive URLs won't render; the files need to be hosted somewhere public.
            </p>
          </SectionHeader>
          <div className="space-y-3">
            {heroSlots.map((slot, i) => (
              <MediaSlotRow
                key={i}
                label={`Hero photo ${i + 1}`}
                url={slot.url}
                alt={slot.alt}
                onUrlChange={setHeroSlot(i, "url")}
                onAltChange={setHeroSlot(i, "alt")}
                onRemove={() => setHeroSlots((prev) => prev.map((s, idx) => (idx === i ? emptySlot() : s)))}
              />
            ))}
          </div>
        </section>

        {/* Section 2 — Chooser cards */}
        <section>
          <SectionHeader
            title="Chooser card photos"
            sub="One photo per card on the landing page. Portrait or landscape both work, but avoid busy compositions. These are the first three photos every visitor sees under the fold."
          />
          <div className="space-y-3">
            <MediaSlotRow
              label="Manager card"
              url={managerCard.url}
              alt={managerCard.alt}
              onUrlChange={setSlotField(setManagerCard, "url")}
              onAltChange={setSlotField(setManagerCard, "alt")}
              onRemove={() => setManagerCard(emptySlot())}
            />
            <MediaSlotRow
              label="Homeowner card"
              url={homeownerCard.url}
              alt={homeownerCard.alt}
              onUrlChange={setSlotField(setHomeownerCard, "url")}
              onAltChange={setSlotField(setHomeownerCard, "alt")}
              onRemove={() => setHomeownerCard(emptySlot())}
            />
            <MediaSlotRow
              label="Existing partner card"
              url={partnerCard.url}
              alt={partnerCard.alt}
              onUrlChange={setSlotField(setPartnerCard, "url")}
              onAltChange={setSlotField(setPartnerCard, "alt")}
              onRemove={() => setPartnerCard(emptySlot())}
            />
          </div>
        </section>

        {/* Section 3 — Form heroes */}
        <section>
          <SectionHeader
            title="Form page heroes — optional"
            sub="Show a large photo above the application form itself. Leave blank to use no hero image on the form pages."
          />
          <div className="space-y-3">
            <MediaSlotRow
              label="Manager form hero"
              url={managerFormHero}
              showAlt={false}
              onUrlChange={setManagerFormHero}
              onRemove={() => setManagerFormHero("")}
            />
            <MediaSlotRow
              label="Homeowner form hero"
              url={homeownerFormHero}
              showAlt={false}
              onUrlChange={setHomeownerFormHero}
              onRemove={() => setHomeownerFormHero("")}
            />
          </div>
        </section>

        {/* Section 4 — Closing image + quote */}
        <section>
          <SectionHeader
            title="Closing editorial section"
            sub="The full-width image and serif quote at the very bottom of the landing page, above the site footer."
          />
          <div className="space-y-3">
            <MediaSlotRow
              label="Closing image"
              url={closing.url}
              alt={closing.alt}
              onUrlChange={setSlotField(setClosing, "url")}
              onAltChange={setSlotField(setClosing, "alt")}
              onRemove={() => setClosing(emptySlot())}
            />
            <div className="border border-slate-100 rounded-xl p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Closing quote</div>
              <Input
                placeholder={DEFAULT_QUOTE}
                value={quote}
                maxLength={60}
                onChange={(e) => setQuote(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Section 5 — Featured in the Collection property cards */}
        <section>
          <SectionHeader
            title="Featured in the Collection — property cards"
            sub="Curated properties shown on /apply/property-manager under 'Featured in the Collection'. Leave slots empty to auto-select from your Property catalog. Paste a theonehundredcollection.com property URL to auto-fill the name, market, and hero photo."
          />
          <div className="space-y-3">
            {featuredSlots.map((slot, i) => (
              <FeaturedPropertySlotRow
                key={i}
                label={`Featured property ${i + 1}`}
                slot={slot}
                onChange={(next) =>
                  setFeaturedSlots((prev) => prev.map((s, idx) => (idx === i ? next : s)))
                }
                onRemove={() =>
                  setFeaturedSlots((prev) => prev.map((s, idx) => (idx === i ? emptyFeaturedSlot() : s)))
                }
              />
            ))}
          </div>
        </section>
      </div>

      {/* Fixed action bar */}
      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => window.open("/apply", "_blank")}>
          <Eye className="w-4 h-4 mr-1.5" />
          Preview
        </Button>
        <Button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="bg-[#0D1B2A] hover:bg-[#162535] text-white"
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}