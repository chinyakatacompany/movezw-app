import React from "react";
import { ShieldCheck, BadgeCheck, Clock, Wallet, Headphones, MapPin } from "lucide-react";

const REASONS = [
  {
    icon: ShieldCheck,
    title: "Verified drivers only",
    desc: "Every driver is ID-checked and their vehicle documents are reviewed before they can accept jobs.",
  },
  {
    icon: Wallet,
    title: "Fair, transparent pricing",
    desc: "Compare multiple offers and pick the price that works for you. No hidden fees, ever.",
  },
  {
    icon: Clock,
    title: "Fast & flexible",
    desc: "Need it now or schedule ahead. Get matched with available drivers within minutes.",
  },
  {
    icon: BadgeCheck,
    title: "Rated by real customers",
    desc: "Driver ratings and completed-jobs history help you choose with confidence.",
  },
  {
    icon: MapPin,
    title: "Nationwide coverage",
    desc: "From Harare to Bulawayo and beyond — move goods anywhere across Zimbabwe.",
  },
  {
    icon: Headphones,
    title: "Support you can count on",
    desc: "Our team is here to help if anything goes wrong with your delivery.",
  },
];

export default function WhyTrustUs() {
  return (
    <section id="why" className="py-16 sm:py-24 bg-blue-50/60 border-y border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary text-sm font-semibold uppercase tracking-wide">Why MoveZW</span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
            A marketplace built on trust
          </h2>
          <p className="mt-3 text-muted-foreground">
            We make it safe and simple to move anything, anywhere — for customers and drivers alike.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {REASONS.map((r) => (
            <div
              key={r.title}
              className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <r.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground mb-1.5">{r.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
