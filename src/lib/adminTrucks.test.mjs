import test from 'node:test';
import assert from 'node:assert/strict';
import { truckAvailability, truckMatches, truckTonnageCounts } from './adminTrucks.js';
import { bidTonnage } from './bidPresentation.js';
const truck = { verification_status: 'approved', availability_status: 'online' };
const account = { is_suspended: false, deleted_at: null };
test('online rejected, pending and suspended drivers are not available', () => {
  for (const verification_status of ['pending', 'rejected']) assert.equal(truckAvailability({ ...truck, verification_status }, account), 'unavailable');
  assert.equal(truckAvailability(truck, { ...account, is_suspended: true }), 'unavailable');
  assert.equal(truckAvailability(truck, { ...account, deleted_at: '2026-10-28' }), 'unavailable');
  assert.equal(truckAvailability(truck, undefined), 'unavailable');
});
test('active jobs override an online or offline toggle', () => {
  assert.equal(truckAvailability(truck, account, true), 'busy');
  assert.equal(truckAvailability({ ...truck, availability_status: 'offline' }, account, true), 'busy');
  assert.equal(truckAvailability(truck, account), 'available');
  assert.equal(truckAvailability({ ...truck, availability_status: 'busy' }, account), 'busy');
  assert.equal(truckAvailability({ ...truck, availability_status: null }, account), 'offline');
});
test('truck search matches plate, driver, area and type without case sensitivity', () => {
  const row = { license_plate: 'AEG5748', full_name: 'Example Driver', location_area: 'Harare', vehicle_type: '3 Ton Truck' };
  for (const term of [' aeg5748 ', 'DRIVER', 'harare', '3 ton', '']) assert.equal(truckMatches(row, term), true);
  assert.equal(truckMatches(row, 'Bulawayo'), false);
  assert.equal(truckMatches({}, 'AEG'), false);
});
test('capacity uses explicit payload, preserves decimals and labels unknown capacity', () => {
  assert.equal(bidTonnage({ capacity_tonnes: 3.5, vehicle_type: '3 Ton Truck' }), '3.5 tonnes');
  assert.equal(bidTonnage({ capacity_tonnes: null, vehicle_type: '3 Ton Truck' }), '3 tonnes');
  assert.equal(bidTonnage({ capacity_tonnes: null, vehicle_type: 'Pickup' }), 'Tonnage not provided');
});

test('bar chart groups equal capacities, sorts numerically and separates unknown tonnage', () => {
  assert.deepEqual(truckTonnageCounts([
    {capacity_tonnes: 20}, {capacity_tonnes: '3'}, {vehicle_type: '3 Ton Truck'},
    {capacity_tonnes: 0.5}, {vehicle_type: 'Pickup'}, {capacity_tonnes: -2},
  ]), [{tonnage: '0.5 t', trucks: 1}, {tonnage: '3 t', trucks: 2}, {tonnage: '20 t', trucks: 1}, {tonnage: '30 t', trucks: 0}, {tonnage: 'Not provided', trucks: 1}, {tonnage: 'Pickup', trucks: 1}, {tonnage: 'Articulated Truck', trucks: 0}, {tonnage: 'Cargo Van', trucks: 0}]);
  assert.deepEqual(truckTonnageCounts([]), [{tonnage: '30 t', trucks: 0}, {tonnage: 'Pickup', trucks: 0}, {tonnage: 'Articulated Truck', trucks: 0}, {tonnage: 'Cargo Van', trucks: 0}]);
});

test('named vehicle categories remain separate even with recorded tonnage and count each vehicle once', () => {
  const rows = [{vehicle_type: 'Pickup', capacity_tonnes: 1}, {vehicle_type: 'Articulated Truck', capacity_tonnes: 30}, {vehicle_type: ' cargo van ', capacity_tonnes: 3}, {vehicle_type: '3 Ton Truck', capacity_tonnes: 3}];
  const chart = truckTonnageCounts(rows);
  assert.deepEqual(chart, [{tonnage: '3 t', trucks: 1}, {tonnage: '30 t', trucks: 0}, {tonnage: 'Pickup', trucks: 1}, {tonnage: 'Articulated Truck', trucks: 1}, {tonnage: 'Cargo Van', trucks: 1}]);
  assert.equal(chart.reduce((total, row) => total + row.trucks, 0), rows.length);
});

test('30 tonne trucks have a dedicated capacity group', () => {
  const chart = truckTonnageCounts([{vehicle_type: '30 Ton Truck'}, {capacity_tonnes: 30, vehicle_type: '30 Ton Truck'}]);
  assert.equal(chart.find((row) => row.tonnage === '30 t').trucks, 2);
});
