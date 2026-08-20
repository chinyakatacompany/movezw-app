import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import LoadingScreen from "@/components/LoadingScreen";

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
        const [{ data: profiles, error: profileErr }, { data: businesses, error: businessErr }] = await Promise.all([
          supabase.from("driver_profiles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
          supabase.from("businesses").select("*").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(1),
        ]);
        if (profileErr) console.error("Failed to load driver profile:", profileErr);
        if (businessErr) console.error("Failed to load business account:", businessErr);
        if (!active) return;
        setProfile(profiles?.[0] || null);
        setBusiness(businesses?.[0] || null);
      } catch (_) {}
      if (active) setChecking(false);
    }
    if (authChecked) check();
    return () => { active = false; };
  }, [user?.id, authChecked]);

  if (!authChecked || checking) {
    return <LoadingScreen />;
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "admin") return <Navigate to="/admin" replace />;

  // Only trust the hint if it's tagged for this exact account — see
  // RoleGuard.jsx for why (sessionStorage isn't cleared on logout).
  const signupRole = sessionStorage.getItem("movzw_signup_user_id") === user.id
    ? sessionStorage.getItem("movzw_signup_role")
    : null;

  if (business) return <Navigate to="/business" replace />;
  if (signupRole === "business") return <Navigate to="/business/onboarding" replace />;

  if (profile) return <Navigate to="/driver" replace />;
  if (user.role === "driver" || signupRole === "driver") return <Navigate to="/driver/onboarding" replace />;

  return <Navigate to="/customer" replace />;
}
