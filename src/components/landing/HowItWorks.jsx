import React from "react";
import { FileText, Inbox, Truck } from "lucide-react";

const STEPS = [
{
  icon: FileText,
  title: "Post your transport request",
  desc: "Tell us what you're moving, where it's going, and your budget. It takes less than two minutes."
},
{
  icon: Inbox,
  title: "Receive offers from verified drivers",
  desc: "Trusted, background-checked transporters send you competitive quotes for your job."
},
{
  icon: Truck,
  title: "Choose the best offer & track delivery",
  desc: "Pick the driver that suits you and follow your delivery in real time until it arrives."
}];


export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          
          <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-foreground mt-2">
            Get your goods moving in 3 easy steps
          </h2>
          <p className="mt-3 text-muted-foreground">
            From posting a request to safe delivery — MoveZW keeps it simple and transparent.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 relative">
          {STEPS.map((s, i) =>
          <div key={s.title} className="relative">
              <div className="h-full bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <s.icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-4xl font-bold text-primary/15">0{i + 1}</span>
                </div>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
              {i < STEPS.length - 1 &&
            <div className="hidden md:block absolute top-1/2 -right-4 lg:-right-5 w-8 lg:w-10 h-px border-t-2 border-dashed border-primary/30" />
            }
            </div>
          )}
        </div>
      </div>
    </section>);

}
