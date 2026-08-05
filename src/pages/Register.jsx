import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, Truck, ShoppingBag, Check, Building2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { cn } from "@/lib/utils";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Landing page CTAs link here with ?role=driver or ?role=customer so
  // "Become a Driver" / "Book Transport" land pre-selected instead of
  // requiring a second click.
  const roleParam = searchParams.get("role");
  const [accountType, setAccountType] = useState(roleParam === "driver" ? "driver" : "customer");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // role and phone travel in the auth user's metadata (not just
      // sessionStorage) so handle_new_user() can set them correctly on the
      // profiles row from the start — sessionStorage alone doesn't survive
      // email confirmation reliably, since that link is often opened in a
      // different tab/app.
      options: { data: { full_name: fullName, phone, role: accountType === "driver" ? "driver" : "customer" } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Tagged with the exact account it belongs to so a stale flag from an
    // earlier signup in this same browser tab can never be misread as
    // belonging to a different account that logs in later — see AuthContext.jsx.
    sessionStorage.setItem("movzw_signup_role", accountType);
    sessionStorage.setItem("movzw_signup_user_id", data.user.id);
    sessionStorage.setItem("movzw_signup_phone", phone);
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout icon={Mail} title="Check your email" subtitle={`We sent a confirmation link to ${email}`}>
        <p className="text-sm text-muted-foreground text-center">
          Click the link in that email to activate your account, then come back and log in.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Join MoveZW to move goods across Zimbabwe"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
        </>
      }
    >
      <div className="mb-5">
        <Label className="mb-2 block">I want to</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button type="button" onClick={() => setAccountType("customer")}
            className={cn("relative rounded-xl border-2 p-3 text-left transition-all",
              accountType === "customer" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
            <ShoppingBag className={cn("w-5 h-5 mb-1.5", accountType === "customer" ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-semibold">Send goods</p>
            <p className="text-[11px] text-muted-foreground">I need transport</p>
            {accountType === "customer" && <Check className="w-4 h-4 text-primary absolute top-2 right-2" />}
          </button>
          <button type="button" onClick={() => setAccountType("driver")}
            className={cn("relative rounded-xl border-2 p-3 text-left transition-all",
              accountType === "driver" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
            <Truck className={cn("w-5 h-5 mb-1.5", accountType === "driver" ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-semibold">Drive & earn</p>
            <p className="text-[11px] text-muted-foreground">I offer transport</p>
            {accountType === "driver" && <Check className="w-4 h-4 text-primary absolute top-2 right-2" />}
          </button>
          <button type="button" disabled title="Business accounts are coming soon"
            className="relative rounded-xl border-2 p-3 text-left transition-all border-border opacity-50 cursor-not-allowed">
            <Building2 className="w-5 h-5 mb-1.5 text-muted-foreground" />
            <p className="text-sm font-semibold">Business</p>
            <p className="text-[11px] text-muted-foreground">Coming soon</p>
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="Tendai Moyo" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" type="tel" placeholder="0772 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="password" type="password" autoComplete="new-password" placeholder="••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 h-12" required />
            </div>
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>) : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}