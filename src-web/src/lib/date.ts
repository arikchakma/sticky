import { DateTime } from 'luxon';

export function getRelativeTime(date: string) {
  const local = DateTime.fromISO(date).setZone('local');
  return local.toRelative();
}
