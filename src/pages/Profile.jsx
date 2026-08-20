import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { LogOut, User as UserIcon, Mail, Phone, Shield, ChevronRight, Receipt, LifeBuoy, Car, FileText, Wallet as WalletIcon, History, Repeat, Pencil, Check, Loader2, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { THEMES, setUserThemeOverride } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default function Profile({ role }) {
  const { user, logout, checkUserAuth } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  // Reflects whichever theme is actually live right now (a personal
  // override, an admin site-wide change, or a dev ?previewTheme= — see
  // ThemeLoader.jsx) rather than assuming light, so the toggle opens on the
  // correct selection even before the user has ever touched it themselves.
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    return bg === THEMES.movezwDark.vars.background;
  });

  const chooseTheme = (dark) => {
    setUserThemeOverride(dark ? "movezwDark" : "movezw");
    setIsDark(dark);
  };

  const startEditPhone = () => {
    setPhoneInput(user?.phone || profile?.phone || "");
    setEditingPhone(true);
  };

  const savePhone = async () => {
    if (!phoneInput.trim()) return;
    setSavingPhone(true);
    try {
      const { error } = await supabase.from("profiles").update({ phone: phoneInput.trim() }).eq("id", user.id);
      if (error) throw error;
      await checkUserAuth();
      setEditingPhone(false);
      toast({ title: "Phone number updated" });
    } catch (e) {
      toast({ title: "Could not update phone", description: e.message, variant: "destructive" });
    } finally {
      setSavingPhone(false);
    }
  };

  useEffect(() => {
    if (role === "driver" && user?.id) {
      supabase
        .from("driver_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .then(({ data, error }) => {
          if (error) console.error("Failed to load driver profile:", error);
          setProfile(data?.[0] || null);
        });
    }
  }, [role, user?.id]);

  const handleLogout = () => { logout(false); navigate("/login"); };

  const status = profile?.verification_status || "pending";
  const statusMap = {
    pending: { label: "Pending verification", color: "text-amber-600 bg-amber-50 border-amber-200" },
    approved: { label: "Verified driver", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    rejected: { label: "Verification rejected", color: "text-red-600 bg-red-50 border-red-200" },
  };

  return (
    <div className="p-4 space-y-5">
      <div className="pt-2 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-3 overflow-hidden">
          {profile?.profile_picture_url ? (
            <img src={profile.profile_picture_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-9 h-9 text-primary" />
          )}
        </div>
        <h1 className="text-xl font-bold">{user?.full_name || "Your account"}</h1>
        <p className="text-sm text-muted-foreground capitalize">{role}</p>
        {role === "driver" && (
          <span className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${statusMap[status].color}`}>
            <Shield className="w-3.5 h-3.5" /> {statusMap[status].label}
          </span>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border divide-y divide-border">
        {user?.email && (
          <div className="flex items-center gap-3 p-4">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm font-medium">{user.email}</p></div>
          </div>
        )}
        <div className="flex items-center gap-3 p-4">
          <Phone className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Phone</p>
            {editingPhone ? (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="h-9 text-sm"
                  autoFocus
                />
                <button type="button" onClick={savePhone} disabled={savingPhone} className="shrink-0 text-primary p-1">
                  {savingPhone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium">{user?.phone || profile?.phone || "—"}</p>
            )}
          </div>
          {!editingPhone && (
            <button type="button" onClick={startEditPhone} className="shrink-0 text-xs font-medium text-primary flex items-center gap-1">
              {user?.phone || profile?.phone ? <Pencil className="w-3.5 h-3.5" /> : "Add"}
            </button>
          )}
        </div>
        {role === "driver" && profile && (
          <div className="flex items-center gap-3 p-4">
            <div className="w-5 h-5 text-center text-sm">{profile.vehicle_type && "🚚"}</div>
            <div>
              <p className="text-xs text-muted-foreground">Vehicle</p>
              <p className="text-sm font-medium">{[profile.vehicle_name, profile.vehicle_type].filter(Boolean).join(" · ")}</p>
              {profile.license_plate && <p className="text-xs text-muted-foreground mt-0.5">Plate: {profile.license_plate}</p>}
            </div>
          </div>
        )}
        {role === "driver" && profile && (
          <div className="flex items-center gap-3 p-4">
            <div className="w-5 h-5" />
            <div><p className="text-xs text-muted-foreground">Rating</p><p className="text-sm font-medium">{profile.rating_avg?.toFixed(1) || "0.0"} ⭐ ({profile.rating_count || 0} review{(profile.rating_count || 0) === 1 ? "" : "s"})</p></div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs text-muted-foreground mb-3">Appearance</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => chooseTheme(false)}
            className={cn(
              "flex items-center justify-center gap-2 h-11 rounded-xl border-2 text-sm font-medium transition-colors",
              !isDark ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <Sun className="w-4 h-4" /> Light
          </button>
          <button
            type="button"
            onClick={() => chooseTheme(true)}
            className={cn(
              "flex items-center justify-center gap-2 h-11 rounded-xl border-2 text-sm font-medium transition-colors",
              isDark ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            <Moon className="w-4 h-4" /> Dark
          </button>
        </div>
      </div>

      {role === "driver" && (
        <button onClick={() => navigate("/vehicle-management")} className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
          <Car className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium flex-1 text-left">Manage vehicle</span>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      <button onClick={() => navigate(role === "driver" ? "/driver/history" : "/customer/history")} className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
        <History className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Trip history</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      {role === "driver" && (
        <button onClick={() => navigate("/return-loads/manage")} className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
          <Repeat className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium flex-1 text-left">My return loads</span>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      <button onClick={() => navigate("/wallet")} className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
        <WalletIcon className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Wallet & payouts</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      <button onClick={() => navigate("/payment-history")} className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
        <Receipt className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Payment history</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      <button onClick={() => navigate("/support")} className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
        <LifeBuoy className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Support center</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      <Link to="/terms" className="w-full flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
        <FileText className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Terms of service</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </Link>

      <Button onClick={handleLogout} variant="outline" className="w-full h-12 text-destructive border-destructive/30 hover:bg-destructive/5">
        <LogOut className="w-5 h-5 mr-2" /> Sign out
      </Button>
    </div>
  );
}
