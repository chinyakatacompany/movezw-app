import React from "react";
import { Link } from "react-router-dom";
import { Truck, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Linkedin } from "lucide-react";

const SOCIALS = [
{ icon: Facebook, href: "#", label: "Facebook" },
{ icon: Twitter, href: "#", label: "Twitter" },
{ icon: Instagram, href: "#", label: "Instagram" },
{ icon: Linkedin, href: "#", label: "LinkedIn" }];


export default function LandingFooter() {
  return (
    <footer className="bg-foreground text-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/landing" className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                <Truck className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl tracking-tight text-background">MoveZW</span>
            </Link>
            <p className="text-sm max-w-sm leading-relaxed text-[hsl(var(--background))]">Zimbabwe's trusted transport marketplace. Connecting customers with verified drivers to move anything, anywhere.


            </p>
            <div className="flex items-center gap-3 mt-5">
              {SOCIALS.map((s) =>
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="w-9 h-9 rounded-lg bg-background/10 hover:bg-primary flex items-center justify-center transition-colors">
                
                  <s.icon className="w-4 h-4 text-background" />
                </a>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-background mb-4 text-sm">Contact</h4>
            <ul className="space-y-3 text-sm text-background/70">
              <li className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <span>movezwsupport@gmail.com</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <span>0780 269 976</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <span>Harare, Zimbabwe</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-background mb-4 text-sm">Quick links</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#how-it-works" className="text-background/70 hover:text-background">How it works</a></li>
              <li><a href="#why" className="text-background/70 hover:text-background">Why MoveZW</a></li>
              <li><a href="#faq" className="text-background/70 hover:text-background">FAQ</a></li>
              <li><Link to="/login" className="text-background/70 hover:text-background">Log in</Link></li>
              <li><Link to="/register" className="text-background/70 hover:text-background">Sign up</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-background/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-background/60">
          <p>© {new Date().getFullYear()} MoveZW. All rights reserved.</p>
          <p>Trusted transport, built for Zimbabwe.</p>
        </div>
      </div>
    </footer>);

}
