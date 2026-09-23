import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Check, Loader2, AlertTriangle, ChevronLeft } from "lucide-react";
import PhotoReviewGrid from "@/components/portal/wizard/PhotoReviewGrid";
import { ingestPropertyImages } from "@/lib/propertyImagesBlob";

const SUBSTEPS = [
  { key: "validating", label: "Validating listing URL" },
  { key: "reading", label: "Reading property details" },
  { key: "amenities", label: "Extracting amenities and features" },
  { key: "photos", label: "Importing photos" },
  { key: "editorial", label: "Rewriting in The 100 Collection editorial voice" },
  { key: "fitscore", label: "Calculating fit score" },
];

async function reuploadExternalImages(photoUrls, photoConfidence, onProgress) {
  if (!photoUrls?.length) return [];
  // Re-host newly found listing photos to Vercel Blob. Already-hosted Sanity,
  // Supabase, Base44, and Blob URLs stay on those hosts.
  const urls = photoUrls;

  const confMap = {};
  if (photoConfidence) {
    photoConfidence.forEach(pc => {
      confMap[pc.url] = { confidence: pc.confidence, slugMatch: pc.slug_match };
    });
  }

  const hosted = await ingestPropertyImages(urls);
  onProgress(hosted.length, urls.length);
  return hosted.map((url, i) => ({
    url,
    ...(confMap[urls[i]] || { confidence: "low", slugMatch: false }),
  }));
}

export default function Step2Extracting({ url, onComplete, onBack }) {
  const [substepIdx, setSubstepIdx] = useState(0);
  const [substepErrors, setSubstepErrors] = useState({});
  const [photosFound, setPhotosFound] = useState(0);
  const [photosTotal, setPhotosTotal] = useState(0);
  const [preview, setPreview] = useState({});
  const [fatalError, setFatalError] = useState(null);
  const [showPhotoReview, setShowPhotoReview] = useState(false);
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [scrapedData, setScrapedData] = useState({});
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runExtraction();
  }, []);

  const runExtraction = async () => {
    // Step 0 — validating
    setSubstepIdx(0);
    await delay(600);

    // Step 1 — reading
    setSubstepIdx(1);
    let scraped = {};
    try {
      const res = await base44.functions.invoke("scrapePropertyUrl", { url });
      scraped = res.data?.data || {};
      setPreview(scraped);
      setScrapedData(scraped);
    } catch (err) {
      setFatalError("We couldn't read that listing. You can enter the details manually.");
      return;
    }

    // Step 2 — amenities
    setSubstepIdx(2);
    await delay(300);

    // Step 3 — photos
    // Use the same discover + commit methodology as the rescan flow for better
    // image discovery (gallery containers, JSON-LD, data-attrs, <a> hrefs, etc.).
    // Fall back to LLM-scraped photos if discover finds nothing.
    setSubstepIdx(3);
    let rawPhotos = [];
    let photoConfidence = scraped.photo_confidence || [];
    try {
      const discoverRes = await base44.functions.invoke("scrapePropertyUrl", {
        url,
        mode: "discover",
      });
      const candidates = discoverRes?.data?.data?.candidates || [];
      if (candidates.length > 0) {
        const commitRes = await base44.functions.invoke("scrapePropertyUrl", {
          url,
          mode: "commit",
          selected_urls: candidates.map((c) => c.url),
        });
        rawPhotos = commitRes?.data?.data?.photo_urls || [];
      }
    } catch {
      // discover/commit failed — fall through to LLM photos
    }
    if (rawPhotos.length === 0) {
      rawPhotos = scraped.photo_urls || [];
      photoConfidence = scraped.photo_confidence || [];
    }
    setPhotosTotal(rawPhotos.length);
    let hostedPhotos = [];
    try {
      hostedPhotos = await reuploadExternalImages(rawPhotos, photoConfidence, (done, total) => {
        setPhotosFound(done);
        setPhotosTotal(total);
      });
    } catch {
      setSubstepErrors(e => ({ ...e, photos: "Couldn't import some photos — you can add them manually." }));
      hostedPhotos = [];
    }

    // If no photos were found, show a note and continue to content extraction
    if (hostedPhotos.length === 0) {
      setSubstepErrors(e => ({ ...e, photos: "No photos found on this listing — you can upload them manually in the next step." }));
      await delay(2000);
      runEditorial(scraped, []);
      return;
    }

    // Show photo review grid before continuing
    setReviewPhotos(hostedPhotos);
    setShowPhotoReview(true);
  };

  const runEditorial = async (scraped, selectedPhotoUrls) => {

    // Step 4 — editorial voice (AI rewrite if not already done by scraper)
    setSubstepIdx(4);
    let editorialData = { ...scraped, photo_urls: selectedPhotoUrls };
    const originalDescription = scraped.description || "";
    const originalHeadline = scraped.headline || "";
    const originalSummary = scraped.short_summary || "";

    // Store originals alongside editorial versions
    editorialData._original_description = originalDescription;
    editorialData._original_headline = originalHeadline;
    editorialData._original_summary = originalSummary;

    // If the scraper already ran editorial rewrite, keep it; otherwise attempt a rewrite
    if (!scraped.ai_editorial_done && (originalDescription || originalHeadline)) {
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are the editor for The 100 Collection — a curated portfolio of luxury vacation rentals. Rewrite the following property's text in an evocative, warm, sophisticated editorial voice. Return JSON with keys: headline (max 12 words), short_summary (2-3 sentences), description (max 200 words).

Property name: ${scraped.property_name || "this property"}
Location: ${scraped.location_full || ""}
Original headline: ${originalHeadline}
Original summary: ${originalSummary}
Original description: ${originalDescription}`,
          response_json_schema: {
            type: "object",
            properties: {
              headline: { type: "string" },
              short_summary: { type: "string" },
              description: { type: "string" },
            },
          },
        });
        if (result?.headline) editorialData.headline = result.headline;
        if (result?.short_summary) editorialData.short_summary = result.short_summary;
        if (result?.description) editorialData.description = result.description;
      } catch {
        setSubstepErrors(e => ({ ...e, editorial: "Editorial rewrite unavailable — original text kept." }));
      }
    }

    // Step 5 — fit score
    setSubstepIdx(5);
    await delay(400);
    setSubstepIdx(6); // all done

    onComplete({ ...editorialData, listing_url: url, ai_imported: true });
  };

  const delay = ms => new Promise(res => setTimeout(res, ms));

  const getSubstepLabel = (i) => {
    if (i === 3) {
      if (photosTotal > 0) return `Importing photos (${photosFound} of ${photosTotal})`;
      return "Importing photos";
    }
    return SUBSTEPS[i].label;
  };

  if (fatalError) {
    return (
      <div className="py-20 text-center max-w-sm mx-auto">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-lg font-light text-[#0D1B2A] mb-2">Import Failed</h2>
        <p className="text-slate-500 text-sm mb-6">{fatalError}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Try another URL
          </button>
          <button onClick={() => onComplete({ ai_imported: false })} className="text-sm bg-[#0D1B2A] text-white px-4 py-2.5 rounded-xl hover:bg-[#1a2e45] transition-colors">
            Enter Manually
          </button>
        </div>
      </div>
    );
  }

  if (showPhotoReview) {
    return (
      <div className="py-8">
        <PhotoReviewGrid
          initialPhotos={reviewPhotos}
          onContinue={(selectedUrls) => {
            setShowPhotoReview(false);
            runEditorial(scrapedData, selectedUrls);
          }}
          onBack={onBack}
        />
      </div>
    );
  }

  const isComplete = substepIdx >= SUBSTEPS.length;

  const hasAnyPreviewData = preview.property_name || preview.headline || preview.short_summary ||
    preview.description || preview.location_full || preview.bedrooms || preview.bathrooms ||
    preview.sleeps || preview.property_type || preview.unique_features || preview.best_fit_guest ||
    preview.design_style_notes || preview.amenities?.length > 0;

  return (
    <div className="flex gap-8 items-start">
      {/* Left: progress */}
      <div className="flex-1 min-w-0">
        <div className="mb-8 text-center">
          <div className="w-14 h-14 bg-[#0D1B2A] rounded-2xl flex items-center justify-center mx-auto mb-5">
            {isComplete
              ? <Check className="w-7 h-7 text-emerald-400" />
              : <Loader2 className="w-6 h-6 text-[#C9A96E] animate-spin" />
            }
          </div>
          <h2 className="text-xl font-light text-[#0D1B2A] mb-1">
            {isComplete ? "Import Complete!" : "Analyzing Your Property"}
          </h2>
          <p className="text-slate-400 text-xs">Typically takes 15–30 seconds. Don't refresh.</p>
        </div>

        <div className="max-w-xs mx-auto space-y-3">
          {SUBSTEPS.map((s, i) => {
            const done = i < substepIdx;
            const active = i === substepIdx;
            const hasError = substepErrors[s.key];
            return (
              <div key={s.key} className={`flex items-center gap-3 transition-opacity duration-500 ${
                i > substepIdx + 1 ? "opacity-30" : "opacity-100"
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                  done
                    ? hasError ? "bg-amber-400" : "bg-emerald-500"
                    : active
                      ? "bg-[#C9A96E] animate-pulse"
                      : "bg-slate-100"
                }`}>
                  {done && !hasError && <Check className="w-3 h-3 text-white" />}
                  {done && hasError && <span className="text-white text-[9px]">!</span>}
                </div>
                <div className="flex-1">
                  <span className={`text-sm ${active || done ? "text-[#0D1B2A]" : "text-slate-300"}`}>
                    {getSubstepLabel(i)}
                  </span>
                  {hasError && (
                    <div className="text-[11px] text-amber-600 mt-0.5">{hasError} <button className="underline" onClick={() => {}}>Continue</button></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: live preview emerges */}
      {hasAnyPreviewData && (
        <div className="hidden lg:block w-80 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-fade-up max-h-[70vh] overflow-y-auto">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Live Preview</div>
            {preview.property_name && (
              <h3 className="font-medium text-[#0D1B2A] text-sm mb-1.5 leading-snug">{preview.property_name}</h3>
            )}
            {preview.property_type && (
              <span className="inline-block text-[10px] capitalize bg-[#C9A96E]/10 text-[#A68B4B] rounded-full px-2 py-0.5 mb-2">{preview.property_type}</span>
            )}
            {preview.location_full && (
              <p className="text-xs text-slate-500 mb-3">📍 {preview.location_full}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {preview.bedrooms != null && preview.bedrooms !== "" && <Chip>{preview.bedrooms} bed</Chip>}
              {preview.bathrooms != null && preview.bathrooms !== "" && <Chip>{preview.bathrooms} bath</Chip>}
              {preview.half_bathrooms > 0 && <Chip>{preview.half_bathrooms} half bath</Chip>}
              {preview.sleeps != null && preview.sleeps !== "" && <Chip>Sleeps {preview.sleeps}</Chip>}
            </div>
            {preview.headline && (
              <p className="text-xs font-medium text-[#0D1B2A] mb-2 leading-relaxed">{preview.headline}</p>
            )}
            {preview.short_summary && (
              <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">{preview.short_summary}</p>
            )}
            {preview.description && (
              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed line-clamp-4">{preview.description}</p>
            )}
            {preview.amenities?.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Amenities</div>
                <div className="flex flex-wrap gap-1">
                  {preview.amenities.slice(0, 8).map(a => (
                    <Chip key={a}>{a}</Chip>
                  ))}
                  {preview.amenities.length > 8 && (
                    <span className="text-[10px] text-slate-400">+{preview.amenities.length - 8} more</span>
                  )}
                </div>
              </div>
            )}
            {preview.unique_features && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Unique Features</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{preview.unique_features}</p>
              </div>
            )}
            {preview.best_fit_guest && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Best Fit Guest</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{preview.best_fit_guest}</p>
              </div>
            )}
            {preview.design_style_notes && (
              <div className="mb-3">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Design Style</div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{preview.design_style_notes}</p>
              </div>
            )}
            {preview.photo_urls?.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1">
                {preview.photo_urls.slice(0, 3).map((u, i) => (
                  <div key={i} className="aspect-video rounded-lg overflow-hidden bg-slate-100">
                    <img src={u} className="w-full h-full object-cover opacity-60" alt="" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-block text-[11px] bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 mr-1 mb-1">
      {children}
    </span>
  );
}