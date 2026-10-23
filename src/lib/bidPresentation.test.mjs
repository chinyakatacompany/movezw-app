import test from 'node:test';
import assert from 'node:assert/strict';
import { bidTonnage } from './bidPresentation.js';
test('bid capacity uses recorded payload, with legacy vehicle fallback',()=>{
 assert.equal(bidTonnage({capacity_tonnes:3,vehicle_type:'Cargo Van'}),'3 tonnes');
 assert.equal(bidTonnage({vehicle_type:'1 Ton Truck'}),'1 tonne');
 assert.equal(bidTonnage({vehicle_type:'30 Ton Truck'}),'30 tonnes');
 assert.equal(bidTonnage({vehicle_type:'Pickup'}),'Tonnage not provided');
 assert.equal(bidTonnage({capacity_tonnes:-5,vehicle_type:'Pickup'}),'Tonnage not provided');
});
