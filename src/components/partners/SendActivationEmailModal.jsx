import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Send, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function SendActivationEmailModal({ open, onOpenChange, partner }) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !partner?.id) return;
    setLoading(true);
    setError("");
    setPreviewHtml("");
    base44.functions.invoke("sendActivationEmail", { partner_id: partner.id, preview_only: true })
      .then((res) => {
        if (res.data?.error) {
          setError(res.data.error);
        } else if (res.data?.preview_html) {
          setPreviewHtml(res.data.preview_html);
          setEmail(res.data.email || "");
        }
      })
      .catch((e) => setError(e.response?.data?.error || e.message || "Failed to load preview"))
      .finally(() => setLoading(false));
  }, [open, partner?.id]);

  const handleSend = async (resend = false) => {
    setSending(true);
    setError("");
    try {
      const res = await base44.functions.invoke("sendActivationEmail", { partner_id: partner.id, preview_only: false, resend });
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        toast({ title: resend ? `New activation link sent to ${res.data.email || email}.` : `Activation email sent to ${res.data.email || email}.` });
        onOpenChange(false);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to send activation email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send activation email to {partner?.partner_name}</DialogTitle>
          <DialogDescription>
            This will send a branded welcome email to <strong>{partner?.primary_contact_email}</strong> with a one-click link that will create their portal account and link it to {partner?.partner_name}. The link expires in 14 days.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 p-4 bg-red-50 rounded-lg">{error}</div>
        ) : (
          <>
            <div className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Email preview</div>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-[450px] border-0"
                title="Activation email preview"
              />
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={() => handleSend(true)}
            disabled={sending || loading || !!error}
            variant="outline"
            className="border-[#C9A96E] text-[#C9A96E] hover:bg-[#C9A96E]/5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
            Resend with new link
          </Button>
          <Button
            onClick={() => handleSend(false)}
            disabled={sending || loading || !!error}
            className="bg-[#C9A96E] hover:bg-[#B8965C] text-white"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send activation email
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}