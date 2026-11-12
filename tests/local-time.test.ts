// Home's "Last Updated" line shows the time in the device's own time zone, never fixed to GMT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localTimestamp } from '../src/engine/util.ts';

const AT = Date.UTC(2026, 10, 12, 7, 27, 2, 413); // 07:27:02.413 GMT

test('localTimestamp uses the device time zone and names it', (t) => {
  const tz = process.env.TZ;
  t.after(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });
  const cases: Array<[string, string]> = [
    ['Asia/Singapore', '2026-11-12 15:27:02.413 GMT+8'],
    ['America/New_York', '2026-11-12 02:27:02.413 EST'],
    ['Asia/Kolkata', '2026-11-12 12:57:02.413 GMT+5:30'],
    ['Pacific/Kiritimati', '2026-11-12 21:27:02.413 GMT+14'],
    ['America/Los_Angeles', '2026-11-11 23:27:02.413 PST'], // the day before, in local time
  ];
  for (const [zone, want] of cases) {
    process.env.TZ = zone;
    assert.equal(localTimestamp(AT), want, zone);
  }
});
