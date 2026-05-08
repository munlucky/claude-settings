export function createClock(now = () => new Date()) {
  if (typeof now !== 'function') {
    throw new TypeError('clock provider must be a function');
  }

  return {
    nowDate() {
      return normalizeDate(now());
    },
    nowMs() {
      return this.nowDate().getTime();
    },
    nowIso() {
      return nowIso(this);
    },
    nowIsoSeconds() {
      return nowIsoSeconds(this);
    },
    isFutureIso(value, toleranceMs = 5000) {
      const candidate = Date.parse(String(value || '').trim().replace(/^"|"$/g, ''));
      if (!Number.isFinite(candidate)) {
        return false;
      }
      return candidate > this.nowMs() + toleranceMs;
    },
  };
}

export function nowIso(clock = createClock()) {
  return normalizeClock(clock).nowDate().toISOString();
}

export function nowIsoSeconds(clock = createClock()) {
  return nowIso(clock).replace(/\.\d{3}Z$/, 'Z');
}

export function nowMs(clock = createClock()) {
  return normalizeClock(clock).nowMs();
}

function normalizeClock(clock) {
  if (clock && typeof clock.nowDate === 'function') {
    return clock;
  }
  if (typeof clock === 'function') {
    return createClock(clock);
  }
  return createClock();
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('clock provider returned an invalid date');
  }
  return date;
}
