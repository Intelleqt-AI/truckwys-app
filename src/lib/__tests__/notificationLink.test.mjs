// Notification links → app routes, incl. the quote follow-up events.
//   node --test src/lib/__tests__/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationLink, pushChannelFor } from '../notificationLink.ts';

test('quote.fuel_alert opens the fuel alert sheet', () => {
  assert.deepEqual(resolveNotificationLink('/bookings/quotes?fuel_alert=4'), { screen: 'FuelAlert', params: { id: 4 } });
  assert.deepEqual(resolveNotificationLink('https://app.truckwys.com/bookings/quotes?fuel_alert=12'), {
    screen: 'FuelAlert',
    params: { id: 12 },
  });
  // A bad id falls back to the quotes list, never a load called "quotes".
  assert.deepEqual(resolveNotificationLink('/bookings/quotes?fuel_alert=abc'), {
    screen: 'Tabs',
    params: { screen: 'Bookings', params: { tab: 'quotes' } },
  });
  assert.deepEqual(resolveNotificationLink('/bookings/quotes'), {
    screen: 'Tabs',
    params: { screen: 'Bookings', params: { tab: 'quotes' } },
  });
});

test('quote.expiring / quote.no_answer open the quote at its follow-up card', () => {
  assert.deepEqual(resolveNotificationLink('/bookings/quotes/9?follow_up=1'), {
    screen: 'QuoteDetail',
    params: { id: '9', followUp: true },
  });
  assert.deepEqual(resolveNotificationLink('/bookings/quotes/9'), { screen: 'QuoteDetail', params: { id: '9' } });
  assert.deepEqual(resolveNotificationLink('/bookings/12'), { screen: 'LoadDetail', params: { id: '12' } });
  assert.deepEqual(resolveNotificationLink('/quotes/new'), { screen: 'CreateQuote' });
});

test('follow-up events use the existing quotes channel', () => {
  assert.equal(pushChannelFor('quote.fuel_alert'), 'bookings');
  assert.equal(pushChannelFor('quote.expiring'), 'bookings');
  assert.equal(pushChannelFor('quote.no_answer'), 'bookings');
  assert.equal(pushChannelFor('invoice.paid'), 'finance');
  assert.equal(pushChannelFor('quote.no_answer', 'fleet'), 'fleet');
  assert.equal(pushChannelFor('quote.no_answer', 'nonsense'), 'bookings');
  assert.equal(pushChannelFor(undefined), 'bookings');
});
