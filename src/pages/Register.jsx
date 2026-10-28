import PlayStoreLink from "@/components/PlayStoreLink";
import { useReferralSettings } from "@/hooks/useReferralSettings";
import { normalizeReferralCode } from "@/lib/referrals";
import EmailConfirmationHelp from "@/components/EmailConfirmationHelp";
import React, { useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, Truck, ShoppingBag, Check, Building2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { cn, getErrorMessage } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { DRIVER_CONFIRMATION_REDIRECT_URL } from "@/lib/authRedirects";

export default function Register() {
  useDocumentMeta("Sign Up | MoveZW", "Create a free MoveZW account to book verified transport or start earning as a driver in Zimbabwe.");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Landing page CTAs link here with ?role=driver or ?role=customer so
  // "Become a Driver" / "Book Transport" land pre-selected instead of
  // requiring a second click.
  const roleParam = searchParams.get("role");
  const [accountType, setAccountType] = useState((roleParam === "driver" || searchParams.has("ref")) ? "driver" : "customer");
  const [referralCode, setReferralCode] = useState(normalizeReferralCode(searchParams.get("ref")));
  const referralsEnabled = useReferralSettings();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Driven off history state (set via the replace-then-push below) rather
  // than plain local state, so the back button from this screen lands on
  // /login instead of wherever the person was before /register.
  const done = location.state?.justRegistered === true;
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service to create an account");
      return;
    }

    if (accountType === "driver") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
    }

    // Caps each phone number at one customer account and one driver
    // account — someone can legitimately have both (they use the app both
    // ways), but not two of the same. Checked server-side (fn_phone_has_account)
    // since profiles RLS blocks looking up anyone else's row from the client.
    setLoading(true);
    if (accountType === "driver" && referralCode && referralsEnabled !== false) {
      const { data: valid, error: referralError } = await supabase.rpc("valid_driver_referral_code", { p_code: normalizeReferralCode(referralCode) });
      if (referralError || !valid) {
        setLoading(false);
        setError(referralError ? "Could not check the referral code. Retry, or remove it to register without a referral." : "This referral code is invalid or referrals are paused. Check the code or remove it to continue.");
        return;
      }
    }
    const { data: hasAccount, error: checkErr } = await supabase.rpc("fn_phone_has_account", {
      p_phone: phone,
      p_role: accountType,
    });
    if (checkErr) {
      setLoading(false);
      setError(getErrorMessage(checkErr));
      return;
    }
    if (hasAccount) {
      setLoading(false);
      setError(`This phone number is already registered as a ${accountType} account.`);
      return;
    }

    // Customers get a frictionless, no-email/no-password signup — a real
    // Supabase auth session via signInAnonymously(), just tagged with their
    // name/phone/role like a normal signup. Temporary while the customer
    // base is still small; trades away password-based account recovery
    // (clearing the browser or switching devices loses this account) for
    // zero signup friction. Drivers keep full email/password + confirmation
    // below, unchanged — they're handling cargo and need to be reachable.
    if (accountType === "customer") {
      const { data, error } = await supabase.auth.signInAnonymously({
        options: { data: { full_name: fullName, phone, role: "customer" } },
      });
      setLoading(false);
      if (error) {
        setError(getErrorMessage(error));
        return;
      }
      sessionStorage.setItem("movzw_signup_role", "customer");
      sessionStorage.setItem("movzw_signup_user_id", data.user.id);
      sessionStorage.setItem("movzw_signup_phone", phone);
      sessionStorage.setItem("movzw_signup_terms_accepted", "1");
      toast({ title: `Welcome, ${fullName.split(" ")[0]}!`, description: "Your account is ready." });
      navigate("/");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // role and phone travel in the auth user's metadata (not just
      // sessionStorage) so handle_new_user() can set them correctly on the
      // profiles row from the start — sessionStorage alone doesn't survive
      // email confirmation reliably, since that link is often opened in a
      // different tab/app.
      options: {
        data: { full_name: fullName, phone, role: "driver", ...(referralCode && referralsEnabled !== false ? { driver_referral_code: normalizeReferralCode(referralCode) } : {}) },
        // Hardcoded, not window.location.origin — inside the native
        // Android app that's https://localhost (Capacitor's WebView
        // origin), not the real site, which would send a confirmation
        // link nobody could open.
        // The role query opens the Driver tab, while `confirmed=1` lets the
        // login screen explain that the email was successfully verified.
        // Native Android app links preserve both query parameters.
        emailRedirectTo: DRIVER_CONFIRMATION_REDIRECT_URL,
      },
    });
    setLoading(false);
    if (error) {
      setError(getErrorMessage(error));
      return;
    }
    // A successful signup must contain a real Auth user. Supabase may return
    // an intentionally non-specific response for an address that is already
    // registered; an empty identities list distinguishes that response from
    // a newly created account without exposing any account details.
    if (!data?.user?.id) {
      setError("We could not create your driver account. Please try again.");
      return;
    }
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setError("This email may already be registered. Try logging in or resetting your password.");
      return;
    }
    // Tagged with the exact account it belongs to so a stale flag from an
    // earlier signup in this same browser tab can never be misread as
    // belonging to a different account that logs in later — see AuthContext.jsx.
    sessionStorage.setItem("movzw_signup_role", "driver");
    sessionStorage.setItem("movzw_signup_user_id", data.user.id);
    sessionStorage.setItem("movzw_signup_phone", phone);
    sessionStorage.setItem("movzw_signup_terms_accepted", "1");

    // Supabase only asks for email confirmation when that's actually turned
    // on ("Confirm email" in Auth settings) — when it's off, signUp() logs
    // the person straight in (data.session is set) and there's nothing to
    // check their email for, so showing "check your email" here would be
    // straight-up wrong, not just premature.
    if (data.session) {
      toast({ title: `Welcome, ${fullName.split(" ")[0]}!`, description: "Your account is ready." });
      navigate("/");
      return;
    }
    // Swaps this history entry for /login, then lands back on /register
    // (now showing the "check your email" screen via location.state) — so
    // pressing back from here goes straight to /login, the actual next
    // step, rather than back to the empty form or wherever they started.
    navigate("/login", { replace: true });
    navigate("/register", { state: { justRegistered: true } });
  };

  if (done) {
    return (
      <AuthLayout icon={Mail} title="Check your email" subtitle={`We sent a confirmation link to ${email}`}>
        <div className="space-y-4">
          <EmailConfirmationHelp email={email} />
          <p className="text-sm text-muted-foreground text-center">
            Click the link in that email to activate your account, then come back and log in.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 font-medium"
            onClick={() => navigate("/login?role=driver")}
          >
            Back to driver login
          </Button>
        </div>
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

      {accountType === "driver" && searchParams.has("ref") && <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 mb-5"><h2 className="font-bold">You’re invited to drive with MoveZW</h2><p className="text-sm text-muted-foreground mt-2">Register here, or download the Android app below. After installing, return to this link or enter referral code <strong className="text-foreground select-all">{normalizeReferralCode(searchParams.get("ref"))}</strong> before signing up.</p><PlayStoreLink className="bg-primary text-primary-foreground rounded-xl px-4 py-3 mt-3 text-sm font-semibold">Download MoveZW for Android</PlayStoreLink></div>}
      {accountType === "driver" && referralsEnabled === false && <p role="status" className="text-sm bg-amber-50 text-amber-900 border border-amber-200 rounded-xl p-3 mb-4">Referrals are paused. You can still register, but no referral reward will be issued for this signup.</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" placeholder="Tendai Moyo" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-12" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" type="tel" placeholder="0772 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" required />
        </div>
        {accountType === "driver" && (
          <>
            <div className="space-y-2"><label htmlFor="referral-code" className="text-sm font-medium">Driver referral code (optional)</label><input id="referral-code" value={referralCode} onChange={(event) => setReferralCode(normalizeReferralCode(event.target.value))} maxLength={15} placeholder="MZW…" disabled={referralsEnabled === false} className="w-full border border-input bg-background rounded-md px-3 h-12 uppercase disabled:opacity-50" /><p className="text-xs text-muted-foreground">The driver who invited you earns $0.50 commission credit after your email, documents and admin verification are complete. Add the code before creating your account.</p></div>
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
          </>
        )}
        <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border accent-primary shrink-0"
          />
          <span className="text-muted-foreground">
            I agree to MoveZW's{" "}
            <Link to="/terms" target="_blank" className="text-primary font-medium hover:underline">
              Terms of Service
            </Link>
          </span>
        </label>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || !agreedToTerms}>
          {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>) : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
