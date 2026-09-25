// Bramblewood fixtures: Overview (team cards) and Fixtures (list or calendar) for every team.
// The build (scripts/build.py) inlines the data as JSON in #fixtures-data; nothing is fetched.
(() => {
  "use strict";

  const DATA = JSON.parse(document.getElementById("fixtures-data").textContent);
  const $ = (id) => document.getElementById(id);

  // ── Team colours: one colour family per league ─────────────────────────
  // Leagues take families in order of first appearance in data/teams.yaml; within a league,
  // shades run Men's → Mixed → Ladies. Every shade reads as a dot (≥ 3:1) on light and dark
  // surfaces, and shades within a family differ mostly by hue so they stay tellable apart.
  // Home/Away is shown by shape (filled/outline), never by colour, so it can't clash with these.
  const FAMILIES = [ // shade sets for a league with 1, 2 or 3 teams
    { 1: ["#009c66"], 2: ["#2b8f22", "#0ca397"], 3: ["#2b8f22", "#009c66", "#0ca397"] }, // greens
    { 1: ["#d24c49"], 2: ["#c54064", "#de6129"], 3: ["#be3e72", "#d6504c", "#da6900"] }, // reds
    { 1: ["#0683df"], 2: ["#0882b0", "#5e84f2"], 3: ["#0681a1", "#0986e4", "#7480f3"] }, // blues
    { 1: ["#a55bc5"], 2: ["#855bcd", "#c55fb9"], 3: ["#745dd0", "#a95ec8", "#cf5dac"] }, // purples
  ];
  // Only used if a league has more teams, or there are more leagues, than the families cover.
  const FALLBACK = ["#64748b", "#b45309", "#0f766e", "#9f1239", "#4338ca", "#4d7c0f"];
  const TYPE_ORDER = { "Men's": 0, Mixed: 1, Ladies: 2 };

  function assignColours(teams) {
    const leagues = [];
    for (const t of teams) if (!leagues.includes(t.league)) leagues.push(t.league);
    let spare = 0;
    leagues.forEach((league, li) => {
      const members = teams.filter((t) => t.league === league)
        .map((t, i) => ({ t, i })) // stable: teams.yaml order breaks ties
        .sort((a, b) => (TYPE_ORDER[a.t.type] ?? 9) - (TYPE_ORDER[b.t.type] ?? 9) || a.i - b.i);
      const shades = FAMILIES[li]?.[members.length];
      members.forEach(({ t }, i) => { t.color = shades ? shades[i] : FALLBACK[spare++ % FALLBACK.length]; });
    });
  }

  /** Tiny element builder: el("div", {class: "x", onclick: fn}, child, ...) */
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) if (c != null && c !== false) node.append(c);
    return node;
  };

  // ── Dates (all local, as YYYY-MM-DD strings) ──────────────────────────
  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const TODAY = isoDate(new Date());
  const fmt = (opts) => new Intl.DateTimeFormat("en-GB", opts);
  const F_MONTH = fmt({ month: "long", year: "numeric" });
  const F_MONTH_SHORT = fmt({ month: "short" });
  const F_DOW = fmt({ weekday: "short" });
  const F_LONG = fmt({ weekday: "long", day: "numeric", month: "long" });
  const F_MED = fmt({ weekday: "short", day: "numeric", month: "short" });

  // ── Fixtures model: data, formatting, filter state ↔ URL ──────────────
  // Views: "overview" (default, clean URL), "list", "calendar".
  // Overview ↔ Fixtures is a page change (pushState, so Back works); filter changes replace the URL.
  const F = (() => {
    const VIEWS = ["overview", "list", "calendar"];
    const DEFAULT_VIEW = "overview";
    const { teams, fixtures, home } = DATA;
    assignColours(teams);
    const teamByCode = new Map(teams.map((t) => [t.code, t]));
    const teamBySlug = new Map(teams.map((t) => [t.slug, t]));
    fixtures.forEach((f) => { f.teamObj = teamByCode.get(f.team); });

    const months = [...new Set(fixtures.map((f) => f.date.slice(0, 7)))].sort();
    const firstMonth = months[0], lastMonth = months[months.length - 1];
    const clampMonth = (m) => (m < firstMonth ? firstMonth : m > lastMonth ? lastMonth : m);
    const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || "");
    const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && isoDate(parseDate(d)) === d;
    const defaultMonth = () => clampMonth(TODAY.slice(0, 7));
    const state = { teams: new Set(), ha: "", view: DEFAULT_VIEW, hidePast: false, month: null, day: null };
    const isOv = (v) => v === "overview";

    // Invalid values are ignored; month is clamped to the season; day must fall in that month.
    function readUrl(p) {
      state.teams = new Set((p.get("teams") || "").split(",").filter((s) => teamBySlug.has(s)));
      state.ha = ["H", "A"].includes(p.get("ha")) ? p.get("ha") : "";
      state.view = VIEWS.includes(p.get("view")) ? p.get("view") : DEFAULT_VIEW;
      state.hidePast = p.get("past") === "hide";
      state.month = validMonth(p.get("month")) ? clampMonth(p.get("month")) : null;
      state.day = null;
      if (validDay(p.get("day"))) {
        const d = p.get("day");
        if (!state.month) state.month = clampMonth(d.slice(0, 7));
        if (d.slice(0, 7) === state.month) state.day = d;
      }
      if (!state.month) state.month = defaultMonth();
    }
    readUrl(new URLSearchParams(location.search));

    const listeners = [];
    let lastView = state.view;
    function writeUrl() {
      const p = new URLSearchParams();
      if (state.teams.size) p.set("teams", [...state.teams].join(","));
      if (state.ha) p.set("ha", state.ha);
      if (state.view !== DEFAULT_VIEW) p.set("view", state.view);
      if (state.hidePast) p.set("past", "hide");
      if (state.view === "calendar") {
        p.set("month", state.month);
        if (state.day && state.day.slice(0, 7) === state.month) p.set("day", state.day);
      }
      const qs = p.toString().replace(/%2C/g, ",");
      const url = qs ? `?${qs}` : location.pathname;
      if (isOv(lastView) !== isOv(state.view)) history.pushState(null, "", url);
      else history.replaceState(null, "", url);
      lastView = state.view;
    }
    window.addEventListener("popstate", () => {
      readUrl(new URLSearchParams(location.search));
      lastView = state.view;
      listeners.forEach((fn) => fn(state, { popstate: true }));
    });

    const icsUrl = (slug) => new URL(`calendar/${slug}.ics`, location.href).href;
    const webcalUrl = (slug) => icsUrl(slug).replace(/^https?:/, "webcal:");
    const filtered = () => fixtures.filter((f) =>
      (!state.teams.size || state.teams.has(f.teamObj.slug)) && (!state.ha || f.homeAway === state.ha));
    const nextMatch = (list = filtered()) => list.find((f) => f.date >= TODAY) || null;
    // Season label ("2026/27") of the next match, else of the last one.
    const seasonOf = (f) => (f ? `20${f.season}` : "");

    const api = {
      data: DATA, teams, fixtures, home, teamBySlug, state, firstMonth, lastMonth, TODAY, isOv,
      season: seasonOf(nextMatch(fixtures) || fixtures[fixtures.length - 1]),
      parseDate, monthKey: (iso) => iso.slice(0, 7),
      fmtMonth: (iso) => F_MONTH.format(parseDate(iso.length === 7 ? iso + "-01" : iso)),
      fmtMonthShort: (iso) => F_MONTH_SHORT.format(parseDate(iso)),
      fmtDow: (iso) => F_DOW.format(parseDate(iso)),
      fmtLong: (iso) => F_LONG.format(parseDate(iso)),
      fmtMed: (iso) => F_MED.format(parseDate(iso)),
      fmtTime: (t) => {
        if (!t) return "Time TBC";
        const [h, m] = t.split(":").map(Number);
        return `${h % 12 || 12}${m ? ":" + pad(m) : ""}${h < 12 ? "am" : "pm"}`;
      },
      isPast: (f) => f.date < TODAY,
      haLabel: (f) => (f.homeAway === "H" ? "Home" : "Away"),
      venueText: (f) => [f.venueName, f.address].filter(Boolean).join(", "),
      mapUrl: (f) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([f.venueName, f.address].filter(Boolean).join(", "))}`,
      icsUrl, webcalUrl,
      googleCalUrl: (slug) => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(slug))}`,
      daysUntil: (iso) => Math.round((parseDate(iso) - parseDate(TODAY)) / 86400000),
      groupBy: (list, keyFn) => {
        const m = new Map();
        for (const x of list) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
        return m;
      },
      shiftMonth: (key, delta) => {
        const [y, m] = key.split("-").map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      },
      /** Monday-first grid of ISO dates covering the month (whole weeks). */
      monthGrid: (key) => {
        const [y, m] = key.split("-").map(Number);
        const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
        const cells = Math.ceil((offset + new Date(y, m, 0).getDate()) / 7) * 7;
        return Array.from({ length: cells }, (_, i) => {
          const d = new Date(y, m - 1, 1 - offset + i);
          return { iso: isoDate(d), day: d.getDate(), inMonth: d.getMonth() === m - 1 };
        });
      },
      filtered, nextMatch,
      visible: () => filtered().filter((f) => !state.hidePast || f.date >= TODAY),
      nextByTeam: () => new Map(teams.map((t) => [t.code, fixtures.find((f) => f.team === t.code && f.date >= TODAY) || null])),
      toggleTeam(slug) { state.teams.has(slug) ? state.teams.delete(slug) : state.teams.add(slug); api.changed(); },
      set(patch) { Object.assign(state, patch); api.changed(); },
      onChange(fn) { listeners.push(fn); },
      changed() { state.month = clampMonth(state.month || defaultMonth()); writeUrl(); listeners.forEach((fn) => fn(state)); },
      lastUpdated: new Date(DATA.generated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    };
    return api;
  })();
  const { isOv } = F;

  // ── UI state ──────────────────────────────────────────────────────────
  let fixturesView = F.state.view === "calendar" ? "calendar" : "list"; // remembered for the Fixtures tab
  // Overview URLs are always clean; the Fixtures selection is remembered here for the session.
  const snapshot = () => ({ teams: new Set(F.state.teams), ha: F.state.ha, hidePast: F.state.hidePast, month: F.state.month, day: F.state.day });
  const CLEAN = { teams: new Set(), ha: "", hidePast: false, day: null };
  let fixturesSel = snapshot();
  if (isOv(F.state.view)) Object.assign(F.state, CLEAN); // e.g. ?teams=x with no view: keep filters out of Overview
  const goOverview = () => { fixturesSel = snapshot(); F.set({ view: "overview", ...CLEAN }); };
  const goFixtures = () => F.set({ view: fixturesView, ...fixturesSel, teams: new Set(fixturesSel.teams) });
  let pendingFocus = null;   // selector to focus after the next render (overrides focus restore)
  let pendingScroll = null;  // () => void, run after the next render
  let revealChip = null;     // data-k of a team chip to keep in view
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const smooth = () => (reduceMotion() ? "auto" : "smooth");

  // ── Icons ──────────────────────────────────────────────────────────────
  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>',
    away: '<path d="M5 12h12"/><path d="m13 6 6 6-6 6"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    google: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17"/><path d="M12 13v5M9.5 15.5h5"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14c2.3.2 4 1.7 4.5 4.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    external: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  };
  const icon = (name, cls = "ico") =>
    el("span", { class: cls, "aria-hidden": "true", html:
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>` });

  // ── Small builders ─────────────────────────────────────────────────────
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : word.endsWith("ch") ? "es" : "s"}`;
  const tc = (team) => `--tc:${team.color}`;
  const badge = (team, extra = "") =>
    el("span", { class: `badge ${extra}`, style: tc(team) }, el("span", { class: "dot", "aria-hidden": "true" }), team.code);
  const haPill = (f) =>
    el("span", { class: `ha ha--${f.homeAway}` }, icon(f.homeAway === "H" ? "home" : "away"), F.haLabel(f));
  // Countdown only when it adds something (≤ 14 days); otherwise the date tile says enough.
  const whenText = (iso) => {
    const d = F.daysUntil(iso);
    return d < 0 || d > 14 ? null : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`;
  };
  const countdown = (iso, cls = "countdown") => { const w = whenText(iso); return w ? el("span", { class: cls }, w) : null; };
  // Items joined by "·". Separators hang off the left edge and are clipped, so one never starts or ends a line.
  const seps = (cls, items) =>
    el("span", { class: `seps ${cls}` }, el("span", { class: "seps-in" },
      items.filter(Boolean).map((x) => el("span", { class: "sep-item" }, x))));

  function venue(f, cls = "venue") {
    if (!f.venueName && !f.address) return el("span", { class: `${cls} venue--tbc` }, icon("pin"), "Venue TBC");
    const text = F.venueText(f);
    return el("span", { class: cls }, icon("pin"),
      el("span", { class: "venue-text" }, text,
        f.address ? [" ", el("a", { href: F.mapUrl(f), target: "_blank", rel: "noopener",
          class: "map-link", "aria-label": `Open ${f.venueName || "venue"} in Google Maps` }, "Map")] : null));
  }
  // League name plus division, e.g. "Crawley League · Men's 4 Div 1".
  const leagueLine = (t) => seps("", [t.league, t.division || null]);
  // Link to another site (league results, club website), opened in a new tab.
  const extLink = (href, label, cls, srName) =>
    el("a", { href, target: "_blank", rel: "noopener", class: `ext-link ${cls}` },
      label, icon("external"), el("span", { class: "sr-only" }, ` (${srName || label}, opens in a new tab)`));
  const resultsLink = (t, cls = "") => (t.resultsUrl
    ? extLink(t.resultsUrl, t.division ? "League table & results" : "Latest results", cls, `${t.code} league results`)
    : null);
  // Team filter order: alphabetical by code ("CR Mens", "CR Mixed", …). Colours still follow teams.yaml order.
  const byCode = (a, b) => a.code.localeCompare(b.code, "en-GB", { numeric: true, sensitivity: "base" });
  const teamsByCode = () => [...F.teams].sort(byCode);
  const selTeams = () => teamsByCode().filter((t) => F.state.teams.has(t.slug));
  const selectedTeam = () => (F.state.teams.size === 1 ? selTeams()[0] : null);
  const openFixtures = (slugs) => {
    pendingFocus = "#sel-h";
    pendingScroll = () => window.scrollTo({ top: 0, behavior: "auto" });
    F.set({ view: fixturesView, teams: new Set(slugs), day: null });
  };

  // Keep keyboard focus across re-renders: interactive elements carry data-k.
  // Alternatives when the focused control disappears or becomes disabled after a re-render.
  const FOCUS_FALLBACK = { "cal-prev": ['[data-k="cal-next"]', "#cal-h"], "cal-next": ['[data-k="cal-prev"]', "#cal-h"],
    "agenda-all": ["#agenda-h"], "reset": ["#sel-h"] };

  function render(_, info = {}) {
    const hadFocus = document.activeElement && document.activeElement !== document.body && !$("cal-panel").contains(document.activeElement);
    const key = document.activeElement?.dataset?.k;
    const scrollLeft = document.querySelector(".teambar-scroll")?.scrollLeft || 0;
    if (!isOv(F.state.view)) { fixturesView = F.state.view; fixturesSel = snapshot(); }
    if (info.popstate) pendingFocus = isOv(F.state.view) ? "#ov-h" : "#sel-h";
    if (info.popstate && $("cal-panel").open) $("cal-panel").close();
    document.body.dataset.page = isOv(F.state.view) ? "overview" : "fixtures";
    renderTabs(); renderNext(); renderMain();

    const bar = document.querySelector(".teambar-scroll");
    if (bar) { bar.scrollLeft = scrollLeft; keepChipVisible(bar, revealChip || (key?.startsWith("tt-") ? key : bar.querySelector('.tteam[aria-pressed="true"]:not(.tteam--all)')?.dataset.k)); fadeEdge(bar); }
    revealChip = null;

    const usable = (n) => n && !n.disabled && n.offsetParent !== null;
    let target = pendingFocus ? document.querySelector(pendingFocus) : null;
    if (!target && key) {
      target = document.querySelector(`[data-k="${CSS.escape(key)}"]`);
      if (!usable(target)) target = (FOCUS_FALLBACK[key] || []).map((q) => document.querySelector(q)).find(usable) || null;
    }
    if (!target && hadFocus && !document.activeElement?.isConnected) target = $("main");
    if (!target && hadFocus && document.activeElement === document.body) target = $("main");
    target?.focus({ preventScroll: true });
    pendingFocus = null;
    if (pendingScroll) { const fn = pendingScroll; pendingScroll = null; requestAnimationFrame(fn); }
  }

  // Team row on phone: "All teams" is pinned left, so reveal a chip without tucking it under the pin.
  function keepChipVisible(bar, key) {
    const chip = key && key.startsWith("tt-") && key !== "tt-all" ? bar.querySelector(`[data-k="${CSS.escape(key)}"]`) : null;
    if (!chip || bar.scrollWidth <= bar.clientWidth) return;
    const pin = bar.querySelector(".tteam-pin");
    const pinW = pin && getComputedStyle(pin).position === "sticky" ? pin.offsetWidth : 0;
    const left = chip.offsetLeft - pinW - 8, right = chip.offsetLeft + chip.offsetWidth + 24 - bar.clientWidth;
    if (bar.scrollLeft > left) bar.scrollLeft = left;
    else if (bar.scrollLeft < right) bar.scrollLeft = right;
  }
  const fadeEdge = (bar) => bar.parentElement.classList.toggle("has-more", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2);

  // ── Page modes (Overview / Fixtures) ───────────────────────────────────
  function renderTabs() {
    const ov = F.state.view === "overview";
    const tab = (k, label, ic, pressed, onclick) =>
      el("button", { type: "button", class: "mode", "data-k": k, "aria-pressed": String(pressed), onclick }, icon(ic), label);
    $("tabs").replaceChildren(
      tab("mode-ov", "Overview", "users", ov, () => { if (!ov) goOverview(); }),
      tab("mode-fx", "Fixtures", "list", !ov, () => { if (ov) goFixtures(); }));
  }

  // ── Team toggle row (the one team filter) ──────────────────────────────
  function teamBar() {
    const none = !F.state.teams.size;
    const bar = el("div", { class: "teambar-scroll", role: "group", "aria-label": "Show fixtures for teams",
      onscroll: (e) => fadeEdge(e.currentTarget) },
        el("span", { class: "tteam-pin" },
          el("button", { type: "button", class: "tteam tteam--all", "data-k": "tt-all", "aria-pressed": String(none),
            onclick: () => F.set({ teams: new Set(), day: null }) }, icon("users"), "All teams"),
          el("span", { class: "tab-sep", "aria-hidden": "true" })),
        teamsByCode().map((t) => el("button", { type: "button", class: "tteam", style: tc(t), "data-k": `tt-${t.slug}`,
          "aria-pressed": String(F.state.teams.has(t.slug)), title: t.name,
          onclick: () => { revealChip = `tt-${t.slug}`; F.state.day = null; F.toggleTeam(t.slug); } },
          el("span", { class: "tick", "aria-hidden": "true" }, el("span", { class: "dot" }), icon("check")), t.code)));
    return el("div", { class: "teambar" }, bar);
  }

  function renderNext() {
    const f = F.nextMatch(F.fixtures);
    const box = $("next-card");
    box.hidden = !isOv(F.state.view);
    if (box.hidden) return;
    if (!f) { box.replaceChildren(el("p", { class: "next-empty" }, "The season is over — see you next year!")); return; }
    const t = f.teamObj;
    box.style.cssText = tc(t);
    box.replaceChildren(
      el("div", { class: "next-top" },
        el("span", { class: "eyebrow" }, "Next match"),
        countdown(f.date)),
      el("div", { class: "next-body" },
        dateTile(f, "tile--lg"),
        el("div", { class: "next-info" },
          el("div", { class: "row-wrap" }, badge(t), haPill(f)),
          el("p", { class: "next-opp" }, el("span", { class: "vs" }, "v "), f.opponent),
          el("p", { class: "meta" }, icon("clock"), seps("", [F.fmtLong(f.date), F.fmtTime(f.time)])),
          el("p", { class: "meta" }, venue(f, "venue-inline")))),
      el("button", { type: "button", class: "btn btn--team btn--sm next-cta", "data-k": "next-cta",
        onclick: () => openFixtures([t.slug]) },
        `${t.code} fixtures`, icon("arrow")),
    );
  }

  function dateTile(f, cls = "") {
    return el("div", { class: `tile ${cls}`, style: tc(f.teamObj), "aria-hidden": "true" },
      el("span", { class: "tile-dow" }, F.fmtDow(f.date)),
      el("span", { class: "tile-day" }, String(F.parseDate(f.date).getDate())),
      el("span", { class: "tile-mon" }, F.fmtMonthShort(f.date)));
  }

  // ── Main ──────────────────────────────────────────────────────────────
  function renderMain() {
    const main = $("main");
    main.dataset.view = F.state.view;
    if (F.state.view === "overview") main.replaceChildren(overview());
    else main.replaceChildren(teamBar(), selectionHeader(), controls(), F.state.view === "calendar" ? calendar() : timeline());
  }

  // ── Overview: grid of team cards ──────────────────────────────────────
  function overview() {
    const next = F.nextByTeam();
    const cards = F.teams.map((t) => {
      const list = F.fixtures.filter((f) => f.team === t.code);
      const home = list.filter((f) => f.homeAway === "H").length;
      const played = list.filter(F.isPast).length;
      const n = next.get(t.code);
      return el("article", { class: "team-card", style: tc(t), "aria-labelledby": `tc-${t.slug}` },
        el("header", { class: "team-card-head" },
          el("div", { class: "team-card-title" },
            el("span", { class: "code-chip" }, el("span", { class: "dot", "aria-hidden": "true" }), t.code),
            el("h3", { id: `tc-${t.slug}` }, t.name),
            el("p", { class: "league" }, leagueLine(t)),
            resultsLink(t, "team-card-results")),
          el("span", { class: "shuttle-deco", "aria-hidden": "true", html:
            '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 38 14 12h20z"/><path d="M24 38 19 12M24 38l5-26"/><path d="M16 18h16"/><circle cx="24" cy="39" r="4.5" fill="currentColor"/></svg>' })),
        el("div", { class: "team-card-body" },
          n ? [
            el("p", { class: "eyebrow" }, "Next match", countdown(n.date, "countdown countdown--sm")),
            el("div", { class: "mini-next" },
              dateTile(n),
              el("div", {},
                el("p", { class: "mini-opp" }, el("span", { class: "vs" }, "v "), n.opponent),
                el("p", { class: "row-wrap meta" }, haPill(n), el("span", { class: "time" }, icon("clock"), F.fmtTime(n.time))))),
            el("p", { class: "meta" }, venue(n, "venue-inline")),
          ] : el("p", { class: "done" }, icon("check"), "All matches played this season"),
          el("ul", { class: "stats", "aria-label": "Season summary" },
            el("li", {}, el("strong", {}, String(home)), " home"),
            el("li", {}, el("strong", {}, String(list.length - home)), " away"),
            played ? el("li", {}, el("strong", {}, String(played)), " played") : null)),
        el("footer", { class: "team-card-actions" },
          el("button", { type: "button", class: "btn btn--team", "data-k": `open-${t.slug}`,
            onclick: () => openFixtures([t.slug]) },
            icon("list"), "Fixtures"),
          el("button", { type: "button", class: "btn btn--ghost", "data-k": `cal-${t.slug}`, "aria-haspopup": "dialog",
            "aria-label": `Add ${t.name} fixtures to your calendar`, onclick: () => openCalPanel([t], false) },
            icon("plus"), "Add to calendar")));
    });
    return el("div", {},
      el("div", { class: "section-head" },
        el("h2", { id: "ov-h", tabindex: "-1" }, "Our teams"),
        el("p", { class: "section-sub" }, `${plural(F.teams.length, "team")}, ${plural(F.fixtures.length, "match")} this season. Pick yours to see just its fixtures.`)),
      el("div", { class: "team-grid" }, cards),
      el("section", { class: "club-cal", "aria-labelledby": "club-cal-h" },
        el("div", { class: "club-cal-text" },
          el("h2", { id: "club-cal-h" }, icon("cal", "ico ico--lg"), "Fixtures in your calendar"),
          el("p", {}, "Add any team — each one becomes its own calendar that updates itself.")),
        el("button", { type: "button", class: "btn btn--primary", "data-k": "ov-cal", "aria-haspopup": "dialog",
          onclick: () => openCalPanel(F.teams, true) }, icon("cal"), "Add to my calendar")));
  }

  // ── "Add to my calendar" panel (one feed per team) ─────────────────────
  function copyButton(slug, name) {
    return el("button", { type: "button", class: "btn btn--ghost btn--xs", "aria-label": `Copy calendar link for ${name}`,
      onclick: async (e) => {
        const b = e.currentTarget, label = b.lastChild;
        try { await navigator.clipboard.writeText(F.icsUrl(slug)); label.textContent = "Copied ✓"; b.classList.add("is-done"); }
        catch { label.textContent = "Copy failed"; }
        setTimeout(() => { label.textContent = "Copy link"; b.classList.remove("is-done"); }, 2000);
      } }, icon("link"), el("span", {}, "Copy link"));
  }

  function calRow(slug, code, name, team) {
    return el("li", { class: "cal-row", style: team ? tc(team) : null },
      el("div", { class: "cal-row-name" },
        team ? el("span", { class: "badge" }, el("span", { class: "dot", "aria-hidden": "true" }), code)
             : el("span", { class: "badge badge--club" }, icon("users"), code),
        el("span", { class: "cal-row-full" }, name)),
      el("div", { class: "cal-row-actions", role: "group", "aria-label": `Add ${name}` },
        el("a", { class: "btn btn--team btn--xs", href: F.webcalUrl(slug), "aria-label": `Subscribe to ${name} in Apple Calendar or Outlook` },
          icon("cal"), "Subscribe"),
        el("a", { class: "btn btn--ghost btn--xs", href: F.googleCalUrl(slug), target: "_blank", rel: "noopener",
          "aria-label": `Google Calendar: ${name}` }, icon("google"), "Google"),
        copyButton(slug, name)));
  }

  function openCalPanel(teams, withClub) {
    const dlg = $("cal-panel");
    const n = teams.length;
    dlg.replaceChildren(el("div", { class: "sheet" },
      el("div", { class: "sheet-head" },
        el("span", { class: "sheet-icon", "aria-hidden": "true" }, icon("cal")),
        el("div", {},
          el("h2", { id: "cal-panel-h" }, "Add to my calendar"),
          el("p", { class: "sheet-sub" }, withClub ? "All teams" : teams.map((t) => t.code).join(", "))),
        el("button", { type: "button", class: "icon-btn sheet-close", "aria-label": "Close", onclick: () => dlg.close() }, icon("close"))),
      el("p", { class: "sheet-intro", id: "cal-panel-desc" },
        "Each team is added as its own calendar and updates automatically when fixtures change."),
      el("ul", { class: "cal-rows" },
        withClub ? calRow("all", "Club", "All club matches", null) : null,
        teams.map((t) => calRow(t.slug, t.code, t.name, t))),
      el("p", { class: "sheet-help" }, icon("info"),
        el("span", {}, el("strong", {}, "Subscribe"), " opens Apple Calendar or Outlook on your device. For Outlook on the web, use ",
          el("strong", {}, "Copy link → Add calendar → From internet"), "."))));
    document.documentElement.classList.add("scroll-lock");
    dlg.showModal();
    dlg.querySelector(".sheet-close").focus();
  }

  // ── Selection header (team, several teams, or all) ─────────────────────
  function selectionHeader() {
    const sel = selTeams();
    const team = selectedTeam();
    const list = F.filtered();
    const played = list.filter(F.isPast).length;
    const title = team ? team.name : sel.length ? `${sel.length} teams: ${sel.map((t) => t.code).join(", ")}` : "All teams";
    const leagues = team ? [leagueLine(team)] : sel.length ? [...new Set(sel.map((t) => t.league))] : ["Every Bramblewood team"];
    const withResults = sel.filter((t) => t.resultsUrl);
    return el("section", { class: `sel-card${team ? " sel-card--team" : sel.length ? " sel-card--multi" : ""}`, style: team ? tc(team) : null,
      "aria-labelledby": "sel-h" },
      !team && sel.length ? el("div", { class: "sel-stripe", "aria-hidden": "true" },
        sel.map((t) => el("span", { style: tc(t) }))) : null,
      el("div", { class: "sel-top" },
        el("div", { class: "sel-title" },
          team ? el("span", { class: "code-chip" }, el("span", { class: "dot", "aria-hidden": "true" }), team.code)
               : el("span", { class: "code-chip code-chip--all" }, icon("users"), sel.length ? "Your selection" : "Club"),
          el("h2", { id: "sel-h", tabindex: "-1" }, title),
          el("p", { class: "sel-stats" }, seps("", [...leagues.map((l) => el("span", { class: "league" }, l)),
            plural(list.length, "match"), played ? `${played} played` : null])),
          team ? resultsLink(team, "sel-results")
            : withResults.length ? el("p", { class: "sel-results-list" }, el("span", { class: "sel-results-label" }, "Results:"), " ",
                seps("", withResults.map((t) => extLink(t.resultsUrl, t.code, "sel-results", `${t.code} league results`)))) : null),
        el("button", { type: "button", class: "btn btn--primary sel-cal", "data-k": "sel-cal", "aria-haspopup": "dialog",
          "aria-label": "Add to my calendar", onclick: () => openCalPanel(sel.length ? sel : F.teams, !sel.length) },
          icon("cal"), el("span", { class: "lbl-long", "aria-hidden": "true" }, "Add to my calendar"),
          el("span", { class: "lbl-short", "aria-hidden": "true" }, "Add to calendar"))),
      selNext(list));
  }

  // "Next: Thu 19 Nov · v Horsham · Home · 8pm" for the current selection, with a jump link.
  function selNext(list) {
    if (!list.length) return el("p", { class: "sel-next sel-next--none" }, "No matches for this selection.");
    const next = F.nextMatch(list);
    if (!next) return el("p", { class: "sel-next sel-next--none" }, icon("check"), `Season complete — all ${plural(list.length, "match")} played.`);
    const first = !list.some(F.isPast);
    return el("div", { class: "sel-next", style: tc(next.teamObj) },
      el("p", { class: "sel-next-text" },
        el("strong", {}, first ? "First match:" : "Next:"), " ",
        seps("", [F.fmtMed(next.date), `${F.state.teams.size === 1 ? "" : next.team + " "}v ${next.opponent}`,
          F.haLabel(next), F.fmtTime(next.time)])),
      el("div", { class: "sel-next-actions" },
        countdown(next.date, "countdown countdown--sm"),
        el("button", { type: "button", class: "link-btn jump", "data-k": "jump", onclick: () => jumpTo(next) },
          "Jump to it", el("span", { "aria-hidden": "true" }, " ↓"))));
  }

  function jumpTo(f) {
    const reveal = () => {
      const card = document.getElementById(`m-${f.id}`);
      if (!card) return;
      card.scrollIntoView({ behavior: smooth(), block: "center" });
      card.focus({ preventScroll: true });
      card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    };
    if (F.state.view === "calendar") {
      pendingScroll = reveal;
      F.set({ month: F.monthKey(f.date), day: f.date });
    } else if (F.state.hidePast && F.isPast(f)) {
      pendingScroll = reveal; F.set({ hidePast: false });
    } else reveal();
  }

  // ── Controls: H/A, hide past, list/calendar ───────────────────────────
  function controls() {
    const seg = (k, label, opts, current, onpick) =>
      el("div", { class: `seg seg--${k}`, role: "group", "aria-label": label },
        opts.map(([v, text, ic]) => el("button", { type: "button", "data-k": `${k}-${v}`, "aria-pressed": String(current === v),
          onclick: () => onpick(v) }, ic ? icon(ic) : null, el("span", { class: "seg-label" }, text))));
    return el("div", { class: "controls" },
      seg("ha", "Home or away", [["", "All"], ["H", "Home"], ["A", "Away"]], F.state.ha, (v) => F.set({ ha: v })),
      seg("view", "View", [["list", "List", "list"], ["calendar", "Calendar", "grid"]], F.state.view,
        (v) => F.set({ view: v })),
      el("button", { type: "button", class: "switch", "data-k": "past", "aria-pressed": String(F.state.hidePast),
        onclick: () => F.set({ hidePast: !F.state.hidePast }) },
        el("span", { class: "switch-track", "aria-hidden": "true" }, el("span", { class: "switch-thumb" })), "Hide past matches"));
  }

  // ── Match card (shared by timeline + calendar agenda) ─────────────────
  function matchCard(f, isNext) {
    const t = f.teamObj;
    const past = F.isPast(f);
    return el("article", { class: `match${past ? " is-past" : ""}${isNext ? " is-next" : ""}`, style: tc(t), id: `m-${f.id}`, tabindex: "-1",
      "aria-label": `${isNext ? "Next match. " : past ? "Played. " : ""}${t.code} ${F.haLabel(f)} v ${f.opponent}, ${F.fmtLong(f.date)}, ${F.fmtTime(f.time)}` },
      isNext ? el("span", { class: "ribbon" }, "Next up") : null,
      dateTile(f),
      el("div", { class: "match-main" },
        el("div", { class: "row-wrap" }, F.state.teams.size === 1 ? null : badge(t), haPill(f),
          past ? el("span", { class: "played" }, icon("check"), "Played") : null),
        el("h4", { class: "match-opp" }, el("span", { class: "vs" }, "v "), f.opponent),
        el("div", { class: "match-meta" },
          el("span", { class: "time" }, icon("clock"), F.fmtTime(f.time)),
          venue(f)),
        f.notes ? el("p", { class: "note" }, f.notes) : null));
  }

  // ── Timeline (list view) ──────────────────────────────────────────────
  function timeline() {
    const list = F.visible();
    const next = F.nextMatch(F.filtered());
    if (!list.length) return empty();
    const months = F.groupBy(list, (f) => F.monthKey(f.date));
    return el("div", { class: "timeline" }, [...months].map(([m, items]) =>
      el("section", { class: "tl-month", "aria-label": F.fmtMonth(m) },
        el("div", { class: "tl-month-h" }, el("h3", {}, F.fmtMonth(m)),
          el("span", { class: "count", "aria-hidden": "true" }, plural(items.length, "match"))),
        el("ol", { class: "tl-list" }, items.map((f) =>
          el("li", { class: `tl-item${F.isPast(f) ? " is-past" : ""}${f === next ? " is-next" : ""}`, style: tc(f.teamObj) },
            el("span", { class: "tl-dot", "aria-hidden": "true" }),
            matchCard(f, f === next)))))));
  }

  function empty() {
    return el("div", { class: "empty" },
      el("p", { class: "empty-title" }, "No matches to show"),
      el("p", {}, "Try another team, or switch “Hide past matches” off."),
      el("button", { type: "button", class: "btn btn--ghost btn--sm", "data-k": "reset",
        onclick: () => F.set({ ha: "", hidePast: false }) }, "Reset filters"));
  }

  // ── Calendar ──────────────────────────────────────────────────────────
  function calendar() {
    const key = F.state.month;
    const list = F.visible();
    const byDay = F.groupBy(list, (f) => f.date);
    const next = F.nextMatch(F.filtered());
    const day = F.state.day && F.monthKey(F.state.day) === key ? F.state.day : null;
    const navBtn = (dir, delta, disabled) =>
      el("button", { type: "button", class: "icon-btn", "data-k": `cal-${dir}`, disabled,
        "aria-label": `${dir === "prev" ? "Previous" : "Next"} month`, onclick: () => F.set({ month: F.shiftMonth(key, delta), day: null }) },
        icon(dir === "prev" ? "left" : "right"));
    const monthCount = list.filter((f) => F.monthKey(f.date) === key).length;

    const cells = F.monthGrid(key).map((c) => {
      if (!c.inMonth) return el("div", { class: "cal-cell is-out", "aria-hidden": "true" });
      const items = byDay.get(c.iso) || [];
      const cls = ["cal-cell", items.length && "has", c.iso === F.TODAY && "is-today", c.iso < F.TODAY && "is-past",
        c.iso === day && "is-sel", items.includes(next) && "is-next"].filter(Boolean).join(" ");
      return el("button", { type: "button", class: cls, "data-k": `d-${c.iso}`, "aria-pressed": String(c.iso === day),
        "aria-label": `${F.fmtLong(c.iso)}${c.iso === F.TODAY ? " (today)" : ""}, ${items.length ? plural(items.length, "match") : "no matches"}`,
        onclick: () => {
          // Stacked layout (phone/tablet): bring the agenda into view after picking a day.
          if (c.iso !== day && window.matchMedia("(max-width: 1060px)").matches)
            pendingScroll = () => document.querySelector(".agenda")?.scrollIntoView({ behavior: smooth(), block: "nearest" });
          F.set({ day: c.iso === day ? null : c.iso });
        } },
        el("span", { class: "cal-num" }, String(c.day)),
        items.length ? el("span", { class: "cal-pills" }, items.map((f) =>
          el("span", { class: `cal-pill cal-pill--${f.homeAway}${F.isPast(f) ? " is-past" : ""}`, style: tc(f.teamObj) },
            el("span", { class: "dot" }), el("span", { class: "pill-text" }, f.team),
            el("span", { class: "pill-ha" }, f.homeAway)))) : null);
    });

    const agendaItems = day ? byDay.get(day) || [] : list.filter((f) => F.monthKey(f.date) === key);
    const agenda = el("section", { class: "agenda", "aria-live": "polite", "aria-labelledby": "agenda-h" },
      el("div", { class: "agenda-head" },
        el("h3", { id: "agenda-h", tabindex: "-1" }, day ? F.fmtLong(day) : `All of ${F.fmtMonth(key)}`),
        day ? el("button", { type: "button", class: "link-btn", "data-k": "agenda-all",
          onclick: () => { pendingFocus = "#agenda-h"; F.set({ day: null }); } },
          "Show whole month") : el("span", { class: "count" }, plural(agendaItems.length, "match"))),
      agendaItems.length
        ? el("div", { class: "agenda-list" }, agendaItems.map((f) => matchCard(f, f === next)))
        : el("p", { class: "agenda-empty" }, day ? "No matches on this day." : "No matches this month."));

    return el("div", { class: "cal-layout" },
      el("section", { class: "cal-card", "aria-labelledby": "cal-h" },
        el("div", { class: "cal-head" },
          navBtn("prev", -1, key <= F.firstMonth),
          el("div", { class: "cal-title" },
            el("h3", { id: "cal-h", tabindex: "-1", "aria-live": "polite" }, F.fmtMonth(key)),
            el("span", { class: "count", "aria-hidden": "true" }, plural(monthCount, "match"))),
          navBtn("next", 1, key >= F.lastMonth)),
        el("div", { class: "cal-grid", role: "group", "aria-label": `${F.fmtMonth(key)} days` },
          ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => el("span", { class: "cal-dow", "aria-hidden": "true" }, d)),
          cells),
        el("p", { class: "cal-legend", "aria-hidden": "true" },
          el("span", { class: "lg lg--H" }), "Home", el("span", { class: "lg lg--A" }), "Away"),
        el("p", { class: "cal-hint" }, "Tap a day to see its matches.")),
      agenda);
  }

  // ── Footer ────────────────────────────────────────────────────────────
  const CLUB_URL = "https://www.bramblewoodbadminton.club/";
  // One entry per league; teams sharing a results page (e.g. Tunbridge Wells) collapse into one link.
  function leagueLinks() {
    const byLeague = new Map();
    for (const t of F.teams) {
      if (!t.resultsUrl) continue;
      if (!byLeague.has(t.league)) byLeague.set(t.league, new Map());
      const urls = byLeague.get(t.league);
      if (!urls.has(t.resultsUrl)) urls.set(t.resultsUrl, []);
      urls.get(t.resultsUrl).push(t);
    }
    if (!byLeague.size) return null;
    return el("div", { class: "foot-leagues" },
      el("p", { class: "foot-h" }, "League results"),
      el("ul", { class: "foot-league-list" }, [...byLeague].map(([league, urls]) =>
        el("li", {}, el("span", { class: "foot-league" }, league), " ",
          seps("", [...urls].map(([url, ts]) => {
            const divs = ts.map((t) => t.division).filter(Boolean);
            return extLink(url, divs.length ? divs.join(" / ") : "Latest results", "foot-link", `${league} ${divs.join(" / ") || "latest results"}`);
          }))))));
  }
  $("footer").replaceChildren(
    el("div", {},
      el("p", { class: "foot-h" }, "Home venue"),
      el("p", {}, el("strong", {}, F.home.name), el("br"), F.home.address, " ",
        el("a", { href: F.mapUrl({ venueName: F.home.name, address: F.home.address }), target: "_blank", rel: "noopener",
          class: "map-link", "aria-label": `Open ${F.home.name} in Google Maps` }, "Map"))),
    leagueLinks(),
    el("div", {},
      el("p", { class: "foot-h" }, "Bramblewood Badminton Club"),
      el("p", {}, extLink(CLUB_URL, "bramblewoodbadminton.club", "foot-link", "Club website")),
      el("p", {}, seps("", [F.season ? `${F.season} season` : null,
        ["Last updated ", el("time", { datetime: F.data.generated }, F.lastUpdated)]]))));
  document.querySelectorAll("[data-season]").forEach((n) => { n.textContent = F.season; n.hidden = !F.season; });

  // Clicking the backdrop (outside the sheet) closes the panel; Esc is native to <dialog>.
  $("cal-panel").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $("cal-panel").addEventListener("close", () => document.documentElement.classList.remove("scroll-lock"));

  F.onChange(render);
  F.changed();

  // ── Light / dark switch ───────────────────────────────────────────────
  // Flips the effective theme and remembers it; until clicked, the page follows the system setting.
  (function themeToggle() {
    const btn = document.getElementById("theme-toggle");
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : systemDark.matches);
    const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    function paint() {
      const dark = isDark();
      const label = dark ? "Switch to light mode" : "Switch to dark mode";
      btn.innerHTML = `<span class="ico" aria-hidden="true">${dark ? SUN : MOON}</span>`;
      btn.setAttribute("aria-label", label);
      btn.title = label;
    }
    btn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch {}
      paint();
    });
    systemDark.addEventListener("change", paint);
    paint();
  })();
})();
