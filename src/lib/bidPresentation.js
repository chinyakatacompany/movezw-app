export function bidTonnage(offer) {
  const value = Number(offer.capacity_tonnes);
  if (Number.isFinite(value) && value > 0) return `${value} ${value === 1 ? 'tonne' : 'tonnes'}`;
  const matched = String(offer.vehicle_type || '').match(/(\d+(?:\.\d+)?)\s*ton/i);
  return matched ? `${matched[1]} ${Number(matched[1]) === 1 ? 'tonne' : 'tonnes'}` : 'Tonnage not provided';
}
