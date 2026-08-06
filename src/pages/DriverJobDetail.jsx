import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Navigation, Loader2, Check, DollarSign, Package, MessageCircle, Phone, Clock, Users, Weight } from "lucide-react";
import { StatusBadge, STATUS_FLOW, STATUS_LABELS, formatMoney, timeAgo, formatDate, createNotification, notifyJobStatusChange, EmptyState, COMMISSION_RATE } from "@/lib/movezw";
import { getOrCreateConversation } from "@/lib/messaging";
import { notifyCustomersAlongRoute, distanceKm } from "@/lib/matching";
import { processJobCompletion, chargeCommissionOnCollection, ensureWallet, getCommissionConfig } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { geolocationUnavailableReason } from "@/lib/geo";

// Statuses during which the customer can see the driver moving live —
// matches fn_get_trip_contact_phone's "en route or later" gate, so location
// only becomes visible once contact details do too.
const LIVE_TRACKING_STATUSES = ["en_route_pickup", "collected", "in_transit"];
const LOCATION_REPORT_INTERVAL_MS = 5 * 60 * 1000;

function formatDistanceLabel(km) {
  if (km == null) return "Distance unavailable";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function DriverJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [profile, setProfile] = useState(null);
  const [myOffer, setMyOffer] = useState(null);
  const [customerPhone, setCustomerPhone] = useState(null);
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [driverPos, setDriverPos] = useState(null);
  const [locatingRoute, setLocatingRoute] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [findingSpace, setFindingSpace] = useState(false);

  const fetchDriverLocation = () => {
    const reason = geolocationUnavailableReason();
    if (reason) {
      setLocationError(reason);
      return;
    }
    setLocatingRoute(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocatingRoute(false);
      },
      (err) => {
        setLocatingRoute(false);
        setLocationError(err.message || "Please allow location access to see the route to pickup.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Auto-fetch the driver's location the moment there's a pickup point to
  // route to — no manual "Get directions" tap needed.
  useEffect(() => {
    if (request?.pickup_lat == null || request?.pickup_lng == null) return;
    fetchDriverLocation();
     
  }, [request?.pickup_lat, request?.pickup_lng]);

  const load = async () => {
    const [{ data: req, error: reqErr }, { data: prof }, { data: offers }] = await Promise.all([
      supabase.from("transport_requests").select("*").eq("id", id).single(),
      supabase.from("driver_profiles").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("offers").select("*").eq("request_id", id).eq("driver_id", user.id).order("created_at", { ascending: false }).limit(1),
    ]);
    if (reqErr) console.error("Failed to load request:", reqErr);
    setRequest(req || null);
    setProfile(prof?.[0] || null);
    setMyOffer(offers?.[0] || null);
    setLoading(false);

    if (req?.customer_id) {
      const { data: phone } = await supabase.rpc("fn_get_trip_contact_phone", { p_request_id: req.id });
      setCustomerPhone(phone || null);
    }
  };

  useEffect(() => { if (user?.id) load();   }, [id, user?.id]);

  // Live-refresh this page the moment the customer accepts/rejects an offer
  // on this job, so the driver sees the accepted state without a manual reload.
  useEffect(() => {
    if (!id || !user?.id) return;
    const channel = supabase
      .channel(`driver-job-${id}-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transport_requests", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "offers", filter: `request_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
     
  }, [id, user?.id]);

  // Report this driver's position to the customer every 5 minutes while the
  // job is actively moving (en route to pickup through in transit). Stops
  // automatically once delivered/completed/cancelled, or if this isn't the
  // accepted driver's own job.
  useEffect(() => {
    if (request?.accepted_driver_id !== user?.id || !LIVE_TRACKING_STATUSES.includes(request?.status)) return;
    const reportLocation = () => {
      if (geolocationUnavailableReason()) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          supabase
            .rpc("fn_update_driver_location", { p_request_id: request.id, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude })
            .then(({ error }) => { if (error) console.error("Failed to report location:", error); });
        },
        () => { /* best-effort — skip this cycle if location isn't available */ },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };
    reportLocation();
    const intervalId = setInterval(reportLocation, LOCATION_REPORT_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [request?.accepted_driver_id, request?.status, request?.id, user?.id]);

  const submitQuote = async () => {
    if (!price || Number(price) <= 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }
    if (profile?.availability_status === "offline") {
      toast({ title: "You're offline", description: "Go online from your dashboard to submit quotes.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const [wallet, cfg] = await Promise.all([ensureWallet(user.id), getCommissionConfig()]);
      const likelyCommission = Math.round(Number(price) * (cfg.rate ?? COMMISSION_RATE) * 100) / 100;
      if (!cfg.wallet_paused && (wallet.balance || 0) < likelyCommission) {
        toast({
          title: "Wallet balance too low",
          description: `This quote needs a commission of ${formatMoney(likelyCommission)} when you collect the cargo. Top up your wallet before quoting.`,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }
      const { data: newOffer, error } = await supabase
        .from("offers")
        .insert({
          request_id: request.id,
          driver_id: user.id,
          driver_profile_id: profile.id,
          driver_name: profile.full_name || user.full_name,
          driver_photo_url: profile.profile_picture_url || "",
          verified: profile.verification_status === "approved",
          vehicle_type: profile.vehicle_type,
          vehicle_name: profile.vehicle_name || null,
          license_plate: profile.license_plate || null,
          driver_rating: profile.rating_avg || 0,
          completed_jobs: profile.completed_jobs || 0,
          eta_minutes: eta ? Number(eta) : null,
          price: Number(price),
          note,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      await createNotification(request.customer_id, "new_offer", "New offer received 💬", `A driver quoted ${formatMoney(price)} for your ${request.cargo_type} request.`, `/customer/request/${request.id}`);
      try { await supabase.functions.invoke("notify-offer-push", { body: { offerId: newOffer.id } }); } catch (e) { console.error("Failed to send push alert:", e); }
      toast({ title: "Quote submitted!", description: "We'll notify you when the customer responds." });
      load();
    } catch (e) {
      toast({ title: "Could not submit quote", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const openChat = async () => {
    try {
      const conv = await getOrCreateConversation({
        request,
        driverId: user.id,
        driverName: profile?.full_name || user.full_name,
        customerName: request.customer_name,
      });
      navigate(`/chat/${conv.id}`);
    } catch (e) {
      toast({ title: "Could not open chat", description: e.message, variant: "destructive" });
    }
  };

  const findSpace = async () => {
    setFindingSpace(true);
    try {
      const count = await notifyCustomersAlongRoute(request);
      toast({
        title: count > 0 ? `Notified ${count} nearby customer${count === 1 ? "" : "s"}` : "No matches right now",
        description: count > 0
          ? "They can see your job's route — open their request to send a quote."
          : "No open requests along this route at the moment. Try again later.",
      });
    } catch (e) {
      toast({ title: "Couldn't check for matches", description: e.message, variant: "destructive" });
    } finally {
      setFindingSpace(false);
    }
  };

  // Arriving somewhere is the strongest signal we ever get for a place OSM
  // couldn't geocode (that's exactly why the driver had to fall back to a
  // text-only Google Maps search to get here). Capture the driver's real
  // GPS position at that moment: fills in this job's own lat/lng, and feeds
  // known_places so the next customer typing the same address gets a real
  // coordinate instead of hitting the same gap again. Best-effort — never
  // blocks the actual status update.
  const captureLearnedLocation = (fieldPrefix, label) => {
    if (!label || geolocationUnavailableReason()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        supabase
          .from("transport_requests")
          .update({ [`${fieldPrefix}_lat`]: lat, [`${fieldPrefix}_lng`]: lng })
          .eq("id", request.id)
          .then(({ error }) => { if (error) console.error("Failed to save learned location:", error); });
        supabase
          .rpc("fn_learn_place", { p_display_name: label, p_lat: lat, p_lng: lng })
          .then(({ error }) => { if (error) console.error("Failed to save known place:", error); });
      },
      () => { /* best-effort — skip if location isn't available right now */ },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      if (newStatus === "collected") {
        try {
          await chargeCommissionOnCollection({ driverId: user.id, request, acceptedPrice: request.accepted_price, actorId: user.id });
        } catch (e) {
          toast({ title: "Cannot collect cargo yet", description: e.message, variant: "destructive" });
          return;
        }
      }
      const { error: statusErr } = await supabase.from("transport_requests").update({ status: newStatus }).eq("id", request.id);
      if (statusErr) throw statusErr;
      if (newStatus === "collected" && request.pickup_lat == null) {
        captureLearnedLocation("pickup", request.pickup_location);
      }
      if (newStatus === "delivered" && request.destination_lat == null) {
        captureLearnedLocation("destination", request.destination);
      }
      if (newStatus === "completed") {
        const { error: profErr } = await supabase
          .from("driver_profiles")
          .update({ completed_jobs: (profile.completed_jobs || 0) + 1 })
          .eq("id", profile.id);
        if (profErr) console.error("Failed to update completed_jobs:", profErr);
        // Future-ready payment: credit driver earnings, deduct platform commission, generate invoice.
        try {
          await processJobCompletion({ driverId: user.id, request, acceptedPrice: request.accepted_price });
        } catch (payErr) {
          // Payment module is best-effort; do not block job completion.
          console.warn("payment processing failed", payErr);
        }
        try {
          await createNotification(user.id, "admin", "Earnings credited 💰", `Your earnings for this job are now in your wallet.`, `/wallet`);
        } catch (_) {}
      }
      await notifyJobStatusChange(request, newStatus, user.id);
      toast({ title: `Marked as ${STATUS_LABELS[newStatus].toLowerCase()}` });
      load();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }
  if (!request) return <div className="p-8 text-center text-muted-foreground">Job not found.</div>;

  const isMyJob = request.accepted_driver_id === user.id;
  const activeStep = STATUS_FLOW.indexOf(request.status);
  const enRouteOrLater = activeStep >= STATUS_FLOW.indexOf("en_route_pickup");
  const nextStep = STATUS_FLOW[activeStep + 1];
  const isOpen = request.status === "open";
  const headedToDestination = ["collected", "in_transit", "delivered"].includes(request.status);
  // Real turn-by-turn (voice guidance, auto-advance, re-routing) isn't
  // something this app builds itself — deep-link into the driver's own
  // Google Maps app for that instead. Target is wherever they're headed
  // next: pickup until collected, then the destination. Falls back to the
  // raw address text when we don't have coordinates (MoveZW's free OSM
  // geocoder doesn't know every local place) — Google Maps' own, much
  // better geocoder resolves it query-side, at no cost to us since it's
  // just handing off to their consumer app, not calling their paid API.
  const navigateTarget = !["collected", "in_transit", "delivered", "completed"].includes(request.status)
    ? (request.pickup_lat != null && request.pickup_lng != null
        ? { query: `${request.pickup_lat},${request.pickup_lng}`, label: "pickup" }
        : request.pickup_location ? { query: request.pickup_location, label: "pickup" } : null)
    : (request.destination_lat != null && request.destination_lng != null
        ? { query: `${request.destination_lat},${request.destination_lng}`, label: "destination" }
        : request.destination ? { query: request.destination, label: "destination" } : null);

  return (
    <div className="p-4 pb-8 space-y-5">
      <div className="flex items-center gap-2 -ml-1.5">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Job details</h1>
        {isMyJob && enRouteOrLater && customerPhone && (
          <a href={`tel:${customerPhone}`} aria-label="Call customer" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0">
            <Phone className="w-4 h-4 text-primary" />
          </a>
        )}
      </div>

      <div className="flex items-center justify-between pl-9 -mt-3">
        <p className="text-xs text-muted-foreground">{isMyJob ? `${request.customer_name || "Customer"}` : "New request"} · {timeAgo(request.created_at)}</p>
        <StatusBadge status={request.status} />
      </div>

      {/* Route */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="w-0.5 flex-1 bg-border my-1" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="flex-1 space-y-3 pb-1">
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground">PICKUP</p>
              <p className="text-base font-bold text-primary">{request.pickup_location}</p>
              {request.pickup_lat != null && request.pickup_lng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${request.pickup_lat}&mlon=${request.pickup_lng}#map=17/${request.pickup_lat}/${request.pickup_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary bg-primary/10 border-2 border-primary/30 rounded-xl px-3 py-2 mt-1.5 hover:bg-primary/15 transition-colors"
                >
                  <MapPin className="w-4 h-4" /> View exact location on map
                </a>
              )}
            </div>
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground">DESTINATION</p>
              <p className="text-base font-bold text-emerald-700">{request.destination}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Distance — no map here (was cluttering the screen). Trip distance
          (pickup → destination) is what actually determines a fair quote,
          so it's always shown with an explicit fallback rather than
          silently disappearing when an address wasn't pinned exactly.
          Distance-to-pickup below it only affects ETA, not price. */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Navigation className="w-4 h-4 text-primary" />
            Trip distance
          </span>
          <span className="text-sm font-bold text-primary">
            {request.pickup_lat != null && request.pickup_lng != null && request.destination_lat != null && request.destination_lng != null
              ? formatDistanceLabel(distanceKm(request.pickup_lat, request.pickup_lng, request.destination_lat, request.destination_lng))
              : "Not available"}
          </span>
        </div>
        {(request.pickup_lat == null || request.pickup_lng == null || request.destination_lat == null || request.destination_lng == null) && (
          <p className="text-xs text-muted-foreground">
            {isOpen && !myOffer
              ? "Pickup or destination wasn't pinned exactly — check the addresses above to estimate distance yourself before quoting."
              : "Pickup or destination wasn't pinned exactly."}
          </p>
        )}
        {request.pickup_lat != null && request.pickup_lng != null && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              {driverPos ? (
                `${formatDistanceLabel(distanceKm(driverPos.lat, driverPos.lng, headedToDestination ? request.destination_lat : request.pickup_lat, headedToDestination ? request.destination_lng : request.pickup_lng))} to ${headedToDestination ? "destination" : "pickup"}`
              ) : locatingRoute ? (
                <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Getting your location…</span>
              ) : (
                locationError || "Your location unavailable"
              )}
            </span>
            {!driverPos && !locatingRoute && (
              <button type="button" onClick={fetchDriverLocation} className="text-xs font-semibold text-primary underline shrink-0">
                Try again
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cargo */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Weight className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[11px]">Weight</p>
            </div>
            <p className="text-sm font-bold truncate">{request.cargo_weight || "—"}</p>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[11px]">Customer budget</p>
            </div>
            <p className="text-sm font-bold text-primary truncate">{formatMoney(request.budget)}</p>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[11px]">Timing</p>
            </div>
            <p className="text-sm font-bold truncate">{request.timing === "scheduled" ? formatDate(request.scheduled_date) : "Now"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{request.cargo_type}</span>
        </div>
        {request.cargo_description && <p className="text-sm text-muted-foreground pt-2 border-t border-border">{request.cargo_description}</p>}
        {request.photos?.length > 0 && (
          <div className="grid grid-cols-4 gap-2 pt-1">
            {request.photos.map((p, i) => (
              <a key={i} href={p} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border">
                <img src={p} alt="" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Offline — must go online before quoting */}
      {isOpen && !myOffer && profile?.availability_status === "offline" && (
        <div className="bg-white rounded-2xl border border-border p-4 text-center">
          <p className="text-sm font-semibold">You're offline</p>
          <p className="text-sm text-muted-foreground mt-1">Go online from your dashboard to submit a quote for this job.</p>
        </div>
      )}

      {/* Submit quote (open) */}
      {isOpen && !myOffer && profile?.availability_status !== "offline" && (
        <div className="bg-white rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Submit your quote</h2>
          <div className="space-y-2">
            <Label htmlFor="price">Your price (USD)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="price" type="number" min="0" placeholder={request.budget || "0"} value={price} onChange={(e) => setPrice(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="eta">ETA to pickup (minutes)</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="eta" type="number" min="1" placeholder="e.g. 20" value={eta} onChange={(e) => setEta(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Message to customer (optional)</Label>
            <Textarea id="note" placeholder="e.g. I can be there in 20 minutes with my 1-ton truck." value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button onClick={submitQuote} disabled={submitting} className="w-full h-12 font-semibold">
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send quote"}
          </Button>
        </div>
      )}

      {/* Quote pending */}
      {myOffer && myOffer.status === "pending" && (
        <div className="bg-white rounded-2xl border border-border p-4 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-2">
            <Loader2 className="w-6 h-6 text-amber-500" />
          </div>
          <h2 className="text-sm font-semibold">Quote sent — waiting for customer</h2>
          <p className="text-sm text-muted-foreground mt-1">You offered <span className="font-semibold text-foreground">{formatMoney(myOffer.price)}</span> for this job.</p>
        </div>
      )}

      {/* Quote rejected */}
      {myOffer && myOffer.status === "rejected" && (
        <div className="bg-white rounded-2xl border border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">The customer chose another driver for this job.</p>
        </div>
      )}

      {/* Manage delivery (accepted) */}
      {isMyJob && (STATUS_FLOW.includes(request.status) || request.status === "completed") && (
        <div className="space-y-4">
          {navigateTarget && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(navigateTarget.query)}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
            >
              <Navigation className="w-4 h-4" /> Navigate to {navigateTarget.label}
            </a>
          )}
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold">Agreed price</h2>
              <p className="text-lg font-bold text-primary">{formatMoney(request.accepted_price)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Payment: {request.payment_status === "cod" ? "Cash on delivery" : request.payment_status}</p>
            {enRouteOrLater ? (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={openChat} className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border hover:bg-muted text-sm font-medium">
                  <MessageCircle className="w-4 h-4 text-primary" /> Message
                </button>
                {customerPhone && (
                  <a href={`tel:${customerPhone}`} className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border hover:bg-muted text-sm font-medium">
                    <Phone className="w-4 h-4 text-primary" /> Call
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-3">Customer contact details will appear once you mark yourself en route to pickup.</p>
            )}
          </div>

          {!["delivered", "completed"].includes(request.status) && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-primary" /> Got space for one more?</h2>
              <p className="text-xs text-muted-foreground mb-3">Let nearby customers know you can pick up a second delivery along this route — you can quote them a lower price since you're already headed that way.</p>
              <button
                type="button"
                onClick={findSpace}
                disabled={findingSpace}
                className="w-full h-11 rounded-xl bg-primary/10 border-2 border-primary/30 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/15 transition-colors disabled:opacity-60"
              >
                {findingSpace ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {findingSpace ? "Checking nearby requests..." : "I have space — notify nearby customers"}
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Delivery progress</h2>
              <span className="text-xs text-muted-foreground">{Math.min(activeStep + 1, STATUS_FLOW.length)} of {STATUS_FLOW.length} completed</span>
            </div>
            <div className="flex items-start">
              {STATUS_FLOW.map((step, i) => {
                const done = i <= activeStep;
                const current = i === activeStep && request.status !== "completed";
                return (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center w-12 shrink-0">
                      <span className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        current && "ring-4 ring-primary/20"
                      )}>
                        {done && !current ? <Check className="w-3.5 h-3.5" /> : i + 1}
                      </span>
                      <p className={cn("text-[9px] leading-tight text-center mt-1.5", done ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {STATUS_LABELS[step]}
                      </p>
                    </div>
                    {i < STATUS_FLOW.length - 1 && (
                      <div className={cn("flex-1 h-0.5 mt-3.5", i < activeStep ? "bg-primary" : "bg-border")} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {request.status !== "completed" && request.status !== "delivered" && nextStep && (
            <Button onClick={() => updateStatus(nextStep)} disabled={updating} className="w-full h-12 font-semibold">
              {updating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : `Mark as ${STATUS_LABELS[nextStep]}`}
            </Button>
          )}
          {request.status === "delivered" && (
            <Button onClick={() => updateStatus("completed")} disabled={updating} className="w-full h-12 font-semibold">
              {updating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Completing...</> : "Complete job"}
            </Button>
          )}
          {request.status === "completed" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <Check className="w-7 h-7 text-emerald-500 mx-auto mb-1" />
              <p className="text-sm font-semibold text-emerald-700">Job completed</p>
            </div>
          )}
        </div>
      )}

      {!isMyJob && !isOpen && myOffer?.status !== "pending" && (
        <div className="bg-white rounded-2xl border border-border">
          <EmptyState icon={Package} title="This job is no longer available" subtitle="The customer has selected a driver." />
        </div>
      )}
    </div>
  );
}
