import type { Load } from '@/lib/ledger';
import type { VehicleLite } from '@/types/domain';
import { pick } from '@/lib/api/list';
import { formatDate } from '@/lib/formatters';
import { staleWork, staleLabel } from '@/lib/staleWork';

// "Doing now" for a truck: what the open order naming it says it is doing. Port
// of the web Vehicles page (pages/Vehicles.tsx doingNow). The status on a truck
// is set by hand and is often wrong, so a status the orders contradict is said
// plainly, never shown as normal.

/** Orders that put a truck and a driver on the road. */
const ACTIVE_LOAD = ['ASSIGNED', 'LOADING', 'IN_TRANSIT'];

export interface DoingNow {
  text: string;
  sub?: string;
  /** warn: the status and the orders disagree, or the order was left open. */
  tone: 'normal' | 'warn';
}

/**
 * The open order naming each truck. A current order wins over a stale one, so a
 * truck is only shown as stale when every order it is on has been left open.
 */
export function activeLoadByVehicle(loads: readonly Load[]): Map<number, Load> {
  const byVehicle = new Map<number, Load>();
  for (const l of loads) {
    if (l.vehicle == null || !ACTIVE_LOAD.includes(String(l.status).toUpperCase())) continue;
    const k = Number(l.vehicle);
    const had = byVehicle.get(k);
    if (!had || (staleWork(had) && !staleWork(l))) byVehicle.set(k, l);
  }
  return byVehicle;
}

const isFree = (s: string) => s === 'AVAILABLE' || s === 'ACTIVE';
const isShop = (s: string) => s === 'MAINTENANCE' || s === 'OUT_OF_SERVICE';

export function doingNow(v: VehicleLite, load: Load | undefined): DoingNow | null {
  const driver = String(pick(v.raw, ['driver_name']) ?? '') || load?.driver_name || '';
  if (load) {
    const stale = staleWork(load);
    if (stale) {
      return {
        text: `${driver ? `${driver} · ` : ''}order left open`,
        sub: staleLabel(stale).text,
        tone: 'warn',
      };
    }
    const to = load.delivery_city || load.delivery_location;
    const sub = [to ? `to ${to}` : '', load.customer_name].filter(Boolean).join(' · ');
    if (v.status !== 'IN_USE') {
      const as = isShop(v.status) ? 'In maintenance' : 'Marked available';
      return { text: `${as} · on ${load.load_number || 'an open order'}`, sub: sub || undefined, tone: 'warn' };
    }
    return {
      text: driver || 'No driver on the order',
      sub: sub || undefined,
      tone: driver ? 'normal' : 'warn',
    };
  }
  if (v.status === 'IN_USE') return { text: 'Marked in use · no current order', tone: 'warn' };
  if (isShop(v.status)) {
    const since = String(pick(v.raw, ['last_maintenance_date']) ?? '');
    return {
      text:
        v.status === 'OUT_OF_SERVICE'
          ? 'Out of service'
          : since
            ? `In the workshop since ${formatDate(since)}`
            : 'In the workshop',
      tone: 'normal',
    };
  }
  if (isFree(v.status)) return { text: driver ? `Free, ${driver} assigned` : 'Free', tone: 'normal' };
  return null;
}
