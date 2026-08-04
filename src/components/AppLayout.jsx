import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { Home, Plus, Truck, Bell, User as UserIcon, LogOut, MessageCircle, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

const customerNav = [
  { to: "/customer", label: "Home", icon: Home },
  { to: "/customer/new", label: "Request", icon: Plus },
  { to: "/customer/profile", label: "Me", icon: UserIcon },
];

const driverNav = [
  { to: "/driver", label: "Jobs", icon: Home },
  { to: "/return-loads", label: "Loads", icon: Repeat },
  { to: "/driver/history", label: "Trips", icon: Truck },
  { to: "/driver/profile", label: "Me", icon: UserIcon },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [activeJobCount, setActiveJobCount] = useState(0);

  const isDriver = user?.role === "driver";
  const nav = isDriver ? driverNav : customerNav;

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .then(({ count, error }) => {
        if (error) console.error("Failed to load unread count:", error);
        if (active) setUnread(count || 0);
      });
    return () => { active = false; };
  }, [user?.id, location.pathname]);

  useEffect(() => {
    if (!user?.id || !isDriver) return;
    let active = true;
    supabase
      .from("transport_requests")
      .select("id", { count: "exact", head: true })
      .eq("accepted_driver_id", user.id)
      .in("status", ["confirmed", "en_route_pickup", "collected", "in_transit", "delivered"])
      .then(({ count, error }) => {
        if (error) console.error("Failed to load active job count:", error);
        if (active) setActiveJobCount(count || 0);
      });
    return () => { active = false; };
  }, [user?.id, isDriver, location.pathname]);

  const handleLogout = () => {
    logout(false);
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <header className="sticky top-0 z-30 bg-header text-header-foreground">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to={isDriver ? "/driver" : "/customer"} className="flex items-center gap-2" aria-label="MoveZW home">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <Truck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight text-header-foreground">MoveZW</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/messages"
              aria-label="Messages"
              className="relative w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <MessageCircle className="w-5 h-5 text-header-foreground" />
            </Link>
            <Link
              to={isDriver ? "/driver/notifications" : "/customer/notifications"}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <Bell className="w-5 h-5 text-header-foreground" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
            >
              <LogOut className="w-5 h-5 text-header-foreground" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 max-w-2xl mx-auto w-full pb-20"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t border-border safe-bottom">
        <div className="max-w-2xl mx-auto px-2 h-16 grid grid-flow-col auto-cols-fr">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = to === location.pathname || (to !== `/${user.role}` && location.pathname.startsWith(to));
            if (to === "/customer/new") {
              return (
                <Link key={to} to={to} aria-label={label} aria-current={active ? "page" : undefined} className="flex items-center justify-center">
                  <span className="w-12 h-12 -mt-7 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center border-4 border-background">
                    <Icon className="w-5 h-5" />
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors relative",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                {active && <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-accent" />}
                <span className="relative">
                  <Icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
                  {isDriver && to === "/driver" && activeJobCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">
                      {activeJobCount > 9 ? "9+" : activeJobCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
