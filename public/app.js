/* Night Owl app: one page, hash routes, no frameworks. */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const NOW = () => Date.now();
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

let AUTH = LS.get("owlAuth"), ADMIN = LS.get("owlAdmin");
let BOOT = { jobs: [], shifts: [], prompts: [] }, ME = null;
let CARDS = [], TONIGHT = false, TIMER = null, UNREAD = 0, LANDMODE = "join", PIDX = 0;
const APP = $("#app"), NAV = $("#nav");

async function api(path, body) {
  const headers = { "content-type": "application/json" };
  if (AUTH) headers["x-owl-auth"] = AUTH; if (ADMIN) headers["x-owl-admin"] = ADMIN;
  let r; try { r = await fetch("/api" + path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" }); }
  catch (e) { throw new Error("No signal? Check your connection."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: r.status });
  return j;
}
function toast(t) { document.querySelectorAll(".toast").forEach((x) => x.remove()); const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2800); }
function sheet(html) { closeSheet(); const bg = document.createElement("div"); bg.className = "sheet-bg"; bg.id = "sheet"; bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; bg.addEventListener("click", (e) => { if (e.target === bg) closeSheet(); }); document.body.appendChild(bg); }
function closeSheet() { const s = $("#sheet"); if (s) s.remove(); }
const ago = (t) => { const s = (NOW() - t) / 1000; if (s < 60) return "now"; if (s < 3600) return Math.floor(s / 60) + "m"; if (s < 86400) return Math.floor(s / 3600) + "h"; return Math.floor(s / 86400) + "d"; };
const img = (id) => `/img/${esc(id)}.jpg`;
const nightsTxt = (n) => WEEK.filter((d) => (n || []).includes(d)).map((d) => DAYS[d]).join(", ");

const I = {
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', back: '<path d="M15 18l-6-6 6-6"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>', pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>', cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', check: '<path d="M5 12l5 5 9-10"/>', dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};
const ic = (n, s = 20, x = "") => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${x}>${I[n]}</svg>`;
const OWLSVG = (s, cls = "") => `<svg class="owl ${cls}" aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 64 64"><circle cx="32" cy="31" r="25" fill="#FFD27A"/><circle cx="45" cy="19" r="3.2" fill="#F0BC58"/><circle cx="48.5" cy="37" r="2" fill="#F0BC58"/><circle cx="15.5" cy="23" r="1.8" fill="#F0BC58"/><path d="M19.5 14l5 6.8q7.5-3 15 0l5-6.8 1 12.5q3.5 8 1.5 15.5q-3 10.5-15 11.5q-12-1-15-11.5q-2-7.5 1.5-15.5z" fill="#0A0918"/><circle cx="26.8" cy="27.5" r="5.8" fill="#221D47"/><circle cx="37.2" cy="27.5" r="5.8" fill="#221D47"/><path d="M19.5 34q-1.5 11 7.5 17.5q-4.5-8-3.5-17.5zM44.5 34q1.5 11-7.5 17.5q4.5-8 3.5-17.5z" fill="#221D47"/><path d="M28 41l2 1.6 2-1.6 2 1.6 2-1.6M29 46l2 1.6 2-1.6 2 1.6" stroke="#221D47" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 52.5q14-3.5 27-1.5t27-1.5" stroke="#0A0918" stroke-width="3.2" fill="none" stroke-linecap="round"/><g class="eye l"><g class="open"><circle cx="26.8" cy="27.5" r="3.7" fill="#FFD27A"/><circle cx="26.8" cy="27.5" r="1.7" fill="#0A0918"/></g><path class="shut" d="M23.3 27.6q3.5 2.6 7 0" stroke="#FFD27A" stroke-width="1.8" fill="none" stroke-linecap="round"/></g><g class="eye r"><g class="open"><circle cx="37.2" cy="27.5" r="3.7" fill="#FFD27A"/><circle cx="37.2" cy="27.5" r="1.7" fill="#0A0918"/></g><path class="shut" d="M33.7 27.6q3.5 2.6 7 0" stroke="#FFD27A" stroke-width="1.8" fill="none" stroke-linecap="round"/></g><path d="M31 31.5h2l-1 2.8z" fill="#FFD27A"/></svg>`;
const OWL = (s = 28) => OWLSVG(s, "blinky");

/* ---------- shell ---------- */
function nav(on) {
  NAV.hidden = false;
  NAV.innerHTML = [["", "moon", "Discover"], ["matches", "chat", "Matches"], ["me", "user", "Me"]].map(([r, i, t]) => `<a href="#/${r}" class="${on === r ? "on" : ""}" ${on === r ? 'aria-current="page"' : ""}>${ic(i, 22)}${t}${r === "matches" && UNREAD ? '<span class="dot" aria-label="Unread"></span>' : ""}</a>`).join("");
}
function route() {
  clearInterval(TIMER); TIMER = null; closeSheet(); const m = $(".match"); if (m) m.remove();
  const [a, b] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  window.scrollTo(0, 0);
  if (a === "admin") { NAV.hidden = true; return pAdmin(); }
  if (a === "safety") { NAV.hidden = !ME; if (ME) nav(""); return pSafety(); }
  if (!ME) { NAV.hidden = true; return pLanding(); }
  if (!ME.complete && a !== "me") { NAV.hidden = true; return pSetup(); }
  const R = { "": pDiscover, matches: pMatches, chat: pChat, me: pMe, setup: pSetup, edit: pSetup };
  nav({ "": "", matches: "matches", chat: "matches", me: "me", setup: "me", edit: "me" }[a] ?? "");
  (R[a] || pDiscover)(b);
}
window.addEventListener("hashchange", route);
async function boot() {
  try { BOOT = await api("/boot"); ME = BOOT.me; } catch (e) { APP.innerHTML = `<div class="empty">Couldn't reach Night Owl. ${esc(e.message)}<br><br><button class="btn m" onclick="location.reload()">Try again</button></div>`; return; }
  if (AUTH && !ME) { AUTH = null; LS.set("owlAuth", null); }
  route(); poll(); setInterval(poll, 30e3);
}
async function poll() { if (!ME) return; try { const j = await api("/matches"); const was = UNREAD; UNREAD = j.unread; if (was !== UNREAD && !NAV.hidden) nav(document.querySelector("nav.bar a.on") ? document.querySelector("nav.bar a.on").getAttribute("href").replace("#/", "") : ""); } catch (e) {} }
async function refreshMe() { const j = await api("/boot"); BOOT = j; ME = j.me; }

/* ---------- landing: join or log in ---------- */
function pLanding() {
  APP.innerHTML = `<div class="col" style="gap:18px;padding-bottom:24px">
    <section class="hero fly col" style="gap:14px">
      <div class="logo">${OWL(34)}night owl</div>
      <h1 class="h1">Dating for people who work while the world sleeps.</h1>
      <p class="soft" style="margin:0;line-height:1.55">Nurses, carers, security, drivers, warehouse crews. Meet people who are awake when you are, on the same nights as you.</p>
      ${BOOT.online ? `<span class="badge g" style="align-self:flex-start"><span class="pulse" aria-hidden="true"></span>${BOOT.online} owl${BOOT.online === 1 ? "" : "s"} online now</span>` : ""}
    </section>
    <div class="feats"><div class="feat">${ic("moon", 20, 'style="color:var(--moon)"')}<b>On tonight</b>See who's working the same nights</div><div class="feat">${ic("heart", 20, 'style="color:var(--pink)"')}<b>Swipe & match</b>Like each other to chat</div><div class="feat">${ic("shield", 20, 'style="color:var(--violet)"')}<b>Safe</b>18+, report & block, no exact location</div></div>
    <div class="pill" role="tablist"><button role="tab" aria-selected="${LANDMODE === "join"}" class="${LANDMODE === "join" ? "on" : ""}" data-act="landmode" data-k="join">New here</button><button role="tab" aria-selected="${LANDMODE === "login"}" class="${LANDMODE === "login" ? "on" : ""}" data-act="landmode" data-k="login">Log in</button></div>
    ${LANDMODE === "join" ? `<form data-form="signup" class="card col" novalidate>
      <h2 class="h2">Create your account</h2>
      <div class="row" style="gap:10px;align-items:flex-start"><div class="grow"><label class="l" for="su">Username</label><input class="f" id="su" name="username" maxlength="20" autocomplete="username" autocapitalize="off" placeholder="nightnurse_jo"></div><div class="grow"><label class="l" for="sn">First name</label><input class="f" id="sn" name="name" maxlength="30" autocomplete="given-name" placeholder="Jo"></div></div>
      <div><label class="l" for="sp">Password (8+ characters)</label><input class="f" id="sp" name="password" type="password" maxlength="100" autocomplete="new-password"></div>
      <div><label class="l" for="sd">Date of birth</label><input class="f" id="sd" name="dob" type="date" max="${new Date(NOW() - 18 * 365.25 * 864e5).toISOString().slice(0, 10)}"></div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="l">I am a</legend><div class="chips">${[["woman", "Woman"], ["man", "Man"], ["nonbinary", "Non-binary"]].map(([v, t]) => `<label class="chip"><input type="radio" name="gender" value="${v}">${t}</label>`).join("")}</div></fieldset>
      <fieldset style="border:0;padding:0;margin:0"><legend class="l">I'd like to meet</legend><div class="chips">${[["men", "Men"], ["women", "Women"], ["everyone", "Everyone"]].map(([v, t]) => `<label class="chip"><input type="radio" name="seeking" value="${v}">${t}</label>`).join("")}</div></fieldset>
      <label class="check"><input type="checkbox" name="agree"> I'm 18 or over, and I agree to the <a href="#/safety">terms and safety rules</a>.</label>
      <button class="btn p big block">Join Night Owl</button>
    </form>` : `<form data-form="login" class="card col" novalidate>
      <h2 class="h2">Welcome back, owl</h2>
      <div><label class="l" for="lu">Username</label><input class="f" id="lu" name="username" autocomplete="username" autocapitalize="off"></div>
      <div><label class="l" for="lp">Password</label><input class="f" id="lp" name="password" type="password" autocomplete="current-password"></div>
      <button class="btn p big block">Log in</button>
    </form>`}
    <p class="note" style="text-align:center">Night Owl is in private testing.</p>
  </div>`;
}

/* ---------- set up / edit profile ---------- */
function pSetup() {
  const u = ME, first = !u.complete;
  APP.innerHTML = `<div class="col" style="gap:18px">
    ${first ? `<div class="logo">${OWL(30)}night owl</div><div><div class="kicker">Nearly there, ${esc(u.name)}</div><h1 class="h1" style="font-size:28px">Set up your profile</h1></div>` : `<div class="row"><a href="#/me" class="ibtn" aria-label="Back">${ic("back")}</a><h1 class="h2 grow">Edit profile</h1></div>`}
    <section class="card col"><div class="row"><h2 class="h2 grow">Photos</h2><span class="tiny muted">${u.photos.length}/6 · first is your main</span></div>
      <div class="pgrid">${[0, 1, 2, 3, 4, 5].map((i) => { const p = u.photos[i]; return p ? `<div class="pslot"><img src="${img(p)}" alt="Your photo ${i + 1}">${i === 0 ? '<span class="main">Main</span>' : `<button class="x" style="left:6px;right:auto;font-size:11px;width:auto;padding:0 8px" data-act="mainphoto" data-id="${esc(p)}" aria-label="Make main photo">Main</button>`}<button class="x" data-act="delphoto" data-id="${esc(p)}" aria-label="Remove photo">${ic("x", 14)}</button></div>` : `<label class="pslot" for="pu" style="cursor:pointer">${ic("cam", 24)}</label>`; }).join("")}</div>
      <input id="pu" type="file" accept="image/*" multiple class="sr" data-upload="1">
      ${u.photos.length ? "" : `<p class="note">Add at least one clear photo of you. Profiles without a photo aren't shown to anyone.</p>`}
    </section>
    <form data-form="profile" class="col" style="gap:18px" novalidate>
      <section class="card col"><h2 class="h2">Your nights</h2>
        <div><label class="l" for="pj">What do you do?</label><select class="f" id="pj" name="job"><option value="">Choose…</option>${BOOT.jobs.map((j) => `<option ${u.job === j ? "selected" : ""}>${esc(j)}</option>`).join("")}</select></div>
        <div><label class="l" for="ps">Your shifts</label><select class="f" id="ps" name="shift"><option value="">Choose…</option>${BOOT.shifts.map((j) => `<option ${u.shift === j ? "selected" : ""}>${esc(j)}</option>`).join("")}</select></div>
        <fieldset style="border:0;padding:0;margin:0"><legend class="l">Nights you usually work</legend><div class="chips">${WEEK.map((d) => `<label class="chip"><input type="checkbox" name="nights" value="${d}" ${u.nights.includes(d) ? "checked" : ""}>${DAYS[d]}</label>`).join("")}</div></fieldset>
      </section>
      <section class="card col"><h2 class="h2">About you</h2>
        <div><label class="l" for="pb">Bio</label><textarea class="f" id="pb" name="bio" maxlength="500" placeholder="Nurse on nights at the LGI. Coffee-powered, terrible at sleeping in the day…">${esc(u.bio)}</textarea></div>
        <div><label class="l" for="pt">Town</label><input class="f" id="pt" name="town" maxlength="40" value="${esc(u.town)}" placeholder="Leeds"></div>
        ${BOOT.prompts.slice(0, 3).map((q, i) => `<div><label class="l" for="pq${i}">${esc(q)}</label><input class="f" id="pq${i}" name="p:${esc(q)}" maxlength="120" value="${esc(u.prompts[q] || "")}"></div>`).join("")}
      </section>
      <section class="card col"><h2 class="h2">Location</h2>
        <p class="note">Used to show how far away people are, like "4 km". We only keep it to about 1 km, and never show your exact spot.</p>
        <button type="button" class="btn ${u.hasLoc ? "" : "m"}" data-act="loc">${ic("pin", 18)}${u.hasLoc ? "Update my location" : "Use my location"}</button>
      </section>
      <button class="btn p big block">${first ? "Start meeting owls" : "Save"}</button>
    </form>
  </div>`;
}

/* ---------- discover: the swipe deck ---------- */
async function pDiscover() {
  APP.innerHTML = `${discHead()}<div class="deck"><div class="sk" style="position:absolute;inset:0;border-radius:24px"></div></div>`;
  try { const j = await api("/discover" + (TONIGHT ? "?tonight=1" : "")); CARDS = j.cards; } catch (e) { APP.innerHTML = `${discHead()}<div class="empty">${esc(e.message)}</div>`; return; }
  drawDeck();
}
function discHead() {
  const tn = DAYS[BOOT.tonight];
  return `<header class="row" style="justify-content:space-between;margin-bottom:12px">
    <div class="logo">${OWL(28)}night owl</div>
    <div class="row" style="gap:6px">${BOOT.online ? `<span class="badge g"><span class="pulse" aria-hidden="true"></span>${BOOT.online} online</span>` : ""}
    <button class="chip ${TONIGHT ? "on" : ""}" style="white-space:nowrap" data-act="tonight" aria-pressed="${TONIGHT}" aria-label="Only show people on tonight, ${tn}">${ic("moon", 14)}Tonight</button></div>
  </header>`;
}
function drawDeck() {
  PIDX = 0;
  const top = CARDS[0], next = CARDS[1];
  APP.innerHTML = `${discHead()}
    ${top ? `<div class="deck">${next ? cardHtml(next, true) : ""}${cardHtml(top, false)}</div>
    <div class="cbtns"><button class="cbtn sm undo" data-act="undo" aria-label="Undo last pass">${ic("undo")}</button><button class="cbtn nope" data-act="decide" data-like="0" aria-label="Pass on ${esc(top.name)}">${ic("x", 28)}</button><button class="cbtn like" data-act="decide" data-like="1" aria-label="Like ${esc(top.name)}">${ic("heart", 30)}</button><button class="cbtn sm info" data-act="profile" data-id="${esc(top.id)}" aria-label="See ${esc(top.name)}'s full profile">${ic("info")}</button></div>`
    : `<div class="empty" style="margin-top:20px"><img src="/owl-peek.webp" alt="" width="120" height="120" style="display:block;margin:0 auto"><h2 class="h2" style="margin:12px 0 6px;color:var(--text)">No more owls for now</h2>${TONIGHT ? "Nobody else is on tonight near you. Turn off “On tonight” to see everyone." : "You've seen everyone nearby. Check back later, or widen your age range or distance in Me."}<br><br><a class="btn m" href="#/me">Adjust who I see</a></div>`}`;
  const el = $(".pcard.top"); if (el) bindSwipe(el);
}
function cardHtml(c, behind) {
  return `<article class="pcard ${behind ? "behind" : "top"}" aria-label="${esc(c.name)}, ${c.age}">
    ${c.photos.map((p, i) => `<img src="${img(p)}" alt="" ${i ? "hidden" : ""} data-i="${i}">`).join("")}
    ${c.photos.length > 1 ? `<div class="bars">${c.photos.map((p, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div>` : ""}
    <span class="stamp like">LIKE</span><span class="stamp nope">NOPE</span>
    <div class="pinfo col" style="gap:8px">
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="pname">${esc(c.name)}</span><span style="font-size:24px;font-weight:300">${c.age}</span>${c.verified ? `<span class="badge v">${ic("check", 12)}Verified</span>` : ""}${c.demo ? `<span class="badge" style="background:#fff2;color:#fff">Demo</span>` : ""}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap">${c.onTonight ? `<span class="badge">${ic("moon", 12)}On tonight</span>` : ""}${c.online ? `<span class="badge g"><span class="pulse"></span>Online</span>` : ""}${c.km != null ? `<span class="chip" style="padding:4px 10px">${c.km} km away</span>` : c.town ? `<span class="chip" style="padding:4px 10px">${esc(c.town)}</span>` : ""}</div>
      ${c.job ? `<div class="small soft row" style="gap:6px">${ic("work", 15)}${esc(c.job)}${c.shift ? " · " + esc(c.shift) : ""}</div>` : ""}
      ${c.shared.length ? `<div class="small" style="color:var(--moon)">You're both on ${esc(nightsTxt(c.shared))} nights</div>` : ""}
      ${c.bio ? `<div class="small soft" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(c.bio)}</div>` : ""}
    </div>
  </article>`;
}
function bindSwipe(el) {
  let x0 = 0, y0 = 0, dx = 0, dy = 0, down = false;
  const like = el.querySelector(".stamp.like"), nope = el.querySelector(".stamp.nope");
  el.addEventListener("pointerdown", (e) => { down = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; });
  el.addEventListener("pointermove", (e) => {
    if (!down) return; dx = e.clientX - x0; dy = e.clientY - y0;
    el.style.transform = `translate(${dx}px,${dy * 0.25}px) rotate(${dx / 20}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 90)); nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  el.addEventListener("pointerup", (e) => {
    if (!down) return; down = false;
    if (Math.abs(dx) > 100) return decide(dx > 0);
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { const r = el.getBoundingClientRect(); stepPhoto(e.clientX - r.left > r.width / 2 ? 1 : -1); }
    el.style.transition = "transform .25s"; el.style.transform = ""; like.style.opacity = 0; nope.style.opacity = 0;
  });
  el.addEventListener("pointercancel", () => { down = false; el.style.transform = ""; });
}
function stepPhoto(d) {
  const el = $(".pcard.top"); if (!el) return; const imgs = el.querySelectorAll("img"); if (imgs.length < 2) return;
  PIDX = Math.max(0, Math.min(imgs.length - 1, PIDX + d));
  imgs.forEach((im, i) => (im.hidden = i !== PIDX)); el.querySelectorAll(".bars span").forEach((b, i) => b.classList.toggle("on", i === PIDX));
}
function react(like) {
  document.querySelectorAll(".react").forEach((x) => x.remove());
  const d = document.createElement("div"); d.className = "react " + (like ? "yes" : "no"); d.setAttribute("aria-hidden", "true");
  d.innerHTML = like ? `<div class="peek"><img src="/owl-peek.webp" alt=""><span class="bub2">Twit twoo!</span></div><span class="hrt a">${ic("heart", 26)}</span><span class="hrt b">${ic("heart", 18)}</span><span class="hrt c">${ic("heart", 22)}</span>`
    : `<div class="eyeball"><img src="/owl-eye.jpg" alt=""></div>`;
  document.body.appendChild(d); setTimeout(() => d.remove(), like ? 1100 : 1150);
}
let DECIDING = false;
async function decide(like) {
  if (DECIDING) return; const c = CARDS[0], el = $(".pcard.top"); if (!c || !el) return; DECIDING = true;
  el.style.transition = "transform .3s ease-out, opacity .3s"; el.style.transform = `translate(${like ? 150 : -150}%,0) rotate(${like ? 22 : -22}deg)`; el.style.opacity = "0";
  const st = el.querySelector(like ? ".stamp.like" : ".stamp.nope"); if (st) st.style.opacity = 1;
  react(like);
  let j = null; try { j = await api("/swipe", { id: c.id, like }); } catch (e) { toast(e.message); }
  setTimeout(() => { CARDS.shift(); DECIDING = false; drawDeck(); if (j && j.match) matchOverlay(j.match); if (CARDS.length < 3) topUp(); }, 260);
}
async function topUp() { try { const j = await api("/discover" + (TONIGHT ? "?tonight=1" : "")); const have = new Set(CARDS.map((c) => c.id)); for (const c of j.cards) if (!have.has(c.id)) CARDS.push(c); if (!$(".pcard.top")) drawDeck(); } catch (e) {} }
function matchOverlay(m) {
  const d = document.createElement("div"); d.className = "match"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "It's a match");
  d.innerHTML = `${OWLSVG(84, "wink")}<div><div class="h1" style="font-size:40px">It's a match!</div><p class="soft" style="margin:8px 0 0">You and ${esc(m.user.name)} like each other${m.user.shared.length ? `, and you're both on ${esc(nightsTxt(m.user.shared))} nights` : ""}.</p></div>
    <div class="pair">${ME.photos[0] ? `<img src="${img(ME.photos[0])}" alt="You">` : ""}<img src="${img(m.user.photos[0])}" alt="${esc(m.user.name)}"></div>
    <div class="col" style="width:100%;max-width:340px"><a class="btn p big block" href="#/chat/${enc(m.id)}">Send a message</a><button class="btn block" data-act="closematch">Keep swiping</button></div>`;
  document.body.appendChild(d); UNREAD++;
}
function profileSheet(c) {
  sheet(`<div class="row"><h2 class="h1 grow" style="font-size:28px">${esc(c.name)} <span style="font-weight:300">${c.age}</span></h2><button class="ibtn" data-act="closesheet" aria-label="Close">${ic("x")}</button></div>
    <div class="row" style="gap:6px;flex-wrap:wrap">${c.onTonight ? `<span class="badge">${ic("moon", 12)}On tonight</span>` : ""}${c.online ? `<span class="badge g"><span class="pulse"></span>Online</span>` : ""}${c.km != null ? `<span class="chip">${c.km} km away</span>` : ""}${c.town ? `<span class="chip">${esc(c.town)}</span>` : ""}</div>
    ${c.job ? `<div class="soft row" style="gap:8px">${ic("work", 16)}${esc(c.job)}${c.shift ? " · " + esc(c.shift) : ""}</div>` : ""}
    ${c.nights.length ? `<div class="small"><span class="muted">Works:</span> ${esc(nightsTxt(c.nights))} nights${c.shared.length ? ` · <span class="moon">same as you on ${esc(nightsTxt(c.shared))}</span>` : ""}</div>` : ""}
    ${c.bio ? `<p style="margin:0;line-height:1.55;white-space:pre-wrap">${esc(c.bio)}</p>` : ""}
    ${Object.entries(c.prompts || {}).map(([q, a]) => `<div class="card" style="padding:12px 14px"><div class="tiny muted">${esc(q)}</div><div style="font-weight:600;margin-top:4px">${esc(a)}</div></div>`).join("")}
    ${c.photos.map((p) => `<img src="${img(p)}" alt="" style="width:100%;border-radius:16px;object-fit:cover;max-height:520px">`).join("")}
    <div class="row" style="gap:8px"><button class="btn grow" data-act="report" data-uid="${esc(c.id)}">Report</button><button class="btn grow" data-act="block" data-uid="${esc(c.id)}">Block</button></div>`);
}

/* ---------- matches and chat ---------- */
async function pMatches() {
  APP.innerHTML = `<div class="col" style="gap:16px"><h1 class="h1" style="font-size:28px">Matches</h1><div class="sk" style="height:90px"></div><div class="sk" style="height:220px"></div></div>`;
  let j; try { j = await api("/matches"); } catch (e) { APP.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  UNREAD = j.unread; nav("matches");
  const fresh = j.matches.filter((m) => !m.last), talk = j.matches.filter((m) => m.last);
  APP.innerHTML = `<div class="col" style="gap:18px"><h1 class="h1" style="font-size:28px">Matches</h1>
    ${fresh.length ? `<section class="col" style="gap:10px"><div class="kicker">New matches · say hello</div><div class="newm">${fresh.map((m) => `<a href="#/chat/${enc(m.id)}"><img src="${img(m.user.photos[0])}" alt="">${esc(m.user.name)}</a>`).join("")}</div></section>` : ""}
    <section class="col" style="gap:0"><div class="kicker">Messages</div>
      ${talk.map((m) => `<a class="crow" href="#/chat/${enc(m.id)}"><img class="av" src="${img(m.user.photos[0])}" alt=""><div class="grow"><div class="row" style="gap:6px"><b>${esc(m.user.name)}</b>${m.user.online ? '<span class="pulse" aria-label="Online"></span>' : ""}${m.user.onTonight ? `<span class="tiny moon">${ic("moon", 12)}</span>` : ""}</div><div class="small ${m.unread ? "" : "muted"}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${m.unread ? "font-weight:700" : ""}">${m.last.mine ? "You: " : ""}${esc(m.last.t)}</div></div><span class="tiny muted">${ago(m.last.at)}</span>${m.unread ? '<span class="pulse" style="background:var(--pink)"></span>' : ""}</a>`).join("") || (fresh.length ? `<p class="note" style="margin-top:10px">Tap a new match above to start chatting.</p>` : `<div class="empty" style="margin-top:10px">No matches yet. Keep swiping, the night is young.<br><br><a class="btn m" href="#/">Discover</a></div>`)}
    </section></div>`;
}
const ICE = ["What's your 3am snack?", "Which nights are you on this week?", "Coffee or energy drinks?", "Best and worst thing about nights?"];
async function pChat(id) {
  let j; try { j = await api("/chat/" + enc(id)); } catch (e) { APP.innerHTML = `<div class="col"><a href="#/matches" class="ibtn" aria-label="Back">${ic("back")}</a><div class="empty">${esc(e.message)}</div></div>`; return; }
  const u = j.match.user;
  const draw = (msgs) => msgs.map((m) => `<div class="msg ${m.mine ? "me" : ""}" data-at="${m.at}"><div class="bub">${esc(m.t)}</div></div>`).join("");
  APP.innerHTML = `<div class="col" style="gap:12px">
    <div class="row"><a href="#/matches" class="ibtn" aria-label="Back to matches">${ic("back")}</a><button class="row grow" style="background:none;border:0;padding:0;text-align:left;gap:10px" data-act="chatprofile"><img class="av sm" src="${img(u.photos[0])}" alt=""><span><b>${esc(u.name)}</b><span class="tiny ${u.online ? "" : "muted"}" style="display:block;${u.online ? "color:var(--good)" : ""}">${u.online ? "Online now" : u.onTonight ? "On tonight" : u.job || ""}</span></span></button><button class="ibtn" data-act="chatmenu" aria-label="More options">${ic("dots")}</button></div>
    <div id="msgs" class="col" style="gap:8px;min-height:50vh">${draw(j.msgs) || `<div class="empty"><img src="${img(u.photos[0])}" alt="" style="width:84px;height:84px;border-radius:42px;object-fit:cover"><br>You matched with ${esc(u.name)} ${ago(j.match.at)} ago. Say hello!<div class="chips" style="justify-content:center;margin-top:12px">${ICE.map((q) => `<button class="chip" data-act="ice" data-t="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>`}</div>
    <form data-form="msg" class="compose"><input type="hidden" name="mid" value="${esc(id)}"><label class="sr" for="mt">Message</label><textarea class="f grow" id="mt" name="text" rows="1" maxlength="1000" placeholder="Message ${esc(u.name)}…"></textarea><button class="ibtn" style="background:linear-gradient(135deg,var(--pink),#FF8A6B);border:0;color:#fff" aria-label="Send">${ic("send", 18)}</button></form>
  </div>`;
  CHATU = u; CHATID = id;
  window.scrollTo(0, document.body.scrollHeight);
  TIMER = setInterval(async () => {
    const box = $("#msgs"); if (!box) return clearInterval(TIMER);
    try { const k = await api("/chat/" + enc(id)); if (k.msgs.length !== box.querySelectorAll(".msg").length) { box.innerHTML = draw(k.msgs); window.scrollTo(0, document.body.scrollHeight); } } catch (e) { if (e.status === 404) { clearInterval(TIMER); toast("This chat has ended."); location.hash = "#/matches"; } }
  }, 4000);
}
let CHATU = null, CHATID = null;

/* ---------- me ---------- */
async function pMe() {
  await refreshMe().catch(() => {});
  const u = ME;
  APP.innerHTML = `<div class="col" style="gap:18px">
    <div class="col" style="align-items:center;text-align:center;gap:8px;margin-top:6px">${u.photos[0] ? `<img class="av lg" src="${img(u.photos[0])}" alt="">` : `<div class="av lg" style="display:flex;align-items:center;justify-content:center">${OWL(48)}</div>`}
      <h1 class="h1" style="font-size:28px">${esc(u.name)}, ${u.age}</h1><div class="small muted">@${esc(u.username)}${u.job ? " · " + esc(u.job) : ""}</div>
      <div class="row" style="gap:8px"><a class="btn m" href="#/edit">Edit profile</a><button class="btn" data-act="preview">Preview</button></div></div>
    ${u.complete ? "" : `<a href="#/setup" class="card" style="border-color:var(--moon);color:var(--text)">Your profile isn't finished, so nobody can see you yet. <b class="moon">Finish it</b></a>`}
    <form data-form="prefs" class="card col" novalidate><h2 class="h2">Who I see</h2>
      <fieldset style="border:0;padding:0;margin:0"><legend class="l">Show me</legend><div class="chips">${[["men", "Men"], ["women", "Women"], ["everyone", "Everyone"]].map(([v, t]) => `<label class="chip"><input type="radio" name="seeking" value="${v}" ${u.seeking === v ? "checked" : ""}>${t}</label>`).join("")}</div></fieldset>
      <div class="row"><div class="grow"><label class="l" for="a1">Age from</label><input class="f" id="a1" name="ageMin" type="number" inputmode="numeric" min="18" max="99" value="${u.ageMin}"></div><div class="grow"><label class="l" for="a2">to</label><input class="f" id="a2" name="ageMax" type="number" inputmode="numeric" min="18" max="99" value="${u.ageMax}"></div></div>
      <div><label class="l" for="mk">Up to <output id="mko">${u.maxKm}</output> km away</label><input id="mk" name="maxKm" type="range" min="2" max="200" step="1" value="${u.maxKm}" style="width:100%;accent-color:var(--pink)" oninput="document.getElementById('mko').textContent=this.value"></div>
      <button class="btn p">Save</button></form>
    <form data-form="pw" class="card col" novalidate><h2 class="h2">Change password</h2>
      <div><label class="l" for="pc">Current password</label><input class="f" id="pc" name="current" type="password" autocomplete="current-password"></div>
      <div><label class="l" for="pn">New password (8+ characters)</label><input class="f" id="pn" name="password" type="password" autocomplete="new-password"></div><button class="btn">Save password</button></form>
    <div class="row" style="flex-wrap:wrap;gap:8px"><a class="btn" href="#/safety">${ic("shield", 18)}Safety & privacy</a><button class="btn" data-act="logout">Log out</button><button class="btn" data-act="delacc" style="color:var(--bad);border-color:var(--bad)">Delete account</button>${ADMIN ? '<a class="btn" href="#/admin">Admin</a>' : ""}</div>
  </div>`;
}

/* ---------- safety ---------- */
function pSafety() {
  APP.innerHTML = `<div class="col" style="gap:16px;line-height:1.55">
    <a href="javascript:history.back()" class="ibtn" aria-label="Back">${ic("back")}</a>
    <h1 class="h1" style="font-size:28px">Safety & privacy</h1>
    <section class="card col" style="gap:8px"><h2 class="h2">Meeting someone</h2>
      <span class="soft small">Meet in a busy public place, and tell a friend where you're going and who with. Get yourself there and back. Keep chatting on Night Owl until you're comfortable. Never send money to someone you've met online. If something feels off, trust it and leave. If you're in danger, call 999.</span></section>
    <section class="card col" style="gap:8px"><h2 class="h2">House rules</h2>
      <span class="soft small">18 and over only. Be respectful. No nudity, harassment, hate, scams or selling. Your photos must be of you. Report anyone who breaks the rules: three reports and they're suspended while we check.</span></section>
    <section class="card col" style="gap:8px"><h2 class="h2">Your data</h2>
      <span class="soft small">We store your username, first name, date of birth (to check you're 18+ and show your age), gender and who you'd like to meet, your photos, profile and messages, and a rough location to about 1 km. We never show your exact location, and never sell your data. You can delete your account and everything in it from Me at any time.</span></section>
    <p class="note">Night Owl is in private testing. Full terms and privacy policy will be published before launch.</p>
  </div>`;
}

/* ---------- admin ---------- */
async function pAdmin() {
  if (!ADMIN) { APP.innerHTML = `<div class="col" style="gap:16px"><div class="logo">${OWL(28)}admin</div><form data-form="adminkey" class="col"><label class="l" for="ak">Admin key</label><input class="f" id="ak" name="key" type="password" autocomplete="off"><button class="btn m">Unlock</button></form><a href="#/" class="btn">Back to Night Owl</a></div>`; return; }
  let j; try { j = await api("/admin/overview"); } catch (e) { if (e.status === 403) { ADMIN = null; LS.set("owlAdmin", null); return pAdmin(); } APP.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  APP.innerHTML = `<div class="col" style="gap:16px"><div class="row"><div class="logo grow">${OWL(28)}admin</div><a href="#/" class="btn">Back</a></div>
    <div class="chips"><span class="chip">${j.users} users</span><span class="chip">${j.complete} complete</span><span class="chip">${j.matches} matches</span><span class="chip">${j.swipes} swipes</span><span class="chip">${j.banned} banned</span><span class="chip">storage: ${esc(j.store.mode)}</span></div>
    <section class="col"><h2 class="h2">Reports · ${j.reports.length}</h2>${j.reports.map((r) => `<div class="card col" style="gap:8px"><div class="row"><b class="grow">${r.user ? `@${esc(r.user.username)} · ${esc(r.user.name)}, ${r.user.age}` : "Deleted user"}</b><span class="chip">${r.count} report${r.count === 1 ? "" : "s"}</span></div>
      ${r.user ? `<div class="pgrid">${r.user.photos.map((p) => `<div class="pslot"><img src="${img(p)}" alt=""><button class="x" data-act="adm" data-a="delphoto" data-uid="${esc(r.uid)}" data-img="${esc(p)}" aria-label="Delete photo">${ic("x", 14)}</button></div>`).join("")}</div><div class="small soft">${esc(r.user.bio)}</div>` : ""}
      <div class="tiny muted">${r.reasons.map(esc).join(" · ")}</div>
      <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn" data-act="adm" data-a="${r.user && r.user.banned ? "unban" : "ban"}" data-uid="${esc(r.uid)}">${r.user && r.user.banned ? "Unban" : "Ban"}</button><button class="btn" data-act="adm" data-a="dismiss" data-uid="${esc(r.uid)}">Dismiss</button><button class="btn" data-act="adm" data-a="delete" data-uid="${esc(r.uid)}" style="color:var(--bad)">Delete account</button></div></div>`).join("") || `<div class="empty">Nothing reported.</div>`}</section>
    <section class="col"><h2 class="h2">Newest photos</h2><p class="note">Check new uploads. Tap × to remove one.</p><div class="pgrid">${j.photos.map((x) => `<div class="pslot"><img src="${img(x.img)}" alt="Photo by ${esc(x.username)}"><span class="main" style="background:var(--card);color:var(--text)">@${esc(x.username)}</span><button class="x" data-act="adm" data-a="delphoto" data-uid="${esc(x.uid)}" data-img="${esc(x.img)}" aria-label="Delete photo">${ic("x", 14)}</button></div>`).join("") || '<div class="tiny muted">None yet.</div>'}</div></section>
    <section class="card col"><h2 class="h2">Demo profiles · ${j.demo}</h2><p class="note">Pretend people for testing, always labelled "Demo". They like you back about 2 times in 3 and reply to messages. Remove them before launch.</p><div class="row" style="gap:8px"><button class="btn m grow" data-act="demo" data-a="add">Add demo profiles</button><button class="btn grow" data-act="demo" data-a="remove">Remove them</button></div></section>
    <section class="card col"><h2 class="h2">Reset a password</h2><form data-form="admreset" class="row" novalidate><input class="f grow" name="username" placeholder="Username" aria-label="Username"><button class="btn m">Reset</button></form></section>
    <section class="card col" style="border-color:var(--bad)"><h2 class="h2" style="color:var(--bad)">Start fresh</h2><p class="note">Deletes every account, photo, swipe, match and message.</p><form data-form="admwipe" class="col" novalidate><input class="f" name="confirm" placeholder="Type DELETE" aria-label="Type DELETE to confirm"><button class="btn" style="color:var(--bad);border-color:var(--bad)">Wipe everything</button></form></section>
    <button class="btn" data-act="admlock">Lock admin</button></div>`;
}

/* ---------- photos ---------- */
async function shrink(file) {
  let src; try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) { src = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Can't read that photo.")); i.src = URL.createObjectURL(file); }); }
  const s = Math.min(1, 1280 / Math.max(src.width, src.height)), c = document.createElement("canvas"); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  let q = 0.82, d = c.toDataURL("image/jpeg", q); while (d.length > 1.15e6 && q > 0.4) { q -= 0.1; d = c.toDataURL("image/jpeg", q); } return d;
}

/* ---------- actions ---------- */
const ACT = {
  landmode(d) { LANDMODE = d.k; pLanding(); },
  tonight() { TONIGHT = !TONIGHT; pDiscover(); },
  decide(d) { decide(d.like === "1"); },
  async undo() { const j = await api("/rewind", {}); if (!j.card) return toast("Nothing to undo."); CARDS.unshift(j.card); drawDeck(); },
  profile(d) { const c = CARDS.find((x) => x.id === d.id); if (c) profileSheet(c); },
  closesheet() { closeSheet(); }, closematch() { const m = $(".match"); if (m) m.remove(); },
  chatprofile() { if (CHATU) profileSheet(CHATU); },
  chatmenu() { sheet(`<h2 class="h2">${esc(CHATU.name)}</h2><button class="btn block" data-act="chatprofile">See profile</button><button class="btn block" data-act="unmatch">Unmatch</button><button class="btn block" data-act="report" data-uid="${esc(CHATU.id)}">Report</button><button class="btn block" data-act="block" data-uid="${esc(CHATU.id)}">Block</button><button class="btn block" data-act="closesheet">Cancel</button>`); },
  async unmatch() { await api("/unmatch", { mid: CHATID }); closeSheet(); toast("Unmatched."); location.hash = "#/matches"; },
  async block(d) { await api("/block", { uid: d.uid }); closeSheet(); CARDS = CARDS.filter((c) => c.id !== d.uid); toast("Blocked. You won't see each other again."); if (location.hash.startsWith("#/chat")) location.hash = "#/matches"; else drawDeck(); },
  report(d) {
    sheet(`<h2 class="h2">Report</h2><p class="note">Reports are private. Three reports and the account is suspended while we check.</p>
      <form data-form="report" class="col"><input type="hidden" name="uid" value="${esc(d.uid)}">
      <div class="chips">${["Fake profile or photos", "Under 18", "Rude or harassing", "Scam or selling", "Nudity", "Something else"].map((r, i) => `<label class="chip"><input type="radio" name="reason" value="${esc(r)}" ${i ? "" : "checked"}>${esc(r)}</label>`).join("")}</div>
      <label class="check"><input type="checkbox" name="block" checked> Also block them</label>
      <button class="btn p">Send report</button><button type="button" class="btn" data-act="closesheet">Cancel</button></form>`);
  },
  ice(d) { const t = $("#mt"); if (t) { t.value = d.t; t.focus(); } },
  async loc(d, el) {
    if (!navigator.geolocation) return toast("Your phone can't share location here.");
    el.disabled = true; el.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(async (p) => { try { const j = await api("/me/location", { lat: p.coords.latitude, lng: p.coords.longitude }); ME = j.me; toast("Location saved, to about 1 km."); el.disabled = false; el.textContent = "Update my location"; } catch (e) { toast(e.message); el.disabled = false; } },
      (e) => { toast(e.code === 1 ? "Location is blocked. Allow it in your browser settings." : "Couldn't find you. Try again."); el.disabled = false; el.textContent = "Use my location"; }, { timeout: 15000, maximumAge: 600000 });
  },
  async delphoto(d) { const j = await api("/me/photo/del", { id: d.id }); ME = j.me; pSetup(); },
  async mainphoto(d) { const j = await api("/me/photo/main", { id: d.id }); ME = j.me; pSetup(); },
  preview() { const c = { ...ME, shared: [], km: null, online: true }; profileSheet(c); },
  logout() { sheet(`<h2 class="h2">Log out?</h2><p class="note">Log back in any time with your username and password.</p><button class="btn p" data-act="logoutyes">Log out</button><button class="btn" data-act="closesheet">Cancel</button>`); },
  async logoutyes() { await api("/logout", {}).catch(() => {}); AUTH = null; LS.set("owlAuth", null); ME = null; LANDMODE = "login"; closeSheet(); location.hash = "#/"; route(); },
  delacc() { sheet(`<h2 class="h2" style="color:var(--bad)">Delete your account?</h2><p class="note">This deletes your profile, photos, matches and messages for good.</p><form data-form="delacc" class="col" novalidate><label class="l" for="dp">Enter your password to confirm</label><input class="f" id="dp" name="password" type="password" autocomplete="current-password"><button class="btn" style="color:var(--bad);border-color:var(--bad)">Delete everything</button><button type="button" class="btn" data-act="closesheet">Cancel</button></form>`); },
  async adm(d) { await api("/admin/act", { uid: d.uid, action: d.a, img: d.img }); toast("Done."); pAdmin(); },
  async demo(d) { const j = await api("/admin/demo", { action: d.a }); toast(d.a === "add" ? (j.added ? `Added ${j.added} demo profiles.` : "Already added.") : `Removed ${j.removed}.`); CARDS = []; pAdmin(); },
  admlock() { ADMIN = null; LS.set("owlAdmin", null); location.hash = "#/"; },
};
const FORM = {
  async signup(v) {
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(v.username || "")) throw new Error("Username: 3 to 20 letters, numbers, dots or underscores.");
    if (!String(v.name || "").trim()) throw new Error("What's your first name?");
    if (String(v.password || "").length < 8) throw new Error("Password needs at least 8 characters.");
    if (!v.dob) throw new Error("Add your date of birth.");
    if (!v.gender) throw new Error("Choose how you identify.");
    if (!v.seeking) throw new Error("Choose who you'd like to meet.");
    if (!v.agree) throw new Error("Tick the box to confirm you're 18+ and agree to the rules.");
    const j = await api("/signup", { ...v, agree: true });
    AUTH = j.token; LS.set("owlAuth", AUTH); await refreshMe(); toast(`Welcome, ${ME.name}. Let's set up your profile.`); location.hash = "#/setup"; route();
  },
  async login(v) {
    if (!v.username || !v.password) throw new Error("Enter your username and password.");
    const j = await api("/login", v); AUTH = j.token; LS.set("owlAuth", AUTH); await refreshMe(); toast(`Welcome back, ${ME.name}.`); location.hash = "#/"; route(); poll();
  },
  async profile(v) {
    const prompts = {}; for (const [k, val] of Object.entries(v)) if (k.startsWith("p:")) prompts[k.slice(2)] = val;
    const j = await api("/me/update", { job: v.job, shift: v.shift, nights: v.nights || [], bio: v.bio, town: v.town, prompts });
    ME = j.me;
    if (!ME.photos.length) throw new Error("Add at least one photo so people can see you.");
    toast("Saved."); location.hash = location.hash.startsWith("#/edit") ? "#/me" : "#/"; route();
  },
  async prefs(v) { const j = await api("/me/update", { seeking: v.seeking, ageMin: +v.ageMin, ageMax: +v.ageMax, maxKm: +v.maxKm }); ME = j.me; toast("Saved. Your deck will update."); },
  async pw(v) { if (String(v.password || "").length < 8) throw new Error("New password needs at least 8 characters."); await api("/me/password", v); toast("Password changed."); pMe(); },
  async delacc(v) { await api("/me/delete", { password: v.password }); AUTH = null; LS.set("owlAuth", null); ME = null; closeSheet(); toast("Your account has been deleted."); location.hash = "#/"; route(); },
  async report(v) { await api("/report", { uid: v.uid, reason: v.reason, block: !!v.block }); closeSheet(); toast("Thanks. We'll look into it."); if (v.block) { CARDS = CARDS.filter((c) => c.id !== v.uid); if (location.hash.startsWith("#/chat")) location.hash = "#/matches"; else drawDeck(); } },
  async msg(v, form) {
    const t = String(v.text || "").trim(); if (!t) return;
    await api("/chat", { mid: v.mid, text: t }); form.reset();
    const box = $("#msgs"); if (box) { const e = box.querySelector(".empty"); if (e) e.remove(); box.insertAdjacentHTML("beforeend", `<div class="msg me" data-at="${NOW()}"><div class="bub">${esc(t)}</div></div>`); window.scrollTo(0, document.body.scrollHeight); }
  },
  async adminkey(v) { ADMIN = v.key; LS.set("owlAdmin", ADMIN); pAdmin(); },
  async admreset(v) { const j = await api("/admin/resetpw", { username: v.username }); sheet(`<h2 class="h2">New password for @${esc(j.username)}</h2><div class="code">${esc(j.temp)}</div><p class="note">Send it to them. They can change it in Me.</p><button class="btn" data-act="closesheet">Done</button>`); },
  async admwipe(v) { if (v.confirm !== "DELETE") throw new Error("Type DELETE in capitals."); await api("/admin/wipe", { confirm: "DELETE" }); AUTH = null; LS.set("owlAuth", null); ME = null; toast("Everything wiped."); pAdmin(); },
};
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return; e.preventDefault();
  if (el.dataset.busy) return; el.dataset.busy = "1";
  try { await fn({ ...el.dataset }, el); } catch (er) { toast(er.message); } finally { delete el.dataset.busy; }
});
document.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-form]"); if (!form) return; e.preventDefault();
  const fn = FORM[form.dataset.form]; if (!fn) return;
  const fd = new FormData(form), v = {};
  for (const [k, val] of fd.entries()) { if (k === "nights") (v.nights = v.nights || []).push(+val); else v[k] = val; }
  const btn = form.querySelector("button:not([type=button])"); if (btn) { if (btn.disabled) return; btn.disabled = true; }
  try { await fn(v, form); } catch (er) { toast(er.message); } finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && e.target.matches(".compose textarea")) { e.preventDefault(); e.target.form.requestSubmit(); }
  if (e.key === "Escape") closeSheet();
  if ($(".pcard.top") && !$("#sheet") && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { if (e.key === "ArrowRight") decide(true); if (e.key === "ArrowLeft") decide(false); }
});
document.addEventListener("change", async (e) => {
  if (!e.target.dataset || !e.target.dataset.upload) return;
  const files = [...e.target.files].slice(0, 6 - ME.photos.length); e.target.value = ""; if (!files.length) return toast("Six photos max.");
  toast("Uploading…");
  for (const f of files) { try { const d = await shrink(f); const j = await api("/me/photo", { data: d }); ME = j.me; } catch (er) { toast(er.message); break; } }
  pSetup(); toast("Photo added.");
});
boot();
})();
