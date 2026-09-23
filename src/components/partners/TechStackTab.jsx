import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TECH_STACK_STEPS, TECH_STACK_FIELDS, EMPTY_TECH_STACK } from "@/lib/techStackConfig";
import TechStackField from "@/components/portal/TechStackField";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { format } from "date-fns";

export default function TechStackTab({ partnerId }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState(EMPTY_TECH_STACK);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => base44.auth.me(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: techStack, isLoading } = useQuery({
    queryKey: ["partner-tech-stack", partnerId],
    queryFn: async () => {
      const results = await base44.entities.PartnerTechStack.filter({ partner_id: partnerId });
      return results?.[0] || null;
    },
    enabled: !!partnerId,
  });

  useEffect(() => {
    const data = { ...EMPTY_TECH_STACK };
    if (techStack) {
      TECH_STACK_FIELDS.forEach(f => {
        if (f.type === "multiselect") {
          data[f.key] = techStack[f.key] || [];
        } else {
          data[f.key] = techStack[f.key] || "";
        }
        if (f.type === "select" || f.type === "multiselect") {
          data[f.key + "_other"] = techStack[f.key + "_other"] || "";
        }
      });
    }
    setFormData(data);
  }, [techStack]);

  const updateField = (key, val) => { setFormData(prev => ({ ...prev, [key]: val })); setSaved(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...formData,
        partner_id: partnerId,
        last_updated_by: user?.email || "admin",
        last_updated_at: new Date().toISOString(),
      };
      if (techStack?.id) {
        await base44.entities.PartnerTechStack.update(techStack.id, payload);
      } else {
        await base44.entities.PartnerTechStack.create(payload);
      }
      queryClient.invalidateQueries({ queryKey: ["partner-tech-stack", partnerId] });
      setSaved(true);
    } catch (e) {
      console.warn("Save failed", e?.message);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Loading…</div>;
  }

  const notesField = TECH_STACK_FIELDS.find(f => f.key === "notes");

  return (
    <div className="space-y-6">
      {techStack?.last_updated_by && (
        <div className="text-xs text-gray-500">
          Last updated by <span className="font-medium text-gray-700">{techStack.last_updated_by}</span>
          {techStack.last_updated_at && <> on {format(new Date(techStack.last_updated_at), "MMM d, yyyy 'at' h:mm a")}</>}
        </div>
      )}

      {!techStack && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          No tech stack on file. The partner can complete the form in their portal, or you can enter it here.
        </div>
      )}

      {TECH_STACK_STEPS.map(stepInfo => (
        <div key={stepInfo.num} className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">{stepInfo.category}</h3>
          <div className="space-y-4">
            {TECH_STACK_FIELDS.filter(f => f.step === stepInfo.num && !f.adminOnly).map(field => (
              <TechStackField
                key={field.key}
                field={field}
                value={formData[field.key]}
                otherValue={formData[field.key + "_other"]}
                onChange={v => updateField(field.key, v)}
                onOtherChange={v => updateField(field.key + "_other", v)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Admin-only notes */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Internal Notes</h3>
        <TechStackField
          field={notesField}
          value={formData.notes}
          onChange={v => updateField("notes", v)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? "Saving…" : "Save Tech Stack"}
        </Button>
        {saved && <span className="text-sm text-emerald-600">Saved!</span>}
      </div>
    </div>
  );
}