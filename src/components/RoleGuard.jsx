import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { useEffect, useState } from "react";

// Guards a route so only the given role(s) may access it.
// For drivers, also checks whether a DriverProfile exists (or onboarding is pending).
// For businesses, checks whether a Business account exists for the user.
export default function RoleGuard({ allow, children }) {
  const { user, authChecked } = useAuth();
  const [hasProfile, setHasProfile] = useState(null);
  const [hasBusiness, setHasBusiness] = useState(null);
  const [checking, setChecking] = useState(allow.includes("driver") || allow.includes("business"));

  useEffect(() => {
    if (!user?.id || !authChecked) {
      if (allow.includes("driver") || allow.includes("business")) setChecking(false);
      return;
    }
    let active = true;
    const tasks = [];
    if (allow.includes("driver")) {
      tasks.push(
        supabase
          .from("driver_profiles")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .then(({ data, error }) => {
            if (error) console.error("Failed to load driver profile:", error);
            if (active) setHasProfile(data?.[0] || null);
          })
      );
    }
    if (allow.includes("business")) {
      tasks.push(
        supabase
          .from("businesses")
          .select("*")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .then(({ data, error }) => {
            if (error) console.error("Failed to load business account:", error);
            if (active) setHasBusiness(data?.[0] || null);
          })
      );
    }
    Promise.all(tasks).finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [user?.id, authChecked, allow]);

  if (!authChecked || checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Admin access
  if (allow.includes("admin") && user.role === "admin") return children;

  // Only trust the sessionStorage hint if it's tagged for this exact
  // account — sessionStorage isn't cleared on logout, so an untagged (or
  // differently-tagged) leftover from a different signup earlier in this
  // browser tab must never be read as belonging to whoever's logged in now.
  const signupRole = sessionStorage.getItem("movzw_signup_user_id") === user.id
    ? sessionStorage.getItem("movzw_signup_role")
    : null;

  const isDriver = allow.includes("driver") && (user.role === "driver" || hasProfile || signupRole === "driver");
  if (allow.includes("driver") && isDriver) return children;

  const isBusiness = allow.includes("business") && (hasBusiness || signupRole === "business");
  if (allow.includes("business") && isBusiness) return children;

  // Customer access
  if (allow.includes("customer") && !isDriver && !isBusiness && user.role !== "admin") return children;

  // Redirect to the right home
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (isBusiness || signupRole === "business") return <Navigate to="/business" replace />;
  if (isDriver) return <Navigate to="/driver" replace />;
  if (signupRole === "driver") return <Navigate to="/driver/onboarding" replace />;
  return <Navigate to="/customer" replace />;
}
