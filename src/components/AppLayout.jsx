import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import { Home, Plus, Truck, Bell, User as UserIcon, LogOut, MessageCircle, Repeat, Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { createNotification } from "@/lib/movezw";

const customerNav = [
  { to: "/customer", label: "Home", icon: Home },
  { to: "/customer/new", label: "Request Truck", icon: Plus },
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
  const [ratingJob, setRatingJob] = useState(null);
  const [dismissedRatingIds, setDismissedRatingIds] = useState([]);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const isDriver = user?.role === "driver";
  const nav = isDriver ? driverNav : customerNav;

  // Refetches on any insert/update to this user's notifications — not just
  // on navigation — so the badge reflects a new notification arriving (or
  // being marked read, including "mark all read" on the Notifications page
  // itself) without needing a route change to notice.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const refreshUnread = () => {
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        .then(({ count, error }) => {
          if (error) console.error("Failed to load unread count:", error);
          if (active) setUnread(count || 0);
        });
    };
    refreshUnread();
    const channel = supabase
      .channel(`applayout-unread-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshUnread)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshUnread)
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  // Keep the installed PWA's launcher badge in sync with the same unread
  // count shown on the in-app bell. Supporting launchers render this as a
  // red dot or number; unsupported browsers simply ignore it.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (unread > 0 && "setAppBadge" in navigator) {
      navigator.setAppBadge(unread).catch(() => {});
    } else if (unread === 0 && "clearAppBadge" in navigator) {
      navigator.clearAppBadge().catch(() => {});
    }
  }, [unread]);

  // Marks read any of this user's unread notifications whose link points to
  // wherever they've just navigated — this is what "viewing" a notification
  // means in practice: tapping a push notification, clicking a toast's
  // "View" action, or clicking "View" on the Notifications list all land
  // here the same way, so one check on route change covers every entry
  // point instead of wiring mark-read into each one separately.
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
      .eq("link", location.pathname)
      .then(({ error }) => { if (error) console.error("Failed to auto-mark notification read:", error); });
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

  // A completed job opens the rating screen wherever the customer currently
  // is in the app. Realtime shows it immediately; polling and visibility
  // refreshes cover a temporarily disconnected mobile websocket. "Rate
  // later" dismisses it only for this app session, so it is offered again
  // after the next launch until a rating exists.
  useEffect(() => {
    if (!user?.id || user.role !== "customer") {
      setRatingJob(null);
      return;
    }
    let mounted = true;
    const refreshRatingPrompt = async () => {
      const { data: jobs, error: jobsError } = await supabase
        .from("transport_requests")
        .select("id, cargo_type, pickup_location, destination, accepted_driver_id, updated_at")
        .eq("customer_id", user.id)
        .eq("status", "completed")
        .not("accepted_driver_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (!mounted || jobsError || !jobs?.length) {
        if (mounted && !jobsError) setRatingJob(null);
        return;
      }
      const { data: ratings, error: ratingsError } = await supabase
        .from("ratings")
        .select("request_id")
        .eq("customer_id", user.id)
        .in("request_id", jobs.map((job) => job.id));
      if (!mounted || ratingsError) return;
      const ratedIds = new Set((ratings || []).map((rating) => rating.request_id));
      const dismissedIds = new Set(dismissedRatingIds);
      setRatingJob(jobs.find((job) => !ratedIds.has(job.id) && !dismissedIds.has(job.id)) || null);
    };
    void refreshRatingPrompt();
    const channel = supabase
      .channel(`customer-completed-rating-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "transport_requests", filter: `customer_id=eq.${user.id}` },
        refreshRatingPrompt
      )
      .subscribe();
    const intervalId = window.setInterval(refreshRatingPrompt, 15 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshRatingPrompt();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.role, dismissedRatingIds]);

  const submitDriverRating = async () => {
    if (!ratingJob || !ratingScore || !user?.id) return;
    setSubmittingRating(true);
    try {
      const { error } = await supabase.from("ratings").insert({
        request_id: ratingJob.id,
        customer_id: user.id,
        driver_id: ratingJob.accepted_driver_id,
        stars: ratingScore,
        comment: ratingComment,
      });
      if (error) throw error;
      await createNotification(
        ratingJob.accepted_driver_id,
        "rating_received",
        "New rating received ⭐",
        `You received a ${ratingScore}-star rating.`,
        "/driver"
      );
      setDismissedRatingIds((ids) => [...ids, ratingJob.id]);
      setRatingJob(null);
      setRatingScore(0);
      setRatingComment("");
      toast({ title: "Thanks for rating your driver!" });
    } catch (error) {
      toast({ title: "Could not submit rating", description: error.message, variant: "destructive" });
    } finally {
      setSubmittingRating(false);
    }
  };

  const rateLater = () => {
    if (!ratingJob) return;
    setDismissedRatingIds((ids) => [...ids, ratingJob.id]);
    setRatingJob(null);
    setRatingScore(0);
    setRatingComment("");
  };

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
                <Link key={to} to={to} aria-label={label} aria-current={active ? "page" : undefined} className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}>
                  <span className="w-12 h-12 -mt-7 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center border-4 border-background">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span>{label}</span>
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

      {ratingJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="driver-rating-title">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-2xl p-6 safe-bottom">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-500 flex items-center justify-center mx-auto">
              <Star className="w-7 h-7 fill-amber-400" />
            </div>
            <div className="text-center mt-4">
              <p className="text-xs font-bold tracking-wide text-primary">DELIVERY COMPLETED</p>
              <h2 id="driver-rating-title" className="text-xl font-bold mt-1">Rate your driver</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {ratingJob.pickup_location} → {ratingJob.destination}
              </p>
            </div>

            <div className="flex justify-center gap-1.5 my-6" aria-label="Choose a rating from 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  aria-label={`${score} star${score === 1 ? "" : "s"}`}
                  onClick={() => setRatingScore(score)}
                  className="p-1"
                >
                  <Star className={cn("w-10 h-10 transition-colors", score <= ratingScore ? "text-amber-400 fill-amber-400" : "text-slate-200")} />
                </button>
              ))}
            </div>

            <Textarea
              placeholder="Leave a comment (optional)"
              value={ratingComment}
              onChange={(event) => setRatingComment(event.target.value)}
              rows={3}
            />
            <Button onClick={submitDriverRating} disabled={!ratingScore || submittingRating} className="w-full h-12 mt-4 font-semibold">
              {submittingRating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit rating"}
            </Button>
            <button type="button" onClick={rateLater} className="w-full py-3 text-sm font-medium text-muted-foreground">
              Rate later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
