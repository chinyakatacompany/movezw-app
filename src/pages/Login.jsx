import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, User, Phone, ShoppingBag, Truck, Check } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { cn, getErrorMessage } from "@/lib/utils";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

export default function Login() {
  useDocumentMeta("Log In | MoveZW", "Log in to your MoveZW account to book transport or manage your driver profile.");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [accountType, setAccountType] = useState(searchParams.get("role") === "driver" ? "driver" : "customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDriverSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(getErrorMessage(error));
      setLoading(false);
    } else {
      // A client-side navigate here (not a hard window.location.href reload)
      // — AuthContext's onAuthStateChange listener already picks up the new
      // session reactively, so a full reload just adds a flash of the old
      // page as the browser tears down and repaints from scratch.
      navigate("/");
    }
  };

  // Customers never set a password (see Register.jsx's anonymous signup), so
  // there's no credential to check here — the edge function looks their
  // profile up by name+phone server-side (RLS blocks that from the client)
  // and hands back a one-time credential for the same account, which is
  // then exchanged for a real session below. Works from any device, not
  // just the one they signed up on.
  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: fnError } = await supabase.functions.invoke("customer-relogin", {
      body: { full_name: fullName, phone },
    });
    if (fnError || data?.error) {
      setError(data?.error || getErrorMessage(fnError));
      setLoading(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
    if (signInError) {
      setError(getErrorMessage(signInError));
      setLoading(false);
    } else {
      // A client-side navigate here (not a hard window.location.href reload)
      // — AuthContext's onAuthStateChange listener already picks up the new
      // session reactively, so a full reload just adds a flash of the old
      // page as the browser tears down and repaints from scratch.
      navigate("/");
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      showInstall
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <div className="mb-5">
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setAccountType("customer")}
            className={cn("relative rounded-xl border-2 p-3 text-left transition-all",
              accountType === "customer" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
            <ShoppingBag className={cn("w-5 h-5 mb-1.5", accountType === "customer" ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-semibold">Customer</p>
            {accountType === "customer" && <Check className="w-4 h-4 text-primary absolute top-2 right-2" />}
          </button>
          <button type="button" onClick={() => setAccountType("driver")}
            className={cn("relative rounded-xl border-2 p-3 text-left transition-all",
              accountType === "driver" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
            <Truck className={cn("w-5 h-5 mb-1.5", accountType === "driver" ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-semibold">Driver</p>
            {accountType === "driver" && <Check className="w-4 h-4 text-primary absolute top-2 right-2" />}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {accountType === "customer" ? (
        <form onSubmit={handleCustomerSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="name"
                autoComplete="name"
                autoFocus
                placeholder="Tendai Moyo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="0772 123 456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging in...
              </>
            ) : (
              "Log in"
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleDriverSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging in...
              </>
            ) : (
              "Log in"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}