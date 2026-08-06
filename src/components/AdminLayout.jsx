import React, { useState } from "react";
import { Outlet, useLocation, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { Truck, LayoutDashboard, Users, BadgeCheck, Package, BarChart3, TrendingUp, Wallet, Menu, X, LogOut, FileText, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ConfirmDialog from "@/components/shared/ConfirmDialog";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/analytics", label: "Analytics", icon: TrendingUp },
  { to: "/admin/verification", label: "Driver Verification", icon: BadgeCheck },
  { to: "/admin/users", label: "User Management", icon: Users },
  { to: "/admin/jobs", label: "Job Management", icon: Package },
  { to: "/admin/messages", label: "Messages", icon: MessageCircle },
  { to: "/admin/finance", label: "Finance", icon: Wallet },
  { to: "/admin/content", label: "Site Content", icon: FileText },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isActive = (item) =>
    item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);

  const doLogout = () => {
    logout(false);
    navigate("/login");
  };

  const NavList = ({ onNavigate }) => (
    <nav className="flex-1 p-4 space-y-1">
      {nav.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          aria-current={isActive({ to, exact: to === "/admin" }) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
            isActive({ to, exact: to === "/admin" })
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Icon className="w-5 h-5" />
          {label}
        </Link>
      ))}
    </nav>
  );

  const UserBlock = () => (
    <div className="px-3 py-2 mb-2">
      <p className="text-sm font-medium truncate">{user?.full_name || user?.email}</p>
      <p className="text-xs text-muted-foreground">Administrator</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/40 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
        <div className="h-16 px-6 flex items-center gap-2 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-xl bg-sidebar-primary flex items-center justify-center shadow-sm">
            <Truck className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">MoveZW</span>
        </div>
        <NavList />
        <div className="p-4 border-t border-sidebar-border">
          <UserBlock />
          <button
            onClick={() => setConfirmLogout(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <Truck className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">MoveZW</span>
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center">
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-72 bg-sidebar h-full flex flex-col"
            >
              <div className="h-14 px-4 flex items-center justify-between border-b border-sidebar-border">
                <span className="font-bold">Admin Menu</span>
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
              <div className="p-4 border-t border-sidebar-border">
                <UserBlock />
                <button
                  onClick={() => { setOpen(false); setConfirmLogout(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={doLogout}
        title="Sign out?"
        description="You will need to sign in again to access the admin console."
        confirmText="Sign out"
        destructive
      />
    </div>
  );
}
