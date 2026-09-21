export const JOB_CAPACITY_GROUPS = [
  {
    id: "pickup-15",
    label: "Pickup to 15 ton",
    minTons: 0,
    maxTons: 15,
    vehicleTypes: [
      "Small Delivery Vehicle",
      "Pickup",
      "Cargo Van",
      "1 Ton Truck",
      "3 Ton Truck",
      "5 Ton Truck",
      "10 Ton Truck",
      "15 Ton Truck",
    ],
  },
  {
    id: "16-40",
    label: "16 to 40 ton",
    minTons: 16,
    maxTons: 40,
    vehicleTypes: [
      "16 Ton Truck",
      "20 Ton Truck",
      "30 Ton Truck",
      "40 Ton Truck",
      "Articulated Truck",
    ],
  },
];

export const VEHICLE_TYPES = JOB_CAPACITY_GROUPS.flatMap((group) => group.vehicleTypes);

export const VEHICLE_ICONS = {
  "Small Delivery Vehicle": "🚗",
  Pickup: "🛻",
  "Cargo Van": "🚐",
  "1 Ton Truck": "🚚",
  "3 Ton Truck": "🚚",
  "5 Ton Truck": "🚚",
  "10 Ton Truck": "🚛",
  "15 Ton Truck": "🚛",
  "16 Ton Truck": "🚛",
  "20 Ton Truck": "🚛",
  "30 Ton Truck": "🚛",
  "40 Ton Truck": "🚛",
  "Articulated Truck": "🚛",
};

export const VEHICLE_CAPACITY_TONS = {
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

export function cargoWeightTons(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value / 1000 : null;
  const text = String(value).trim().toLowerCase().replaceAll(",", "");
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return /\b(t|ton|tons|tonne|tonnes)\b/.test(text) ? amount : amount / 1000;
}

export function requiredCapacityTons(request) {
  const vehicleTons = VEHICLE_CAPACITY_TONS[request?.vehicle_type] ?? null;
  const weightTons = cargoWeightTons(request?.cargo_weight);
  if (vehicleTons == null) return weightTons;
  if (weightTons == null) return vehicleTons;
  return Math.max(vehicleTons, weightTons);
}

export function capacityGroupForTons(tons) {
  if (tons == null) return null;
  return JOB_CAPACITY_GROUPS.find((group) => tons >= group.minTons && tons <= group.maxTons) ?? null;
}

export function jobCapacityGroup(request) {
  return capacityGroupForTons(requiredCapacityTons(request));
}

export function vehicleFitsRequest(driverVehicleType, request) {
  const driverTons = VEHICLE_CAPACITY_TONS[driverVehicleType] ?? null;
  const requiredTons = requiredCapacityTons(request);

  // Preserve visibility for legacy rows that pre-date vehicle requirements,
  // while ensuring every newly categorized request is capacity matched.
  if (requiredTons == null) return Boolean(driverVehicleType);
  if (driverTons == null || requiredTons > 40) return false;

  const driverGroup = capacityGroupForTons(driverTons);
  const requestGroup = capacityGroupForTons(requiredTons);
  return driverGroup?.id === requestGroup?.id && driverTons >= requiredTons;
}
