/* Reisekasse: reine Rechenfunktionen, ohne DOM und ohne Netzwerk.
   Beträge immer als ganze Rappen/Cent. Ausgleich in CHF über einen festen Reisekurs. */
(function (root) {
  'use strict';
  const CATEGORIES = Object.freeze([
    ['essen', 'Essen'],
    ['unterkunft', 'Unterkunft'],
    ['transport', 'Transport'],
    ['eintritt', 'Eintritt'],
    ['sonstiges', 'Sonstiges'],
  ]);
  const CATEGORY_IDS = CATEGORIES.map((c) => c[0]);
  const CURRENCIES = ['EUR', 'CHF'];
  const MAX_CENTS = 99999900;

  function hash(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  function validRate(rate) {
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0.1 && rate < 10;
  }

  /* Wandelt v1- und v2-Einträge in ein einheitliches v2-Objekt um. Ungültige liefern null. */
  function normalize(raw, people) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || raw.id.length > 120) return null;
    const kind = raw.kind === undefined ? 'expense' : raw.kind;
    if (kind === 'settings') {
      return validRate(raw.chf_per_eur) ? { v: 2, id: raw.id, kind, chf_per_eur: raw.chf_per_eur, updated_at: raw.updated_at || null, updated_by: raw.updated_by || null } : null;
    }
    if (kind !== 'expense' && kind !== 'settlement') return null;
    const status = raw.status === 'offen' || raw.status === 'vorgemerkt' ? raw.status : 'bezahlt';
    const cents = raw.cents === null || raw.cents === undefined ? null : raw.cents;
    if (cents === null) {
      if (kind !== 'expense' || status !== 'offen') return null;
    } else if (status === 'vorgemerkt' && kind !== 'expense') {
      return null;
    } else if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return null;
    const currency = CURRENCIES.includes(raw.currency) ? raw.currency : cents === null ? 'EUR' : null;
    if (!currency) return null;
    const e = {
      v: 2,
      id: raw.id,
      kind,
      status,
      cents,
      currency,
      rate_used: validRate(raw.rate_used) ? raw.rate_used : null,
      spent_on: /^\d{4}-\d{2}-\d{2}$/.test(raw.spent_on || '') ? raw.spent_on : null,
      charge_on: /^\d{4}-\d{2}-\d{2}$/.test(raw.charge_on || '') ? raw.charge_on : null,
      settled_on: /^\d{4}-\d{2}-\d{2}$/.test(raw.settled_on || '') ? raw.settled_on : null,
      deleted_at: raw.deleted_at || null,
      updated_at: raw.updated_at || null,
      updated_by: typeof raw.updated_by === 'string' ? raw.updated_by.slice(0, 80) : null,
    };
    if (kind === 'settlement') {
      if (!people.includes(raw.from) || !people.includes(raw.to) || raw.from === raw.to || cents === null) return null;
      e.from = raw.from;
      e.to = raw.to;
      return e;
    }
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    if (!description || description.length > 120) return null;
    const members = Array.isArray(raw.members) ? raw.members : [];
    if (!people.includes(raw.payer) || !members.length || !members.every((m) => people.includes(m)) || new Set(members).size !== members.length) return null;
    e.description = description;
    e.category = CATEGORY_IDS.includes(raw.category) ? raw.category : 'sonstiges';
    e.payer = raw.payer;
    e.members = members.slice();
    return e;
  }

  /* CHF-Betrag eines Eintrags; EUR mit dem beim Speichern verwendeten Kurs, sonst mit dem Reisekurs. */
  function chfCents(entry, tripRate) {
    if (entry.cents === null) return null;
    if (entry.currency === 'CHF') return entry.cents;
    const rate = entry.rate_used || tripRate;
    return validRate(rate) ? Math.round(entry.cents * rate) : null;
  }

  /* Gleichmässige Aufteilung; Restrappen rotierend ab einer vom Eintrag abhängigen Person. */
  function split(cents, members, seed) {
    const n = members.length;
    const base = Math.floor(cents / n);
    let rest = cents - base * n;
    const start = hash(seed) % n;
    const out = {};
    members.forEach((m) => (out[m] = base));
    for (let i = 0; rest > 0; i++, rest--) out[members[(start + i) % n]] += 1;
    return out;
  }

  function active(entries) {
    return entries.filter((e) => e && !e.deleted_at && e.kind !== 'settings');
  }

  /* Bilanz der Gruppe. Nur abgerechnete Einträge zählen im Ausgleich; vorgemerkte (gebucht, noch nicht belastet)
     erscheinen separat als planned/plannedShare/plannedByCategory. missingRate = EUR ohne Reisekurs. */
  function summarize(entries, people, tripRate) {
    const net = {}, share = {}, byCategory = {}, plannedShare = {}, plannedByCategory = {};
    people.forEach((p) => { net[p] = 0; share[p] = 0; byCategory[p] = {}; plannedShare[p] = 0; plannedByCategory[p] = {}; });
    let total = 0, missingRate = 0, planned = 0;
    for (const e of active(entries)) {
      if (e.status === 'offen' || e.cents === null) continue;
      const chf = chfCents(e, tripRate);
      if (chf === null) { missingRate++; continue; }
      if (e.status === 'vorgemerkt') {
        planned += chf;
        for (const [p, c] of Object.entries(split(chf, e.members, e.id))) {
          plannedShare[p] += c;
          plannedByCategory[p][e.category] = (plannedByCategory[p][e.category] || 0) + c;
        }
        continue;
      }
      if (e.kind === 'settlement') {
        net[e.from] += chf;
        net[e.to] -= chf;
        continue;
      }
      total += chf;
      net[e.payer] += chf;
      const parts = split(chf, e.members, e.id);
      for (const [p, c] of Object.entries(parts)) {
        net[p] -= c;
        share[p] += c;
        byCategory[p][e.category] = (byCategory[p][e.category] || 0) + c;
      }
    }
    return { net, share, byCategory, total, missingRate, planned, plannedShare, plannedByCategory, transfers: transfers(net, people) };
  }

  /* Wenige Ausgleichszahlungen: Schuldner und Gläubiger absteigend paaren. */
  function transfers(net, people) {
    const debtors = people.filter((p) => net[p] < 0).map((p) => ({ p, c: -net[p] })).sort((a, b) => b.c - a.c);
    const creditors = people.filter((p) => net[p] > 0).map((p) => ({ p, c: net[p] })).sort((a, b) => b.c - a.c);
    const out = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const c = Math.min(debtors[i].c, creditors[j].c);
      if (c > 0) out.push({ from: debtors[i].p, to: creditors[j].p, cents: c });
      debtors[i].c -= c;
      creditors[j].c -= c;
      if (!debtors[i].c) i++;
      if (!creditors[j].c) j++;
    }
    return out;
  }

  function parseAmount(text) {
    const clean = String(text || '').trim().replace(/[’'\s]/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
    const cents = Math.round(Number(clean) * 100);
    return cents > 0 && cents <= MAX_CENTS ? cents : null;
  }

  function format(cents) {
    const sign = cents < 0 ? '−' : '';
    const abs = Math.abs(cents);
    const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
    return sign + whole + '.' + String(abs % 100).padStart(2, '0');
  }

  function categoryLabel(id) {
    const c = CATEGORIES.find((x) => x[0] === id);
    return c ? c[1] : 'Sonstiges';
  }

  const api = Object.freeze({ CATEGORIES, CURRENCIES, normalize, chfCents, split, summarize, transfers, parseAmount, format, categoryLabel, validRate });
  root.WebKitLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
