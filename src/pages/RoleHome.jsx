import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";

export default function RoleHome() {
  const { user, authChecked } = useAuth();
  const [profile, setProfile] = useState(null);
  const [business, setBusiness] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!user?.id) { setChecking(false); return; }
      if (user.role === "admin") { setChecking(false); return; }
      try {
        const [profiles, businesses] = await Promise.all([
          base44.entities.DriverProfile.filter({ user_id: user.id }, "-created_date", 1).catch(() => []),
          base44.entities.Business.filter({ owner_id: user.id }, "-created_date", 1).catch(() => []),
        ]);
        if (!active) return;
        setProfile(profiles[0] || null);
        setBusiness(businesses[0] || null);
      } catch (_) {}
      if (active) setChecking(false);
    }
    if (authChecked) check();
    return () => { active = false; };
  }, [user?.id, authChecked]);

  if (!authChecked || checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "admin") return <Navigate to="/admin" replace />;

  const signupRole = sessionStorage.getItem("movzw_signup_role");

  if (business) return <Navigate to="/business" replace />;
  if (signupRole === "business") return <Navigate to="/business/onboarding" replace />;

  if (profile) return <Navigate to="/driver" replace />;
  if (signupRole === "driver") return <Navigate to="/driver/onboarding" replace />;

  return <Navigate to="/customer" replace />;
}
