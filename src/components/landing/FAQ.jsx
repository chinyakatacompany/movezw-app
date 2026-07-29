import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "How do I book transport on MoveZW?",
    a: "Create a free account, tap 'Book Transport', enter your pickup, destination, cargo details and budget, then post your request. Verified drivers will send you offers to compare.",
  },
  {
    q: "Are the drivers verified?",
    a: "Yes. Every driver submits their National ID, driver's licence and vehicle registration, which our admin team reviews before approval. Only approved drivers can send offers.",
  },
  {
    q: "How do I pay for my delivery?",
    a: "MoveZW currently supports cash on delivery. Additional secure payment options are coming soon.",
  },
  {
    q: "Can I track my delivery?",
    a: "Absolutely. Once you accept an offer, you can follow the status of your delivery in real time — from pickup, through transit, to final delivery.",
  },
  {
    q: "How do I become a driver?",
    a: "Sign up as a driver, complete your profile, and upload your documents. After admin verification you'll start receiving transport requests in your area.",
  },
  {
    q: "Is there a fee to use MoveZW?",
    a: "Creating an account and posting transport requests is free. You only pay the agreed delivery price to your chosen driver.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="py-16 sm:py-24 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="text-primary text-sm font-semibold uppercase tracking-wide">FAQ</span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-muted-foreground">Everything you need to know about moving with MoveZW.</p>
        </div>

        <div className="space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-foreground text-sm sm:text-base">{item.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
