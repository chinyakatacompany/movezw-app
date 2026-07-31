import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Navigation, Loader2, Check, Star, DollarSign, Package, MessageCircle, Phone, Clock } from "lucide-react";
import { StatusBadge, STATUS_FLOW, STATUS_LABELS, formatMoney, timeAgo, formatDate, VEHICLE_ICONS, createNotification, notifyJobStatusChange, EmptyState, COMMISSION_RATE } from "@/lib/movezw";
import { getOrCreateConversation } from "@/lib/messaging";
import { processJobCompletion, chargeCommissionOnCollection, ensureWallet, getCommissionConfig } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import RouteMap from "@/components/RouteMap";

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

  const showRoute = () => {
    if (!navigator.geolocation) {
      toast({ title: "Location not supported", description: "Your browser doesn't support GPS location.", variant: "destructive" });
      return;
    }
    setLocatingRoute(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDriverPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocatingRoute(false);
      },
      (err) => {
        setLocatingRoute(false);
        toast({ title: "Could not get your location", description: err.message || "Please allow location access and try again.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

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
      const { data: customerProfile } = await supabase.from("profiles").select("phone").eq("id", req.customer_id).single();
      setCustomerPhone(customerProfile?.phone || null);
    }
  };

  useEffect(() => { if (user?.id) load(); /* eslint-disable-next-line */ }, [id, user?.id]);

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
    /* eslint-disable-next-line */
  }, [id, user?.id]);

  const submitQuote = async () => {
    if (!price || Number(price) <= 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
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
      const { error } = await supabase.from("offers").insert({
        request_id: request.id,
        driver_id: user.id,
        driver_profile_id: profile.id,
        driver_name: profile.full_name || user.full_name,
        driver_photo_url: profile.profile_picture_url || "",
        verified: profile.verification_status === "approved",
        vehicle_type: profile.vehicle_type,
        driver_rating: profile.rating_avg || 0,
        completed_jobs: profile.completed_jobs || 0,
        eta_minutes: eta ? Number(eta) : null,
        price: Number(price),
        note,
        status: "pending",
      });
      if (error) throw error;
      await createNotification(request.customer_id, "new_offer", "New offer received 💬", `A driver quoted ${formatMoney(price)} for your ${request.cargo_type} request.`, `/customer/request/${request.id}`);
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
  const nextStep = STATUS_FLOW[activeStep + 1];
  const isOpen = request.status === "open";

  return (
    <div className="p-4 pb-8 space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{request.cargo_type}</h1>
        <StatusBadge status={request.status} />
      </div>
      <p className="text-xs text-muted-foreground -mt-3">{isMyJob ? `${request.customer_name || "Customer"}` : "New request"} · {timeAgo(request.created_at)}</p>

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
              <p className="text-[11px] text-muted-foreground">PICKUP</p>
              <p className="text-sm font-medium">{request.pickup_location}</p>
              {request.pickup_lat != null && request.pickup_lng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${request.pickup_lat}&mlon=${request.pickup_lng}#map=17/${request.pickup_lat}/${request.pickup_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-0.5"
                >
                  <MapPin className="w-3 h-3" /> View exact location on map
                </a>
              )}
            </div>
            <div><p className="text-[11px] text-muted-foreground">DESTINATION</p><p className="text-sm font-medium">{request.destination}</p></div>
          </div>
        </div>
      </div>

      {/* Route to pickup */}
      {request.pickup_lat != null && request.pickup_lng != null && (
        <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Navigation className="w-4 h-4 text-primary" /> Route to pickup</h2>
            {!driverPos && (
              <button type="button" onClick={showRoute} disabled={locatingRoute} className="text-xs font-medium text-primary flex items-center gap-1">
                {locatingRoute && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {locatingRoute ? "Locating..." : "Get directions"}
              </button>
            )}
          </div>
          {driverPos ? (
            <RouteMap from={driverPos} to={{ lat: request.pickup_lat, lng: request.pickup_lng }} />
          ) : (
            <p className="text-xs text-muted-foreground">Tap "Get directions" to see the road route from your location to the pickup point.</p>
          )}
        </div>
      )}

      {/* Cargo */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-2">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Weight</p><p className="font-medium">{request.cargo_weight || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Customer budget</p><p className="font-medium text-primary">{formatMoney(request.budget)}</p></div>
          <div><p className="text-xs text-muted-foreground">Timing</p><p className="font-medium capitalize">{request.timing === "scheduled" ? formatDate(request.scheduled_date) : "Now"}</p></div>
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

      {/* Submit quote (open) */}
      {isOpen && !myOffer && (
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
          <div className="bg-white rounded-2xl border border-border p-4">
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

          <div className="bg-white rounded-2xl border border-border p-4">
            <h2 className="text-sm font-semibold mb-4">Delivery progress</h2>
            <div className="space-y-0">
              {STATUS_FLOW.map((step, i) => {
                const done = i <= activeStep;
                const current = i === activeStep && request.status !== "completed";
                return (
                  <div key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        current && "ring-4 ring-primary/20"
                      )}>
                        {done && !current ? <Check className="w-3.5 h-3.5" /> : i + 1}
                      </span>
                      {i < STATUS_FLOW.length - 1 && <span className={cn("w-0.5 h-8", done && i < activeStep ? "bg-primary" : "bg-border")} />}
                    </div>
                    <div className="pt-1 pb-2">
                      <p className={cn("text-sm font-medium", done ? "text-foreground" : "text-muted-foreground")}>{STATUS_LABELS[step]}</p>
                    </div>
                  </div>
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
