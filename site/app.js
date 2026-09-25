(() => {
  "use strict";

  const DATA = JSON.parse(document.getElementById("fixtures-data").textContent);
  const { teams, fixtures, home } = DATA;

  // Colours are assigned by team order in data/teams.yaml.
  const PALETTE = ["#2563eb", "#a0522d", "#7c3aed", "#16a34a", "#ca8a04", "#0891b2", "#64748b", "#db2777", "#ea580c",
                   "#4d7c0f", "#b91c1c", "#0f766e"];
  const teamBySlug = new Map();
  const teamByCode = new Map();
  teams.forEach((t, i) => {
    t.color = PALETTE[i % PALETTE.length];
    teamBySlug.set(t.slug, t);
    teamByCode.set(t.code, t);
  });

  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  };

  // ── Dates (all local, as YYYY-MM-DD strings) ──────────────────────────
  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const TODAY = isoDate(new Date());
  const fmt = (opts) => new Intl.DateTimeFormat("en-GB", opts);
  const fmtMonth = fmt({ month: "long", year: "numeric" });
  const fmtDow = fmt({ weekday: "short" });
  const fmtLong = fmt({ weekday: "long", day: "numeric", month: "long" });
  const fmtTime = (t) => {
    if (!t) return "Time TBC";
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}${m ? ":" + pad(m) : ""}${h < 12 ? "am" : "pm"}`;
  };
  const monthKey = (iso) => iso.slice(0, 7);

  // ── State (mirrored in the URL so views can be shared) ────────────────
  const state = {
    teams: new Set(),       // empty = all teams
    ha: "",                 // "", "H" or "A"
    view: "list",
    hidePast: false,
    month: null,            // "YYYY-MM" for calendar view
    day: null,              // selected day in calendar view
  };

  function readUrl() {
    const p = new URLSearchParams(location.search);
    (p.get("teams") || "").split(",").filter((s) => teamBySlug.has(s)).forEach((s) => state.teams.add(s));
    if (["H", "A"].includes(p.get("ha"))) state.ha = p.get("ha");
    if (p.get("view") === "calendar") state.view = "calendar";
    state.hidePast = p.get("past") === "hide";
    if (/^\d{4}-\d{2}$/.test(p.get("month") || "")) state.month = p.get("month");
  }

  function writeUrl() {
    const p = new URLSearchParams();
    if (state.teams.size) p.set("teams", [...state.teams].join(","));
    if (state.ha) p.set("ha", state.ha);
    if (state.view !== "list") p.set("view", state.view);
    if (state.hidePast) p.set("past", "hide");
    if (state.view === "calendar" && state.month) p.set("month", state.month);
    const qs = p.toString().replace(/%2C/g, ",");
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  const matchesFilter = (f) =>
    (!state.teams.size || state.teams.has(teamByCode.get(f.team).slug)) &&
    (!state.ha || f.homeAway === state.ha);

  const filtered = () => fixtures.filter(matchesFilter);

  // ── Shared match card ─────────────────────────────────────────────────
  const mapUrl = (f) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([f.venueName, f.address].filter(Boolean).join(", "))}`;

  function matchCard(f, nextId) {
    const team = teamByCode.get(f.team);
    const past = f.date < TODAY;
    const isNext = f.id === nextId;
    const d = parseDate(f.date);
    const venueText = [f.venueName, f.address].filter(Boolean).join(", ");
    return el("article", {
        class: `match${past ? " is-past" : ""}${isNext ? " is-next" : ""}`,
        id: `m-${f.id}`,
        style: `--team:${team.color}`,
      },
      el("div", { class: "match-date", "aria-hidden": "true" },
        el("span", { class: "dow" }, fmtDow.format(d)),
        el("span", { class: "day" }, String(d.getDate()))),
      el("div", { class: "match-main" },
        el("div", { class: "match-head" },
          el("span", { class: "team-badge", title: `${team.name} · ${team.league}` }, team.code),
          el("span", { class: `ha ha--${f.homeAway}` }, f.homeAway === "H" ? "Home" : "Away"),
          isNext && el("span", { class: "next-label" }, "Next match")),
        el("p", { class: "opponent" }, el("span", { class: "vs" }, "v "), f.opponent),
        el("div", { class: "meta" },
          el("span", {}, el("span", { class: "visually-hidden" }, fmtLong.format(d) + ", "), fmtTime(f.time)),
          venueText
            ? el("span", {}, venueText, " · ", el("a", { href: mapUrl(f), target: "_blank", rel: "noopener" }, "Map"))
            : f.homeAway === "A" && el("span", {}, "Venue TBC")),
        f.notes && el("p", { class: "notes" }, f.notes)));
  }

  function matchList(list, nextId) {
    return el("div", { class: "matches" }, list.map((f) => matchCard(f, nextId)));
  }

  const emptyState = () => el("div", { class: "empty" }, "No matches for these filters.");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "es"}`;

  // ── List view ─────────────────────────────────────────────────────────
  function renderList() {
    const all = filtered();
    const upcoming = all.filter((f) => f.date >= TODAY);
    const nextId = upcoming[0]?.id;
    const shown = state.hidePast ? upcoming : all;

    $("list-count").textContent = `${plural(shown.length, "match")}` +
      (state.hidePast ? "" : ` · ${upcoming.length} still to play`);
    $("jump-next").hidden = !nextId || state.hidePast || upcoming.length === all.length;
    $("jump-next").dataset.target = nextId || "";

    const root = $("list");
    root.replaceChildren();
    if (!shown.length) return root.append(emptyState());

    const byMonth = new Map();
    for (const f of shown) {
      const k = monthKey(f.date);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(f);
    }
    for (const [k, list] of byMonth) {
      root.append(el("section", { class: "month" },
        el("h2", {}, fmtMonth.format(parseDate(`${k}-01`)), el("small", {}, plural(list.length, "match"))),
        matchList(list, nextId)));
    }
  }

  // ── Calendar view ─────────────────────────────────────────────────────
  const allMonths = [...new Set(fixtures.map((f) => monthKey(f.date)))].sort();
  const firstMonth = allMonths[0];
  const lastMonth = allMonths[allMonths.length - 1];

  function shiftMonth(key, delta) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }

  function defaultMonth() {
    const now = monthKey(TODAY);
    if (now < firstMonth) return firstMonth;
    if (now > lastMonth) return lastMonth;
    return now;
  }

  function renderCalendar() {
    if (!state.month) state.month = defaultMonth();
    const key = state.month;
    const [y, m] = key.split("-").map(Number);
    $("cal-title").textContent = fmtMonth.format(new Date(y, m - 1, 1));
    $("cal-prev").disabled = key <= firstMonth;
    $("cal-next").disabled = key >= lastMonth;

    const list = filtered();
    const byDay = new Map();
    for (const f of list) {
      if (!byDay.has(f.date)) byDay.set(f.date, []);
      byDay.get(f.date).push(f);
    }

    const grid = $("cal-grid");
    grid.replaceChildren(...["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) =>
      el("div", { class: "cal-dow", role: "columnheader" }, d)));

    const first = new Date(y, m - 1, 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
    const cells = Math.ceil(((first.getDay() + 6) % 7 + new Date(y, m, 0).getDate()) / 7) * 7;

    for (let i = 0; i < cells; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoDate(d);
      const evs = byDay.get(iso) || [];
      const outside = d.getMonth() !== m - 1;
      const cls = ["cal-day",
        outside && "is-outside", iso === TODAY && "is-today",
        iso < TODAY && "is-past", iso === state.day && "is-selected"].filter(Boolean).join(" ");
      const label = `${fmtLong.format(d)}: ${evs.length ? plural(evs.length, "match") : "no matches"}`;
      const content = [
        el("span", { class: "num" }, String(d.getDate())),
        el("span", { class: "evs" }, evs.map((f) => {
          const t = teamByCode.get(f.team);
          return el("span", { class: "ev", style: `--team:${t.color}`, title: `${f.team} v ${f.opponent} (${f.homeAway === "H" ? "Home" : "Away"}) ${fmtTime(f.time)}` },
            el("b", {}, f.team), ` ${f.homeAway} · ${f.opponent}`);
        })),
      ];
      grid.append(evs.length && !outside
        ? el("button", { type: "button", class: cls, role: "gridcell", "aria-label": label,
            onclick: () => { state.day = state.day === iso ? null : iso; renderCalendar(); } }, content)
        : el("div", { class: cls, role: "gridcell", "aria-label": label }, content));
    }

    // Agenda under the grid: the selected day, or the whole month.
    const monthList = list.filter((f) => monthKey(f.date) === key);
    const dayList = state.day ? monthList.filter((f) => f.date === state.day) : null;
    const nextId = list.find((f) => f.date >= TODAY)?.id;
    $("agenda-title").textContent = dayList
      ? `${fmtLong.format(parseDate(state.day))} · ${plural(dayList.length, "match")}`
      : `${plural(monthList.length, "match")} in ${fmtMonth.format(first)}`;
    $("agenda-all").hidden = !dayList;
    const shown = dayList || (state.hidePast ? monthList.filter((f) => f.date >= TODAY) : monthList);
    $("agenda").replaceChildren(shown.length ? matchList(shown, nextId) : emptyState());
  }

  // ── Controls ──────────────────────────────────────────────────────────
  function renderControls() {
    const chips = $("team-chips");
    chips.replaceChildren(
      el("button", { type: "button", class: "chip chip--all", "aria-pressed": String(!state.teams.size),
        onclick: () => { state.teams.clear(); update(); } }, "All teams"),
      ...teams.map((t) => el("button", {
          type: "button", class: "chip", style: `--team:${t.color}`,
          "aria-pressed": String(state.teams.has(t.slug)), title: `${t.name} · ${t.league}`,
          onclick: () => { state.teams.has(t.slug) ? state.teams.delete(t.slug) : state.teams.add(t.slug); update(); },
        }, el("span", { class: "dot", "aria-hidden": "true" }), t.code)));

    for (const b of $("ha-toggle").children) b.setAttribute("aria-pressed", String(b.dataset.value === state.ha));
    for (const b of $("view-toggle").children) b.setAttribute("aria-pressed", String(b.dataset.value === state.view));
    $("hide-past").checked = state.hidePast;

    // Default the subscribe picker to the single selected team, if any.
    if (state.teams.size === 1) $("sub-team").value = [...state.teams][0];
    updateSubscribe();
  }

  function update() {
    renderControls();
    $("list-view").hidden = state.view !== "list";
    $("calendar-view").hidden = state.view !== "calendar";
    if (state.view === "list") renderList(); else renderCalendar();
    writeUrl();
  }

  // ── Calendar subscription ─────────────────────────────────────────────
  const icsUrl = (slug) => new URL(`calendar/${slug}.ics`, location.href).href;

  function updateSubscribe() {
    const url = icsUrl($("sub-team").value);
    const webcal = url.replace(/^https?:/, "webcal:");
    $("sub-webcal").href = webcal;
    $("sub-google").href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
    $("sub-copy").dataset.url = url;
  }

  function setupSubscribe() {
    const sel = $("sub-team");
    sel.append(el("option", { value: "all" }, "All Bramblewood matches"),
      ...teams.map((t) => el("option", { value: t.slug }, `${t.code} only`)));
    sel.addEventListener("change", updateSubscribe);
    $("sub-copy").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
        btn.textContent = "Copied ✓";
      } catch {
        window.prompt("Copy this calendar link:", btn.dataset.url);
      }
      setTimeout(() => (btn.textContent = "Copy link"), 2000);
    });
  }

  // ── Header / footer ───────────────────────────────────────────────────
  function renderHeader() {
    const seasons = [...new Set(fixtures.map((f) => f.season))];
    $("season").textContent = seasons.length === 1 ? `20${seasons[0]}` : "";
    const next = fixtures.find((f) => f.date >= TODAY);
    if (next) {
      const when = next.date === TODAY ? "Today" : fmtLong.format(parseDate(next.date));
      $("next-up").replaceChildren("Next match: ", el("strong", {}, `${when}, ${fmtTime(next.time)}`),
        ` · ${next.team} v ${next.opponent} (${next.homeAway === "H" ? "home" : "away"})`);
      $("next-up").hidden = false;
    }
    $("home-venue").textContent = [home.name, home.address].filter(Boolean).join(", ");
    const updated = new Date(DATA.generated);
    $("updated").textContent = `Last updated ${updated.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`;
  }

  // ── Wire up ───────────────────────────────────────────────────────────
  $("ha-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.ha = b.dataset.value; state.day = null; update();
  });
  $("view-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.view = b.dataset.value; update();
  });
  $("hide-past").addEventListener("change", (e) => { state.hidePast = e.target.checked; update(); });
  $("cal-prev").addEventListener("click", () => { state.month = shiftMonth(state.month, -1); state.day = null; update(); });
  $("cal-next").addEventListener("click", () => { state.month = shiftMonth(state.month, 1); state.day = null; update(); });
  $("agenda-all").addEventListener("click", () => { state.day = null; update(); });
  $("jump-next").addEventListener("click", (e) => {
    const card = $(`m-${e.currentTarget.dataset.target}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.remove("is-flash"); void card.offsetWidth; card.classList.add("is-flash");
  });

  readUrl();
  setupSubscribe();
  renderHeader();
  update();
})();
