const VEHICLE_CAPACITY_TONS: Record<string, number> = {
  "Small Delivery Vehicle": 0.5,
  Pickup: 1,
  "Cargo Van": 1.5,
  "1 Ton Truck": 1,
  "3 Ton Truck": 3,
  "5 Ton Truck": 5,
  "10 Ton Truck": 10,
  "15 Ton Truck": 15,
  "16 Ton Truck": 16,
  "20 Ton Truck": 20,
  "30 Ton Truck": 30,
  "40 Ton Truck": 40,
  "Articulated Truck": 40,
};

function cargoWeightTons(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value / 1000 : null;
  const text = String(value).trim().toLowerCase().replaceAll(",", "");
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return /\b(t|ton|tons|tonne|tonnes)\b/.test(text) ? amount : amount / 1000;
}

function groupForTons(tons: number | null): "pickup-15" | "16-40" | null {
  if (tons == null) return null;
  if (tons <= 15) return "pickup-15";
  if (tons <= 40) return "16-40";
  return null;
}

export function driverVehicleFitsRequest(
  driverVehicleType: string | null | undefined,
  request: { vehicle_type?: string | null; cargo_weight?: unknown },
): boolean {
  const driverTons = driverVehicleType ? VEHICLE_CAPACITY_TONS[driverVehicleType] ?? null : null;
  const vehicleTons = request.vehicle_type ? VEHICLE_CAPACITY_TONS[request.vehicle_type] ?? null : null;
  const weightTons = cargoWeightTons(request.cargo_weight);
  const requiredTons = vehicleTons == null ? weightTons : weightTons == null ? vehicleTons : Math.max(vehicleTons, weightTons);
  if (requiredTons == null) return Boolean(driverVehicleType);
  if (driverTons == null || requiredTons > 40) return false;
  return groupForTons(driverTons) === groupForTons(requiredTons) && driverTons >= requiredTons;
}
