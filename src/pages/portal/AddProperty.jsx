import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/lib/useCurrentUser";
import PortalLayout from "@/components/portal/PortalLayout";
import WizardStepIndicator from "@/components/portal/wizard/WizardStepIndicator";
import Step1PasteUrl from "@/components/portal/wizard/Step1PasteUrl";
import Step2Extracting from "@/components/portal/wizard/Step2Extracting";
import SubmissionForm from "@/components/portal/SubmissionForm";

const STEPS = ["Paste URL", "Extracting", "Review & Submit"];

export default function AddProperty() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [listingUrl, setListingUrl] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [partnerRecord, setPartnerRecord] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } })
      .then(rows => setPartnerRecord(rows[0] || null))
      .catch(() => {});
  }, [user?.id]);

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
      partner_id: partnerRecord?.id || "",
      partner_name: partnerRecord?.partner_name || "",
      partner_email: user?.email || "",
      market: partnerRecord?.market || "",
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
      <div className="max-w-2xl mx-auto px-2 py-6 lg:py-10">
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
            initialData={{ ...extractedData, listing_url: extractedData?.listing_url || listingUrl || "" }}
            onSubmit={handleSubmit}
            onBack={() => setStep(extractedData?.ai_imported === false ? 1 : 2)}
          />
        )}
      </div>
    </PortalLayout>
  );
}