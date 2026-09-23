import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Clock, ShieldAlert } from "lucide-react";

const NAVY = "#0D1B2A";
const GOLD = "#C9A96E";

// Action definitions: label, subtitle (shown under the row button), side-effect
// bullets, and the email that will be sent (if any). Kept here so the row
// buttons, the confirm modal, and the undo toast all stay in sync.
export const ACCESS_ACTIONS = {
  grant: {
    label: "Grant portal access",
    subtitle: "Creates a portal invitation and sends an activation email",
    primaryColor: NAVY,
    sendsEmail: false,
    bullets: (email) => [
      `Creates a portal invitation for ${email}`,
      "Sends an activation email so they can set up their account",
      "Removes them from the open queue",
    ],
  },
  invite: {
    label: "Send application invite",
    subtitle: "Sends an email asking them to complete the application form",
    primaryColor: GOLD,
    sendsEmail: true,
    email: {
      subject: "Welcome, let's get you started",
      firstLine:
        "Hi there, Thanks for your interest in The 100 Collection. Before we set up portal access, we'd love to learn about you and your properties. It takes about three minutes, and we'll get back to you within 48 hours.",
      signoff: "The 100 Collection Team",
    },
    bullets: (email) => [
      `Sends an email to ${email} with a link to the application form`,
      "Marks this sign-up as routed to application",
      "Removes them from the open queue",
    ],
  },
  decline: {
    label: "Decline",
    subtitle: "Removes from queue. Optionally send a polite decline email.",
    primaryColor: "#B45309", // amber-700
    sendsEmail: true,
    email: {
      subject: "Your portal access request",
      firstLine:
        "Hi there, Thank you for your interest in The 100 Collection. After reviewing your request, we're not able to set up portal access at this time. You're welcome to reapply in the future if your situation changes.",
      signoff: "The 100 Collection Team",
    },
    bullets: (email, sendEmail) =>
      sendEmail
        ? [`Sends a polite decline email to ${email}`, "Marks this request as declined", "Removes them from the queue"]
        : ["Marks this request as declined", "Removes them from the queue", "No email is sent"],
  },
};

export default function ConfirmActionModal({ request, actionKey, onClose, onConfirm, pending }) {
  const def = ACCESS_ACTIONS[actionKey];
  const [sendDeclineEmail, setSendDeclineEmail] = useState(false);
  if (!def) return null;

  const name = request.full_name || request.email.split("@")[0];
  const email = request.email;
  const bullets = def.bullets(email, actionKey === "decline" ? sendDeclineEmail : def.sendsEmail);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" onEscapeKeyDown={onClose}>
        <DialogHeader>
          <DialogTitle className="text-xl" style={{ color: NAVY, fontFamily: "var(--font-serif)" }}>
            Confirm: {def.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Recipient */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Recipient</div>
            <div className="text-sm font-medium text-slate-800">{name}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Mail className="w-3 h-3" /> {email}
            </div>
          </div>

          {/* What will happen */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">What will happen</div>
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: def.primaryColor }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Email preview */}
          {def.sendsEmail && (actionKey !== "decline" || sendDeclineEmail) && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email preview
              </div>
              <div className="rounded-xl border border-slate-200 bg-[#0D1B2A] px-4 py-3">
                <div className="text-[11px] text-slate-400 mb-1">Subject</div>
                <div className="text-sm font-medium text-white mb-2">{def.email.subject}</div>
                <div className="text-[11px] text-slate-400 mb-1">Body</div>
                <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">{def.email.firstLine}</pre>
                <div className="text-[11px] text-slate-500 mt-2">... <span className="text-slate-400">{def.email.signoff}</span></div>
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Email sends about one minute after you confirm. Undo within that window cancels it.
              </div>
            </div>
          )}

          {/* Decline checkbox */}
          {actionKey === "decline" && (
            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
              <Checkbox checked={sendDeclineEmail} onCheckedChange={setSendDeclineEmail} className="mt-0.5" />
              <span className="text-sm text-slate-600">
                <span className="font-medium text-slate-700">Send polite decline email</span>
                <span className="block text-xs text-slate-400">Default is a silent decline so you don't email someone you've already decided against.</span>
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() => onConfirm(actionKey === "decline" ? { send_email: sendDeclineEmail } : {})}
            style={{ background: def.primaryColor, color: "#fff" }}
            className="hover:opacity-90"
          >
            {def.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}