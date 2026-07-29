import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { LogOut, User as UserIcon, Mail, Phone, Shield, ChevronRight, Receipt, LifeBuoy, Car, FileText, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Profile({ role }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (role === "driver" && user?.id) {
      base44.entities.DriverProfile.filter({ user_id: user.id }, "-created_date", 1)
        .then((r) => setProfile(r[0] || null))
        .catch(() => {});
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

      <div className="bg-white rounded-2xl border border-border divide-y divide-border">
        <div className="flex items-center gap-3 p-4">
          <Mail className="w-5 h-5 text-muted-foreground" />
          <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm font-medium">{user?.email}</p></div>
        </div>
        <div className="flex items-center gap-3 p-4">
          <Phone className="w-5 h-5 text-muted-foreground" />
          <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm font-medium">{user?.phone || profile?.phone || "—"}</p></div>
        </div>
        {role === "driver" && profile && (
          <div className="flex items-center gap-3 p-4">
            <div className="w-5 h-5 text-center text-sm">{profile.vehicle_type && "🚚"}</div>
            <div><p className="text-xs text-muted-foreground">Vehicle</p><p className="text-sm font-medium">{profile.vehicle_type}</p></div>
          </div>
        )}
        {role === "driver" && profile && (
          <div className="flex items-center gap-3 p-4">
            <div className="w-5 h-5" />
            <div><p className="text-xs text-muted-foreground">Rating</p><p className="text-sm font-medium">{profile.rating_avg?.toFixed(1) || "0.0"} ⭐ ({profile.rating_count || 0} reviews)</p></div>
          </div>
        )}
      </div>

      {role === "driver" && (
        <button onClick={() => navigate("/vehicle-management")} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-border p-4">
          <Car className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium flex-1 text-left">Manage vehicle</span>
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      )}

      <button onClick={() => navigate("/wallet")} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-border p-4">
        <WalletIcon className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Wallet & payouts</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      <button onClick={() => navigate("/payment-history")} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-border p-4">
        <Receipt className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Payment history</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      <button onClick={() => navigate("/support")} className="w-full flex items-center gap-3 bg-white rounded-2xl border border-border p-4">
        <LifeBuoy className="w-5 h-5 text-primary" />
        <span className="text-sm font-medium flex-1 text-left">Support center</span>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      <Link to="/terms" className="w-full flex items-center gap-3 bg-white rounded-2xl border border-border p-4">
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
