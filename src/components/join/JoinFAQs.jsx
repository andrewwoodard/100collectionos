import React from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { FAQS } from "./faqs";

// Common questions, accordion-style. Only one open at a time; all closed by
// default. Defaults to the property_manager set when no segment is selected.
export default function JoinFAQs({ segment }) {
  const key = segment || "property_manager";
  const faqs = FAQS[key] || FAQS.property_manager || [];
  if (faqs.length === 0) return null;

  return (
    <section className="bg-[#FAFAF8] py-20 border-t border-[#E8DDD0]">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <h2 className="font-serif text-3xl sm:text-4xl text-[#0D1B2A]">Common questions</h2>
        </div>
        <Accordion type="single" collapsible className="bg-white border border-[#E8DDD0] rounded-2xl px-6">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-[#E8DDD0]">
              <AccordionTrigger className="font-serif text-lg text-[#0D1B2A] hover:no-underline text-left">
                {f.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-[#8B7355] leading-relaxed">
                {f.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}