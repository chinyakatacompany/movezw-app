import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReferralCode, driverReferralLink } from './referrals.js';
test('referral link uses public MoveZW host and preserves driver signup code', () => {
  const url=new URL(driverReferralLink(' mzwabcdef123456 '));
  assert.equal(url.origin,'https://www.movezw.co.zw');
  assert.equal(url.pathname,'/register');
  assert.equal(url.searchParams.get('role'),'driver');
  assert.equal(url.searchParams.get('ref'),'MZWABCDEF123456');
  assert.equal(normalizeReferralCode(null),'');
});
