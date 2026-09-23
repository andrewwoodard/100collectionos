import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import AiPhotoPullModal from "./AiPhotoPullModal";

/**
 * AI-pulls photography from the partner's property page URL and merges the
 * extracted photos into this property's gallery.
 *
 * Two-step flow: clicking opens a discovery modal that showcases the img /
 * background-image URLs found on the page. The user picks which to scrape,
 * then the selected URLs are run through the quality filter and saved.
 */
export default function AiPhotoPullButton({
  listingUrl,
  supabasePropertyId,
  sbQueryKey,
  currentImages = [],
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!listingUrl}
        className="flex items-center gap-1.5 border-[#0F172A] text-[#0F172A] hover:bg-[#0F172A]/10"
      >
        <Sparkles className="w-3.5 h-3.5" />
        AI Pull Photos
      </Button>
      <AiPhotoPullModal
        open={open}
        onClose={() => setOpen(false)}
        listingUrl={listingUrl}
        supabasePropertyId={supabasePropertyId}
        sbQueryKey={sbQueryKey}
        currentImages={currentImages}
      />
    </>
  );
}