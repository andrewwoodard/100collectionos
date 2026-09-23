import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Mail, Copy, Send, Loader2, Check, FileText, Pencil, Save, X, Plus, Archive, RotateCcw, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import EmailTemplateForm from "@/components/admin/email/EmailTemplateForm";
import NewTemplateModal from "@/components/admin/email/NewTemplateModal";
import VariableHelper from "@/components/admin/email/VariableHelper";
import { buildPayloadFromForm, MOCK_CONTEXT } from "@/lib/emailTemplatePreview";

const URGENCY_STYLES = {
  default: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  alert: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
};

const URGENCY_LABELS = {
  default: "Default", success: "Success", warning: "Warning", alert: "Alert", info: "Info",
};

const CATEGORY_ORDER = [
  "Partner-facing", "Homeowner-facing", "Candidate-facing", "Invitation acceptance",
  "Admin — Partner actions", "Admin — Financial", "Admin — Digests", "Offboarding", "Auto-reply",
];

function sortByCategory(a, b) {
  const ia = CATEGORY_ORDER.indexOf(a.category);
  const ib = CATEGORY_ORDER.indexOf(b.category);
  if (ia === -1 && ib === -1) return (a.category || "").localeCompare(b.category || "");
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

export default function AdminEmailPreviews() {
  const { variationSlug: urlSlug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [formValues, setFormValues] = useState(null);
  const [livePreviewHtml, setLivePreviewHtml] = useState("");
  const [livePreviewSubject, setLivePreviewSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewStatus, setPreviewStatus] = useState("idle"); // idle | rendering | ready | error
  const debounceRef = useRef(null);

  // Fetch all templates from entity
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => base44.entities.EmailTemplate.list("-created_date", 200),
  });
  const allTemplates = (templatesData || []).sort(sortByCategory);
  const activeTemplates = allTemplates.filter(t => t.status !== "archived");
  const archivedTemplates = allTemplates.filter(t => t.status === "archived");

  // Determine selected slug
  const selectedSlug = urlSlug || (activeTemplates.length > 0 ? activeTemplates[0].slug : null);
  const selectedTemplate = allTemplates.find(t => t.slug === selectedSlug);

  // Redirect to first template if none selected
  useEffect(() => {
    if (!urlSlug && activeTemplates.length > 0) {
      navigate(`/admin/email-previews/${activeTemplates[0].slug}`, { replace: true });
    }
  }, [urlSlug, activeTemplates, navigate]);

  // Group active templates by category
  const categories = activeTemplates.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  const selectVariation = (slug) => {
    setEditMode(false);
    setFormValues(null);
    setHasUnsavedChanges(false);
    navigate(`/admin/email-previews/${slug}`);
  };

  // Fetch preview from getEmailPreview (non-edit mode)
  const { data: previewRes, isLoading: previewLoading } = useQuery({
    queryKey: ["email-preview", selectedSlug],
    queryFn: () => base44.functions.invoke("getEmailPreview", { variationSlug: selectedSlug }),
    enabled: !!selectedSlug && !editMode,
  });
  const preview = previewRes?.data;

  // When entering edit mode, load the template's full data into form.
  // Seed the live preview with the current non-edit preview so there's no
  // flash of spinner — the debounced re-render will update it seamlessly.
  const enterEditMode = async () => {
    if (!selectedTemplate) return;
    if (preview?.html) {
      setLivePreviewHtml(preview.html);
      setLivePreviewSubject(preview.subject || "");
      setPreviewStatus("ready");
    } else {
      setLivePreviewHtml("");
      setPreviewStatus("idle");
    }
    setFormValues({ ...selectedTemplate });
    setEditMode(true);
  };

  const exitEditMode = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Discard them?")) return;
    }
    setEditMode(false);
    setFormValues(null);
    setHasUnsavedChanges(false);
    setLivePreviewHtml("");
    setPreviewStatus("idle");
  };

  // Debounced live preview when form values change.
  // Uses server-side buildAdminEmail with the current (unsaved) form values.
  // Keeps showing the last rendered preview while a new one is fetching.
  const updateLivePreview = useCallback((values) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!values) return;
      setPreviewStatus("rendering");
      console.log("[preview] rendering with form state", { slug: values.slug, headline: values.headline });
      try {
        const payload = buildPayloadFromForm(values, MOCK_CONTEXT);
        const res = await base44.functions.invoke("buildAdminEmail", payload);
        if (res?.data?.html) {
          setLivePreviewHtml(res.data.html);
          setLivePreviewSubject(payload.subject || payload.headline);
          setPreviewStatus("ready");
          console.log("[preview] render complete");
        } else {
          setPreviewStatus("error");
          console.error("[preview] render returned no HTML", res);
        }
      } catch (err) {
        setPreviewStatus("error");
        console.error("[preview] render failed:", err);
      }
    }, 300);
  }, []);

  const handleFormChange = (newValues) => {
    setFormValues(newValues);
    setHasUnsavedChanges(true);
    // updateLivePreview is also triggered by the useEffect below, but we
    // call it here too for immediate feedback on the first keystroke.
    updateLivePreview(newValues);
  };

  // Trigger live preview when entering edit mode or when form values change.
  // updateLivePreview debounces internally, so rapid typing just resets the timer.
  useEffect(() => {
    if (editMode && formValues) {
      updateLivePreview(formValues);
    }
  }, [editMode, formValues, updateLivePreview]);

  // Save template
  const handleSave = async () => {
    if (!formValues || !selectedTemplate) return;
    setSaving(true);
    try {
      const user = await base44.auth.me();
      const updateData = {
        name: formValues.name,
        category: formValues.category,
        urgency: formValues.urgency,
        subject: formValues.subject,
        hero_image_url: formValues.hero_image_url || null,
        event_tag: formValues.event_tag || null,
        headline: formValues.headline,
        subheadline: formValues.subheadline || null,
        context_block: formValues.context_block || null,
        data_rows: formValues.data_rows || [],
        callout: formValues.callout || null,
        what_happens_next: formValues.what_happens_next || [],
        cta_label: formValues.cta_label || null,
        cta_url: formValues.cta_url || null,
        secondary_cta_label: formValues.secondary_cta_label || null,
        secondary_cta_url: formValues.secondary_cta_url || null,
        social_proof: formValues.social_proof || null,
        reply_prompt_enabled: formValues.reply_prompt_enabled !== false,
        footer_note: formValues.footer_note || null,
        signoff: formValues.signoff || null,
        sections: formValues.sections || [],
        notes: formValues.notes || null,
        last_edited_by: user?.email || "",
        last_edited_at: new Date().toISOString(),
      };
      await base44.entities.EmailTemplate.update(selectedTemplate.id, updateData);
      // Log audit entry
      try {
        await base44.entities.AuditEntry.create({
          actor_email: user?.email || "unknown",
          actor_role: "admin",
          action: "email_template_edited",
          entity_type: "EmailTemplate",
          entity_id: selectedTemplate.id,
          target_name: formValues.name || selectedTemplate.slug,
          details: `Edited email template "${formValues.name || selectedTemplate.slug}"`,
        });
      } catch (e) { /* non-critical */ }

      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["email-preview", selectedSlug] });
      toast({ title: "Template saved", description: formValues.name });
    } catch (err) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Archive template
  const handleArchive = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const user = await base44.auth.me();
      await base44.entities.EmailTemplate.update(selectedTemplate.id, {
        status: "archived",
        archived_at: new Date().toISOString(),
        last_edited_by: user?.email || "",
        last_edited_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setShowArchiveConfirm(false);
      setEditMode(false);
      toast({ title: "Template archived", description: selectedTemplate.name });
      // Navigate to first active template
      if (activeTemplates.length > 1) {
        const next = activeTemplates.find(t => t.slug !== selectedSlug);
        if (next) navigate(`/admin/email-previews/${next.slug}`);
      }
    } catch (err) {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Restore template
  const handleRestore = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const user = await base44.auth.me();
      await base44.entities.EmailTemplate.update(selectedTemplate.id, {
        status: "active",
        archived_at: null,
        last_edited_by: user?.email || "",
        last_edited_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast({ title: "Template restored", description: selectedTemplate.name });
    } catch (err) {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Copy HTML
  const copyHtml = async () => {
    const html = editMode ? livePreviewHtml : preview?.html;
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "HTML copied to clipboard" });
    } catch (e) {
      toast({ title: "Copy failed", description: e.message, variant: "destructive" });
    }
  };

  // Send test email
  const sendTest = async () => {
    if (hasUnsavedChanges) {
      toast({ title: "Save your changes before sending a test", variant: "destructive" });
      return;
    }
    const html = editMode ? livePreviewHtml : preview?.html;
    const subject = editMode ? livePreviewSubject : preview?.subject;
    if (!html || !subject) return;
    setSending(true);
    try {
      const user = await base44.auth.me();
      if (!user?.email) {
        toast({ title: "Could not determine your email", variant: "destructive" });
        return;
      }
      const res = await base44.functions.invoke("sendResendEmail", {
        to: user.email,
        subject: "[TEST] " + subject,
        html,
      });
      if (res?.data?.ok) {
        toast({ title: "Test email sent", description: `Check ${user.email}` });
      } else {
        toast({ title: "Send failed", description: res?.data?.error || "Unknown error", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Warn on page unload with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // Current preview HTML (edit mode uses live preview, otherwise fetched preview)
  const currentHtml = editMode ? livePreviewHtml : preview?.html;
  const currentSubject = editMode ? livePreviewSubject : preview?.subject;
  const isArchived = selectedTemplate?.status === "archived";

  return (
    <div className="flex gap-0 h-[calc(100vh-120px)]">
      {/* Left sidebar */}
      <div className="w-[280px] flex-shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
        <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#C9A96E]" />
              <h2 className="text-sm font-semibold text-[#0D1B2A]">Email Templates</h2>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{activeTemplates.length} active</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1 text-xs bg-amber-500 text-white px-2 py-1 rounded-lg hover:bg-amber-400 transition-colors"
            title="New template"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {templatesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : allTemplates.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-gray-400 mb-2">No templates yet.</p>
            <p className="text-[11px] text-gray-400">Run the seedEmailTemplates function to create all 51 templates, or click + to create one manually.</p>
          </div>
        ) : (
          <div className="py-2">
            {Object.entries(categories).map(([category, templates]) => (
              <div key={category} className="mb-3">
                <div className="px-4 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A96E]">{category}</span>
                </div>
                <div className="space-y-0.5 px-2">
                  {templates.map((t) => {
                    const isSelected = t.slug === selectedSlug;
                    return (
                      <button
                        key={t.slug}
                        onClick={() => selectVariation(t.slug)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          isSelected ? "bg-[#0D1B2A] text-white" : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div className={`text-xs font-medium leading-tight ${isSelected ? "text-white" : "text-[#0D1B2A]"}`}>
                          {t.name}
                        </div>
                        <div className="mt-1">
                          <span className={`inline-block text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                            isSelected ? "bg-white/15 text-white/80" : URGENCY_STYLES[t.urgency] || URGENCY_STYLES.default
                          }`}>
                            {URGENCY_LABELS[t.urgency] || t.urgency}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Archived section */}
            {archivedTemplates.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-2">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center gap-1 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-600"
                >
                  {showArchived ? "▾" : "▸"} Archived ({archivedTemplates.length})
                </button>
                {showArchived && (
                  <div className="space-y-0.5 px-2 mt-1">
                    {archivedTemplates.map((t) => {
                      const isSelected = t.slug === selectedSlug;
                      return (
                        <button
                          key={t.slug}
                          onClick={() => selectVariation(t.slug)}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            isSelected ? "bg-gray-200 text-gray-700" : "hover:bg-gray-50 text-gray-400"
                          }`}
                        >
                          <div className="text-xs font-medium leading-tight line-through opacity-60">{t.name}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right pane */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {/* Toolbar */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {(editMode ? (previewStatus === "rendering" && !livePreviewHtml) : previewLoading) ? (
              <div className="h-4 w-64 bg-gray-100 rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">Subject:</span>
                <span className="text-sm font-medium text-[#0D1B2A] truncate">{currentSubject || "—"}</span>
                {hasUnsavedChanges && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-600 ml-2 flex-shrink-0">
                    <AlertTriangle className="w-3 h-3" /> Unsaved
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Edit toggle */}
            {!isArchived && (
              <button
                onClick={editMode ? exitEditMode : enterEditMode}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  editMode
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {editMode ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                {editMode ? "Exit Edit" : "Edit"}
              </button>
            )}

            {/* Archive/Restore */}
            {editMode && !isArchived && (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="flex items-center gap-1.5 border border-red-200 text-red-600 text-xs px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {isArchived && (
              <button
                onClick={handleRestore}
                disabled={saving}
                className="flex items-center gap-1.5 border border-emerald-200 text-emerald-600 text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
            )}

            {/* Save (only in edit mode with unsaved changes) */}
            {editMode && hasUnsavedChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 bg-[#0D1B2A] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            )}

            <div className="w-px h-5 bg-gray-200" />

            <button
              onClick={copyHtml}
              disabled={!currentHtml}
              className="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy HTML"}
            </button>
            <button
              onClick={sendTest}
              disabled={sending || !currentHtml}
              className="flex items-center gap-1.5 bg-[#0D1B2A] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#1a2e45] disabled:opacity-40 transition-colors"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send test to me
            </button>
          </div>
        </div>

        {/* Description bar */}
        {(editMode ? formValues?.description : preview?.description) && (
          <div className="px-6 py-2 bg-amber-50/50 border-b border-amber-100">
            <p className="text-xs text-gray-500">{editMode ? formValues.description : preview.description}</p>
          </div>
        )}

        {/* Main content area */}
        {editMode ? (
          <div className="flex-1 flex min-h-0">
            {/* Preview (60%) */}
            <div className="w-3/5 overflow-y-auto p-4 flex justify-center border-r border-gray-100">
               {livePreviewHtml ? (
                 <div className="w-full relative">
                   {previewStatus === "rendering" && (
                     <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur px-2 py-1 rounded-full shadow-sm border border-gray-100">
                       <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                       <span className="text-[10px] text-gray-500">Updating...</span>
                     </div>
                   )}
                   <iframe
                     srcDoc={livePreviewHtml}
                     title="Email Preview"
                     sandbox=""
                     className="w-full bg-white rounded-lg shadow-sm border border-gray-100"
                     style={{ maxWidth: "700px", minHeight: "100%" }}
                   />
                 </div>
               ) : previewStatus === "error" ? (
                 <div className="flex flex-col items-center justify-center w-full text-gray-400">
                   <FileText className="w-8 h-8 mb-2 text-gray-300" />
                   <p className="text-xs">Preview failed to render</p>
                   <p className="text-[10px] mt-1">Check console for details</p>
                 </div>
               ) : (
                 <div className="flex items-center justify-center w-full">
                   <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                 </div>
               )}
             </div>
            {/* Form (40%) */}
            <div className="w-2/5 overflow-y-auto p-4 bg-white">
              <VariableHelper />
              <EmailTemplateForm values={formValues || {}} onChange={handleFormChange} />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            {previewLoading ? (
              <div className="flex items-center justify-center w-full">
                <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
              </div>
            ) : preview?.not_found ? (
              <div className="flex flex-col items-center justify-center text-gray-400 mt-20">
                <FileText className="w-10 h-10 mb-2 text-gray-300" />
                <p className="text-sm">Template not found</p>
                <p className="text-xs mt-1">Run seedEmailTemplates to create all templates</p>
              </div>
            ) : preview?.html ? (
              <iframe
                srcDoc={preview.html}
                title="Email Preview"
                sandbox=""
                className="w-full bg-white rounded-lg shadow-sm border border-gray-100"
                style={{ maxWidth: "700px", minHeight: "100%" }}
              />
            ) : preview?.error ? (
              <div className="flex flex-col items-center justify-center text-gray-400 mt-20">
                <FileText className="w-10 h-10 mb-2 text-gray-300" />
                <p className="text-sm">{preview.error}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-400 mt-20">
                <FileText className="w-10 h-10 mb-2 text-gray-300" />
                <p className="text-sm">Select a template to preview</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New template modal */}
      {showNewModal && (
        <NewTemplateModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["email-templates"] });
          }}
          existingSlugs={allTemplates.map(t => t.slug)}
        />
      )}

      {/* Archive confirmation */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowArchiveConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <Archive className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0D1B2A]">Archive template?</h3>
                <p className="text-xs text-gray-500">{selectedTemplate?.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Archived templates are hidden from the active list and sending functions will not find them. You can restore anytime.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowArchiveConfirm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={handleArchive}
                disabled={saving}
                className="flex items-center gap-1.5 bg-red-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-red-400 disabled:opacity-40 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}