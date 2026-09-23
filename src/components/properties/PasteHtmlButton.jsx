import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Code2 } from "lucide-react";
import PasteHtmlModal from "./PasteHtmlModal";

/**
 * Opens a modal where the admin pastes raw HTML (containing <img src> or
 * background-image URLs); the system extracts the image URLs and adds the
 * selected ones to the property's gallery.
 */
export default function PasteHtmlButton({
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
        className="flex items-center gap-1.5 border-[#0F172A] text-[#0F172A] hover:bg-[#0F172A]/10"
      >
        <Code2 className="w-3.5 h-3.5" />
        Paste HTML
      </Button>
      <PasteHtmlModal
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