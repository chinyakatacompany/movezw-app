import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Bell, LogOut, MessageCircle, Building2 } from "lucide-react";

export default function BusinessLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    base44.entities.Notification.filter({ user_id: user.id, is_read: false }, "-created_date", 1)
      .then((r) => active && setUnread(r.length))
      .catch(() => {});
    return () => { active = false; };
  }, [user?.id, location.pathname]);

  const handleLogout = () => { logout(false); navigate("/login"); };

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/business" className="flex items-center gap-2" aria-label="MoveZW Business">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="leading-none">
              <span className="font-bold text-base tracking-tight text-foreground">MoveZW</span>
              <span className="ml-1.5 text-[10px] font-bold text-accent">BUSINESS</span>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/messages" aria-label="Messages" className="relative w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
              <MessageCircle className="w-5 h-5 text-foreground" />
            </Link>
            <Link to="/business" aria-label="Notifications" className="relative w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
              <Bell className="w-5 h-5 text-foreground" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <button onClick={handleLogout} aria-label="Sign out" className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
              <LogOut className="w-5 h-5 text-foreground" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 max-w-6xl mx-auto w-full pb-10"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
