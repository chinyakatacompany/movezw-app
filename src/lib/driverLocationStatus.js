export const DRIVER_LOCATION_STATUS_EVENT = 'movezw-driver-location-status';

export function reportDriverLocationStatus(ready, message = '') {
  window.dispatchEvent(new CustomEvent(DRIVER_LOCATION_STATUS_EVENT, { detail: { ready, message } }));
}

export function driverLocationRequired(availability, activeRequestId) {
  return availability === 'online' || Boolean(activeRequestId);
}
