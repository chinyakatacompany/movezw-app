import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Truck, Star, ShieldCheck } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24 bg-gradient-to-b from-blue-50 via-background to-background">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-40 -left-24 w-80 h-80 rounded-full bg-blue-200/30 blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Zimbabwe's trusted transport marketplace
          </span>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
            Move Anything.{" "}
            <span className="text-primary">Anywhere in Zimbabwe.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 bg-[hsl(var(--destructive-foreground))]">Quickly find trusted, verified transport providers for your goods. Post a request in minutes, compare offers from local drivers, and track your delivery every step of the way.



          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <Link to="/register">
              <Button size="lg" className="w-full sm:w-auto h-12 px-7 text-base">
                Book Transport
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/register">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-7 text-base">
                <Truck className="w-4 h-4" />
                Become a Driver
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-5 justify-center lg:justify-start text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((n) =>
                <Star key={n} className="w-4 h-4 text-amber-400 fill-amber-400" />
                )}
              </div>
              Trusted by customers
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Verified drivers
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-border aspect-[4/3] bg-blue-100">
            <img
              src="https://i.pinimg.com/1200x/91/df/2d/91df2daeccdea36c1b9193caac81547a.jpg"
              alt="Pickup truck loaded and ready for a transport job"
              className="w-full h-full object-cover"
              loading="lazy" />
            
            <div className="absolute inset-0 bg-gradient-to-t from-primary/30 to-transparent" />
          </div>

          <div className="absolute -bottom-5 -left-3 sm:left-5 bg-white rounded-2xl shadow-xl border border-border p-4 flex items-center gap-3 max-w-[15rem]">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Truck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Live tracking</p>
              <p className="text-sm font-semibold text-foreground">In transit to Harare</p>
            </div>
          </div>
        </div>
      </div>
    </section>);

}
