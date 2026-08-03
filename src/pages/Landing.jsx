import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import WhyTrustUs from "@/components/landing/WhyTrustUs";
import FAQ from "@/components/landing/FAQ";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <WhyTrustUs />
        <FAQ />
        <section className="py-16 sm:py-20 bg-primary text-primary-foreground">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              Ready to move anything, anywhere?
            </h2>
            <p className="mt-3 text-primary-foreground/80 max-w-xl mx-auto">
              Join MoveZW today and connect with trusted drivers across Zimbabwe in minutes.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register?role=customer">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto h-12 px-7 text-base">
                  Book Transport
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/register?role=driver">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 px-7 text-base bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Truck className="w-4 h-4" />
                  Become a Driver
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
