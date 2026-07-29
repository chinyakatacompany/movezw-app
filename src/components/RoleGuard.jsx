import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
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
        base44.entities.DriverProfile.filter({ user_id: user.id }, "-created_date", 1)
          .then((r) => active && setHasProfile(r[0] || null))
          .catch(() => active && setHasProfile(null))
      );
    }
    if (allow.includes("business")) {
      tasks.push(
        base44.entities.Business.filter({ owner_id: user.id }, "-created_date", 1)
          .then((r) => active && setHasBusiness(r[0] || null))
          .catch(() => active && setHasBusiness(null))
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

  const isDriver =
    allow.includes("driver") &&
    (user.role === "driver" || hasProfile || sessionStorage.getItem("movzw_signup_role") === "driver");
  if (allow.includes("driver") && isDriver) return children;

  const isBusiness =
    allow.includes("business") &&
    (hasBusiness || sessionStorage.getItem("movzw_signup_role") === "business");
  if (allow.includes("business") && isBusiness) return children;

  // Customer access
  if (allow.includes("customer") && !isDriver && !isBusiness && user.role !== "admin") return children;

  // Redirect to the right home
  const signupRole = sessionStorage.getItem("movzw_signup_role");
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (isBusiness || signupRole === "business") return <Navigate to="/business" replace />;
  if (isDriver) return <Navigate to="/driver" replace />;
  if (signupRole === "driver") return <Navigate to="/driver/onboarding" replace />;
  return <Navigate to="/customer" replace />;
}
