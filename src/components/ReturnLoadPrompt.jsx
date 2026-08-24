import { useState } from "react";
import { Truck, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createReturnLoad } from "@/lib/matching";
import { VEHICLE_TYPES } from "@/lib/movezw";
import { toast } from "@/components/ui/use-toast";

function todayLocalDate() {
  const d = new Date();
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffsetMs).toISOString().slice(0, 10);
}

// Shown right after a driver marks a job "Delivered" — that's the exact
// moment they know their return route, instead of relying on them to
// remember to go post one later from the Return Loads tab. origin defaults
// to the job's destination (where they physically are right now); everything
// else pre-fills from their driver profile so this is a couple of taps, not
// a full form.
export default function ReturnLoadPrompt({ job, profile, driverId, onClose }) {
  const [destination, setDestination] = useState("");
  const [availableCapacityKg, setAvailableCapacityKg] = useState("");
  const [price, setPrice] = useState("");
  const [departureDate, setDepartureDate] = useState(todayLocalDate());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const origin = job.destination;

  const handlePost = async (e) => {
    e.preventDefault();
    if (!destination || !availableCapacityKg || !price || !departureDate) {
      setError("Please fill in where you're heading, your available space, and a price.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createReturnLoad({
        driver_id: driverId,
        driver_profile_id: profile?.id || undefined,
        driver_name: profile?.full_name || "Driver",
        driver_photo_url: profile?.profile_picture_url || undefined,
        verified: profile?.verification_status === "approved",
        vehicle_type: profile?.vehicle_type || VEHICLE_TYPES[0],
        origin,
        destination,
        departure_date: new Date(departureDate).toISOString(),
        available_capacity_kg: Number(availableCapacityKg),
        price: Number(price),
        status: "open",
      });
      toast({ title: "Return load listed", description: "Customers heading your way can now book your space." });
      onClose(true);
    } catch (err) {
      setError("Something went wrong posting your return load. You can try again from the Return Loads tab.");
      console.error("Failed to create return load:", err);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => onClose(false)} />
      <div className="relative bg-card border border-border rounded-2xl card-shadow-lg p-5 w-full sm:max-w-md animate-rise">
        <div className="flex items-start justify-between mb-1">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <button onClick={() => onClose(false)} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-lg font-bold mt-2">Heading back to {origin}?</h2>
        <p className="text-sm text-muted-foreground mb-4">List your return trip and earn extra on the way back — takes 20 seconds.</p>

        <form onSubmit={handlePost} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="rl-destination">Where are you heading?</Label>
            <Input id="rl-destination" required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={origin} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rl-date">Departure date</Label>
              <Input id="rl-date" type="date" required value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rl-capacity">Space (kg)</Label>
              <Input id="rl-capacity" type="number" min="0" required value={availableCapacityKg} onChange={(e) => setAvailableCapacityKg(e.target.value)} placeholder="500" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rl-price">Price (USD)</Label>
            <Input id="rl-price" type="number" min="0" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="15" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full h-12 font-semibold" disabled={submitting}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Posting…</> : "Post return load"}
          </Button>
          <button type="button" onClick={() => onClose(false)} className="w-full text-sm text-muted-foreground py-2">
            Not this time
          </button>
        </form>
      </div>
    </div>
  );
}
