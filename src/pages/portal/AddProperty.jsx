import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { usePortalPartnerRollup } from "@/hooks/usePortalPartnerRollup";
import PortalLayout from "@/components/portal/PortalLayout";
import WizardStepIndicator from "@/components/portal/wizard/WizardStepIndicator";
import Step1PasteUrl from "@/components/portal/wizard/Step1PasteUrl";
import Step2Extracting from "@/components/portal/wizard/Step2Extracting";
import SubmissionForm from "@/components/portal/SubmissionForm";

const STEPS = ["Paste URL", "Extracting", "Review & Submit"];

/** Partner's primary destination / market (e.g. "Lake Anna"). */
function partnerDestination(partner) {
  if (!partner) return "";
  return String(partner.market || partner.region || "").trim();
}

export default function AddProperty() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { primaryPartner } = usePortalPartnerRollup(user);
  const [step, setStep] = useState(1);
  const [listingUrl, setListingUrl] = useState("");
  const [extractedData, setExtractedData] = useState(null);

  const destination = partnerDestination(primaryPartner);

  const handleStep1Continue = (url) => {
    setListingUrl(url);
    setStep(2);
  };

  const handleStep1ManualEntry = () => {
    setExtractedData({ ai_imported: false });
    setStep(3);
  };

  const handleStep2Complete = (data) => {
    setExtractedData(data);
    setStep(3);
  };

  const handleStep2Back = () => {
    setStep(1);
  };

  const handleSubmit = async (data, isDraft) => {
    const status = isDraft ? "draft" : "submitted";
    const payload = {
      ...data,
      listing_url: data.listing_url || listingUrl || "",
      partner_id: primaryPartner?.id || "",
      partner_name: primaryPartner?.partner_name || "",
      partner_email: user?.email || "",
      market: destination || primaryPartner?.market || "",
      submission_type: "new",
      status,
      ...(status === "submitted" ? { submitted_date: new Date().toISOString() } : {}),
    };
    await base44.entities.PropertySubmission.create(payload);
    toast({ title: isDraft ? "Draft saved" : "Property submitted for review." });
    navigate("/portal/properties");
  };

  return (
    <PortalLayout>
      {/* Allow full add/import while admin is impersonating this partner */}
      <div className="impersonation-allow-writes max-w-2xl mx-auto px-2 py-6 lg:py-10">
        <WizardStepIndicator currentStep={step} steps={STEPS} />

        {step === 1 && (
          <Step1PasteUrl
            onContinue={handleStep1Continue}
            onManualEntry={handleStep1ManualEntry}
          />
        )}

        {step === 2 && (
          <Step2Extracting
            url={listingUrl}
            onComplete={handleStep2Complete}
            onBack={handleStep2Back}
          />
        )}

        {step === 3 && (
          <SubmissionForm
            initialData={{
              ...extractedData,
              listing_url: extractedData?.listing_url || listingUrl || "",
              // Partner destination is the Location default (e.g. Lake Anna for Lakefront Luxury)
              location_full: destination || extractedData?.location_full || "",
              property_type: extractedData?.property_type || "house",
            }}
            partnerMarket={destination}
            onSubmit={handleSubmit}
            onBack={() => setStep(extractedData?.ai_imported === false ? 1 : 2)}
          />
        )}
      </div>
    </PortalLayout>
  );
}
