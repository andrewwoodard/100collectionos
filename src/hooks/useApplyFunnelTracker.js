import { useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  getOrCreateSessionId,
  buildEvent,
  detectField,
  isValidEmail,
  isValidName,
  isValidCompany,
  beaconFlush,
} from "@/lib/applyFunnel";

// /apply funnel tracker. Mount once per apply page. Captures page_view on
// mount, field touches + value captures via event delegation on the form
// container (formRef), abandonment on tab hide/unload, and exposes
// trackPath / trackSubmit for the page to call.
//
// Events are batched in memory and flushed at most once every 2s, plus a
// final beacon flush on unload — so a single form interaction never hammers
// the backend.
//
// Props:
//   applicantType — 'property_manager' | 'homeowner' | 'existing_partner' | null
//   pagePath      — the /apply route this page tracks
//   formRef       — ref to the <form> element (optional; without it only
//                   page_view / path / submit are tracked)

const FLUSH_MS = 2000;

export default function useApplyFunnelTracker({ applicantType = null, pagePath, formRef = null }) {
  const queue = useRef([]);
  const touchedFields = useRef(new Set());
  const lastField = useRef(null);
  const captured = useRef({ email: null, full_name: null, company_name: null });
  const submittedRef = useRef(false);
  const flushTimer = useRef(null);

  const flush = useCallback(async ({ beacon = false } = {}) => {
    const events = queue.current;
    if (!events.length) return;
    queue.current = [];
    if (beacon) {
      beaconFlush(events);
      return;
    }
    try {
      await base44.functions.invoke("logFunnelEvent", { events });
    } catch (e) {
      // Re-queue on failure so we don't lose events; cap to avoid unbounded growth.
      queue.current = [...events, ...queue.current].slice(0, 50);
    }
  }, []);

  const enqueue = useCallback((evt) => {
    queue.current.push(evt);
  }, []);

  // Fire page_view on mount.
  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;
    enqueue(buildEvent({ session_id: sessionId, event_type: "page_view", applicant_type: applicantType, page_path: pagePath }));
    flush();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (!submittedRef.current) {
          const sessionId2 = getOrCreateSessionId();
          enqueue(buildEvent({
            session_id: sessionId2,
            event_type: "form_abandoned",
            applicant_type: applicantType,
            page_path: pagePath,
            event_data: { touched_fields: Array.from(touchedFields.current), last_field: lastField.current },
          }));
        }
        flush({ beacon: true });
      }
    };
    const onBeforeUnload = () => {
      if (!submittedRef.current) {
        const sessionId2 = getOrCreateSessionId();
        enqueue(buildEvent({
          session_id: sessionId2,
          event_type: "form_abandoned",
          applicant_type: applicantType,
          page_path: pagePath,
          event_data: { touched_fields: Array.from(touchedFields.current), last_field: lastField.current },
        }));
      }
      flush({ beacon: true });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    flushTimer.current = setInterval(() => flush(), FLUSH_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (flushTimer.current) clearInterval(flushTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagePath, applicantType]);

  // Event delegation for field touches + captures on the form container.
  useEffect(() => {
    const form = formRef?.current;
    if (!form) return;
    const sessionId = getOrCreateSessionId();

    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") return;
      const field = detectField(el);
      lastField.current = field;
      if (!touchedFields.current.has(field)) {
        touchedFields.current.add(field);
        enqueue(buildEvent({
          session_id: sessionId,
          event_type: "field_touched",
          applicant_type: applicantType,
          page_path: pagePath,
          event_data: { field_name: field },
        }));
      }
    };

    const onFocusOut = (e) => {
      const el = e.target;
      if (!el || el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return;
      const field = detectField(el);
      const value = (el.value || "").trim();
      if (!value) return;
      let capturedType = null;
      if (field === "email" && isValidEmail(value)) {
        captured.current.email = value;
        capturedType = "email_captured";
      } else if (field === "full_name" && isValidName(value)) {
        captured.current.full_name = value;
        capturedType = "name_captured";
      } else if (field === "company_name" && isValidCompany(value)) {
        captured.current.company_name = value;
        capturedType = "company_captured";
      }
      if (capturedType) {
        enqueue(buildEvent({
          session_id: sessionId,
          event_type: capturedType,
          applicant_type: applicantType,
          page_path: pagePath,
          event_data: { field, value },
        }));
      }
    };

    form.addEventListener("focusin", onFocusIn);
    form.addEventListener("focusout", onFocusOut);
    return () => {
      form.removeEventListener("focusin", onFocusIn);
      form.removeEventListener("focusout", onFocusOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagePath, applicantType, formRef]);

  // Exposed helpers for the page.
  const trackPath = useCallback((pathSlug) => {
    const sessionId = getOrCreateSessionId();
    enqueue(buildEvent({
      session_id: sessionId,
      event_type: "path_selected",
      applicant_type: applicantType,
      page_path: pagePath,
      event_data: { path_slug: pathSlug },
    }));
    flush();
  }, [applicantType, pagePath, enqueue, flush]);

  const trackSubmit = useCallback(() => {
    submittedRef.current = true;
    const sessionId = getOrCreateSessionId();
    enqueue(buildEvent({
      session_id: sessionId,
      event_type: "submitted",
      applicant_type: applicantType,
      page_path: pagePath,
      event_data: {
        email: captured.current.email,
        full_name: captured.current.full_name,
        company_name: captured.current.company_name,
      },
    }));
    flush();
  }, [applicantType, pagePath, enqueue, flush]);

  return { trackPath, trackSubmit };
}