import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useUnexpiredRequests } from "@/lib/useUnexpiredRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Navigation, Loader2, Check, DollarSign, Package, MessageCircle, Phone, Clock, Users, Weight, Map as MapIcon } from "lucide-react";
import { StatusBadge, STATUS_FLOW, STATUS_LABELS, formatMoney, timeAgo, formatDate, createNotification, notifyJobStatusChange, EmptyState } from "@/lib/movezw";
import { getOrCreateConversation } from "@/lib/messaging";
import { notifyCustomersAlongRoute, distanceKm, fetchRoadDistanceKm } from "@/lib/matching";
import { processJobCompletion, ensureWallet, getCommissionConfig } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { geolocationUnavailableReason, geocodeAddress } from "@/lib/geo";
import ReturnLoadPrompt from "@/components/ReturnLoadPrompt";
import ImageLightbox from "@/components/ImageLightbox";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

const RouteMap = React.lazy(() => import("@/components/RouteMap"));

// Statuses during which the customer can see the driver moving live —
// matches fn_get_trip_contact_phone's "en route or later" gate, so location
// only becomes visible once contact details do too.
const LIVE_TRACKING_STATUSES = ["en_route_pickup", "collected", "in_transit"];
// Under a minute so the customer's tracking map reads as actually moving,
// not a pin that jumps every few minutes — 30s is frequent enough to feel
// live without meaningfully worse battery/data use than the old 5-minute
// interval for a trip that's usually well under an hour.
const LOCATION_REPORT_INTERVAL_MS = 30 * 1000;

function formatDistanceLabel(km) {
  if (km == null) return "Distance unavailable";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function DriverJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingStatus, setPendingStatus] = useState(null);
  const { user } = useAuth();
  const [storedRequest, setRequest] = useState(null);
  const request = useUnexpiredRequests(storedRequest ? [storedRequest] : [])[0] || null;
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
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [findingSpace, setFindingSpace] = useState(false);
  const [editingOffer, setEditingOffer] = useState(false);
  const [roadDistanceKm, setRoadDistanceKm] = useState(null);
  const [roadDistanceStatus, setRoadDistanceStatus] = useState("idle");
  const [roadDistanceRetryTick, setRoadDistanceRetryTick] = useState(0);
  const [resolved, setResolved] = useState({ pickup: null, destination: null });
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [showReturnPrompt, setShowReturnPrompt] = useState(false);

  // pickup_lat/lng and destination_lat/lng are only ever set when the
  // customer picked a suggestion (or used pin-drop / "use my location") in
  // AddressSearchInput.jsx — typing an address and never selecting a match
  // leaves them null, which used to mean "Distance unavailable" here even
  // though the address text itself is fine. Best-effort client-side geocode
  // fallback so a driver still sees a distance in that case; not persisted
  // back to transport_requests, so this re-resolves each time it's needed
  // rather than assuming every viewer has write access to the row.
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    (async () => {
      if (request.pickup_lat == null && request.pickup_location && !resolved.pickup) {
        const geo = await geocodeAddress(request.pickup_location);
        if (!cancelled && geo) setResolved((r) => ({ ...r, pickup: geo }));
      }
      if (request.destination_lat == null && request.destination && !resolved.destination) {
        const geo = await geocodeAddress(request.destination);
        if (!cancelled && geo) setResolved((r) => ({ ...r, destination: geo }));
      }
    })();
    return () => { cancelled = true; };

  }, [request?.id, request?.pickup_lat, request?.pickup_location, request?.destination_lat, request?.destination]);

  const effPickupLat = request?.pickup_lat ?? resolved.pickup?.lat ?? null;
  const effPickupLng = request?.pickup_lng ?? resolved.pickup?.lng ?? null;
  const effDestLat = request?.destination_lat ?? resolved.destination?.lat ?? null;
  const effDestLng = request?.destination_lng ?? resolved.destination?.lng ?? null;

  // Real road distance, matching what the customer's own request page shows
  // (RequestDetail.jsx's RouteMap, also OSRM) — a straight-line distance
  // under-counts actual travel distance (often significantly), so quoting
  // off it read as "wrong" compared to the customer's own number. Always
  // shows the real road distance or an explicit retry state — never a
  // straight-line number presented as if it were the distance.
  useEffect(() => {
    if (effPickupLat == null || effPickupLng == null || effDestLat == null || effDestLng == null) {
      setRoadDistanceKm(null);
      setRoadDistanceStatus("idle");
      return;
    }
    let cancelled = false;
    setRoadDistanceStatus("loading");
    fetchRoadDistanceKm(
      { lat: effPickupLat, lng: effPickupLng },
      { lat: effDestLat, lng: effDestLng }
    ).then((km) => {
      if (cancelled) return;
      setRoadDistanceKm(km);
      setRoadDistanceStatus(km != null ? "ready" : "error");
    });
    return () => { cancelled = true; };
  }, [effPickupLat, effPickupLng, effDestLat, effDestLng, roadDistanceRetryTick]);

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
    if (effPickupLat == null || effPickupLng == null) return;
    fetchDriverLocation();

  }, [effPickupLat, effPickupLng]);

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

  // While this job is still open (pre-acceptance, the bidding stage), join
  // a presence channel so the customer can see a live "N drivers viewing"
  // count — pure social proof/urgency signal. Presence drops automatically
  // the moment this driver navigates away or the job stops being open;
  // once a job is actually accepted, driver_lat/driver_lng reporting below
  // takes over as the trust signal instead.
  useEffect(() => {
    if (!id || !user?.id || request?.status !== "open") return;
    const channel = supabase.channel(`job-presence-${id}`, { config: { presence: { key: user.id } } });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ driver_name: profile?.full_name || "A driver" });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [id, user?.id, request?.status, profile?.full_name]);

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
        // maximumAge shorter than the report interval — otherwise the
        // browser would keep handing back the same cached fix from before
        // the interval dropped to 30s, and the "live" pin would stop
        // actually moving between real GPS reads.
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 20000 }
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
      // Commission is reserved from the wallet the moment a customer
      // accepts this quote (see fn_accept_offer), not at collection — so
      // the gate here (and the matching offers_insert RLS check) is the
      // low-balance threshold itself, not this specific job's commission.
      // A driver who clears the threshold can still go negative on a job
      // whose commission exceeds what's left, by design.
      const [wallet, cfg] = await Promise.all([ensureWallet(user.id), getCommissionConfig()]);
      const threshold = cfg.low_balance_threshold ?? 5;
      if (!cfg.wallet_paused && (wallet.balance || 0) < threshold) {
        toast({
          title: "Wallet balance too low",
          description: `Your commission balance needs to be at least ${formatMoney(threshold)} to accept new jobs. Top up your wallet to continue.`,
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

  // Revise a still-pending quote (e.g. after the customer asks for a lower
  // price in chat) — both the RLS policy and the price-integrity trigger on
  // offers already allow the submitting driver to update their own row;
  // this was previously just missing from the UI entirely, so a driver had
  // no way to send a counter-offer once their first quote was in.
  const updateQuote = async () => {
    if (!price || Number(price) <= 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }
    if (profile?.availability_status === "offline") {
      toast({ title: "You're offline", description: "Go online from your dashboard to revise quotes.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("offers")
        .update({ price: Number(price), eta_minutes: eta ? Number(eta) : null, note })
        .eq("id", myOffer.id);
      if (error) throw error;
      await createNotification(request.customer_id, "new_offer", "Updated offer 💬", `The driver revised their quote to ${formatMoney(price)} for your ${request.cargo_type} request.`, `/customer/request/${request.id}`);
      try { await supabase.functions.invoke("notify-offer-push", { body: { offerId: myOffer.id } }); } catch (e) { console.error("Failed to send push alert:", e); }
      toast({ title: "Quote updated!", description: "The customer has been notified of your new price." });
      setEditingOffer(false);
      load();
    } catch (e) {
      toast({ title: "Could not update quote", description: e.message, variant: "destructive" });
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
    if (updating || request.accepted_driver_id !== user.id) return;
    if (STATUS_FLOW[STATUS_FLOW.indexOf(request.status) + 1] !== newStatus) return;
    setUpdating(true);
    try {
      // Commission is reserved at acceptance now (fn_accept_offer), not
      // collection — nothing to charge or gate here anymore.
      const { data: changed, error: statusErr } = await supabase.from("transport_requests")
        .update({ status: newStatus }).eq("id", request.id)
        .eq('accepted_driver_id', user.id).eq('status', request.status).select('id').maybeSingle();
      if (statusErr) throw statusErr;
      if (!changed) {
        void load();
        throw new Error('This delivery has changed. Review its latest progress before updating.');
      }
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
      // Right when they've just arrived is when a driver actually knows
      // their return route — catch that intent here instead of relying on
      // them to remember to go post one later from the Return Loads tab.
      if (newStatus === "delivered") setShowReturnPrompt(true);
      load();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!loading && location.hash === '#delivery-progress') {
      document.getElementById('delivery-progress')?.scrollIntoView({ block: 'start' });
    }
  }, [loading, location.hash, id]);

  const requestStatusUpdate = (status) => {
    if (status === 'collected' || status === 'completed') setPendingStatus({ status, from: request.status });
    else void updateStatus(status);
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }
  if (!request) return <div className="p-8 text-center text-muted-foreground">Job not found.</div>;

  const isMyJob = request.accepted_driver_id === user.id;
  const activeStep = STATUS_FLOW.indexOf(request.status);
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
    ? (effPickupLat != null && effPickupLng != null
        ? { query: `${effPickupLat},${effPickupLng}`, label: "pickup" }
        : request.pickup_location ? { query: request.pickup_location, label: "pickup" } : null)
    : (effDestLat != null && effDestLng != null
        ? { query: `${effDestLat},${effDestLng}`, label: "destination" }
        : request.destination ? { query: request.destination, label: "destination" } : null);

  return (
    <div className="p-4 pb-8 space-y-5">
      <div className="flex items-center gap-2 -ml-1.5">
        <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Job details</h1>
        {isMyJob && customerPhone && (
          <a href={`tel:${customerPhone}`} aria-label="Call customer" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0">
            <Phone className="w-4 h-4 text-primary" />
          </a>
        )}
      </div>

      <div className="flex items-center justify-between pl-9 -mt-3">
        <p className="text-xs text-muted-foreground">{isMyJob ? `${request.customer_name || "Customer"}` : "New request"} · {timeAgo(request.created_at)}</p>
        <div className="flex items-center gap-1.5">
          {request.batch_total > 1 && (
            <span className="text-[11px] font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full whitespace-nowrap">
              Load {request.batch_index} of {request.batch_total}
            </span>
          )}
          <StatusBadge status={request.status} />
        </div>
      </div>

      {/* Route */}
      <div className="bg-card rounded-2xl border border-border p-4">
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
              {effPickupLat != null && effPickupLng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${effPickupLat}&mlon=${effPickupLng}#map=17/${effPickupLat}/${effPickupLng}`}
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
          Uses the same real road-driving distance (OSRM) the customer's
          own request page shows via RouteMap — a straight-line distance
          under-counts actual travel and read as "wrong" next to that.
          Distance-to-pickup below it only affects ETA, not price. */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Navigation className="w-4 h-4 text-primary" />
            Trip distance
          </span>
          <span className="text-sm font-bold text-primary">
            {effPickupLat == null || effPickupLng == null || effDestLat == null || effDestLng == null ? (
              "Not available"
            ) : roadDistanceStatus === "loading" ? (
              <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</span>
            ) : roadDistanceStatus === "ready" ? (
              formatDistanceLabel(roadDistanceKm)
            ) : (
              "Unavailable"
            )}
          </span>
        </div>
        {(effPickupLat == null || effPickupLng == null || effDestLat == null || effDestLng == null) && (
          <p className="text-xs text-muted-foreground">
            {isOpen && !myOffer
              ? "Pickup or destination wasn't pinned exactly — check the addresses above to estimate distance yourself before quoting."
              : "Pickup or destination wasn't pinned exactly."}
          </p>
        )}
        {roadDistanceStatus === "error" && (
          <p className="text-xs text-muted-foreground flex items-center justify-between gap-2">
            <span>Couldn't calculate the real road distance right now.</span>
            <button
              type="button"
              onClick={() => setRoadDistanceRetryTick((t) => t + 1)}
              className="font-semibold text-primary underline shrink-0"
            >
              Retry
            </button>
          </p>
        )}
        {effPickupLat != null && effPickupLng != null && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              {driverPos ? (
                `${formatDistanceLabel(distanceKm(driverPos.lat, driverPos.lng, headedToDestination ? effDestLat : effPickupLat, headedToDestination ? effDestLng : effPickupLng))} to ${headedToDestination ? "destination" : "pickup"}`
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
        {!isMyJob && effPickupLat != null && effPickupLng != null && effDestLat != null && effDestLng != null && (
          <>
            <button
              type="button"
              onClick={() => setShowRouteMap((v) => !v)}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary/10 border-2 border-primary/30 text-primary font-semibold text-sm mt-1 hover:bg-primary/15 transition-colors"
            >
              <MapIcon className="w-4 h-4" /> {showRouteMap ? "Hide route map" : "Show route: pickup → destination"}
            </button>
            {showRouteMap && (
              <React.Suspense fallback={<div className="h-[220px] rounded-xl bg-muted animate-pulse mt-2" />}>
                <RouteMap
                  from={{ lat: effPickupLat, lng: effPickupLng }}
                  to={{ lat: effDestLat, lng: effDestLng }}
                  fromLabel="Pickup"
                  toLabel="Destination"
                  height={220}
                />
              </React.Suspense>
            )}
          </>
        )}
        {!isMyJob && effPickupLat != null && effPickupLng != null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${effPickupLat},${effPickupLng}&destination=${
              effDestLat != null && effDestLng != null ? `${effDestLat},${effDestLng}` : encodeURIComponent(request.destination || "")
            }&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-10 rounded-xl border border-border text-sm font-medium mt-1 hover:bg-muted transition-colors"
          >
            <Navigation className="w-4 h-4 text-primary" /> Open full route in Google Maps
          </a>
        )}
      </div>

      {/* Cargo */}
      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
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
              <button key={i} type="button" onClick={() => setLightboxIndex(i)} className="aspect-square rounded-lg overflow-hidden border border-border">
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Offline — must go online before quoting */}
      {isOpen && !myOffer && profile?.availability_status === "offline" && (
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <p className="text-sm font-semibold">You're offline</p>
          <p className="text-sm text-muted-foreground mt-1">Go online from your dashboard to submit a quote for this job.</p>
        </div>
      )}

      {/* Submit quote (open) */}
      {isOpen && !myOffer && profile?.availability_status !== "offline" && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Submit your quote</h2>
          <div className="space-y-2">
            <Label htmlFor="price">Your price (USD)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="price" type="number" min="0" placeholder={request.budget || "e.g. 50"} value={price} onChange={(e) => setPrice(e.target.value)} className="pl-10" />
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

      {/* Quote pending — can still be revised (a counter-offer) while the
          customer hasn't accepted or rejected it yet. */}
      {myOffer && myOffer.status === "pending" && !editingOffer && (
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-2">
            <Loader2 className="w-6 h-6 text-amber-500" />
          </div>
          <h2 className="text-sm font-semibold">Quote sent — waiting for customer</h2>
          <p className="text-sm text-muted-foreground mt-1">You offered <span className="font-semibold text-foreground">{formatMoney(myOffer.price)}</span> for this job.</p>
          <button
            type="button"
            onClick={() => {
              setPrice(String(myOffer.price ?? ""));
              setEta(myOffer.eta_minutes != null ? String(myOffer.eta_minutes) : "");
              setNote(myOffer.note || "");
              setEditingOffer(true);
            }}
            className="mt-3 text-sm font-semibold text-primary underline"
          >
            Send a different price
          </button>
        </div>
      )}

      {myOffer && myOffer.status === "pending" && editingOffer && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <h2 className="text-sm font-semibold">Revise your quote</h2>
          <div className="space-y-2">
            <Label htmlFor="revise-price">Your price (USD)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="revise-price" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revise-eta">ETA to pickup (minutes)</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input id="revise-eta" type="number" min="1" value={eta} onChange={(e) => setEta(e.target.value)} className="pl-10" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="revise-note">Message to customer (optional)</Label>
            <Textarea id="revise-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2">
            <Button onClick={updateQuote} disabled={submitting} className="flex-1 h-12 font-semibold">
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send updated quote"}
            </Button>
            <Button variant="outline" onClick={() => setEditingOffer(false)} disabled={submitting} className="h-12">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Quote rejected */}
      {myOffer && myOffer.status === "rejected" && (
        <div className="bg-card rounded-2xl border border-border p-4 text-center">
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
          <div className="bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold">Agreed price</h2>
              <p className="text-lg font-bold text-primary">{formatMoney(request.accepted_price)}</p>
            </div>
            <p className="text-xs text-muted-foreground">Payment: {request.payment_status === "cod" ? "Cash on delivery" : request.payment_status}</p>
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
          </div>

          {!["delivered", "completed"].includes(request.status) && (
            <div className="bg-card rounded-2xl border border-border p-4">
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

          <div id="delivery-progress" className="bg-card rounded-2xl border border-border p-4 scroll-mt-24">
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
            <Button onClick={() => requestStatusUpdate(nextStep)} disabled={updating} className="w-full h-12 font-semibold">
              {updating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : `Mark as ${STATUS_LABELS[nextStep]}`}
            </Button>
          )}
          {request.status === "delivered" && (
            <Button onClick={() => requestStatusUpdate("completed")} disabled={updating} className="w-full h-12 font-semibold">
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

      <AlertDialog open={!!pendingStatus} onOpenChange={(open) => { if (!open) setPendingStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogTitle>{pendingStatus?.status === 'collected' ? 'Confirm cargo collected?' : 'Complete this delivery?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingStatus?.status === 'collected'
              ? 'Confirm that the cargo has been loaded into your vehicle. The customer will be notified.'
              : 'Confirm that the cargo has been handed over and this delivery is finished.'}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction disabled={updating} onClick={() => {
              if (pendingStatus?.from === request.status) void updateStatus(pendingStatus.status);
              else toast({ title: 'Delivery progress changed. Please review the current step.' });
              setPendingStatus(null);
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isMyJob && !isOpen && myOffer?.status !== "pending" && (
        <div className="bg-card rounded-2xl border border-border">
          <EmptyState icon={Package} title="This job is no longer available" subtitle="The customer has selected a driver." />
        </div>
      )}

      {showReturnPrompt && (
        <ReturnLoadPrompt
          job={request}
          profile={profile}
          driverId={user.id}
          onClose={() => setShowReturnPrompt(false)}
        />
      )}

      <ImageLightbox images={request.photos || []} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} />
    </div>
  );
}
