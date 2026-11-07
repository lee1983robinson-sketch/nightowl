// Night Owl: dating for people who work while the world sleeps. No npm packages needed: Node 18+.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./lib/store");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();
const SITE_PASSWORD = (process.env.SITE_PASSWORD || "").trim(); // while in development: the whole site asks for this first
const PUB = path.join(__dirname, "public");
const VERSION = require("./package.json").version;

/* ---------- helpers ---------- */
const now = () => Date.now();
const rid = (n = 10) => crypto.randomBytes(n).toString("base64url").slice(0, n);
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const int = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
function send(res, code, obj) { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); }
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("Too big"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject(Object.assign(new Error("Bad JSON"), { code: 400 })); } });
    req.on("error", reject);
  });
}
const HITS = new Map();
function limited(key, max, ms) { const t = now(), a = (HITS.get(key) || []).filter((x) => t - x < ms); if (a.length >= max) { HITS.set(key, a); return true; } a.push(t); HITS.set(key, a); return false; }
setInterval(() => { const t = now(); for (const [k, v] of HITS) if (!v.length || t - v[v.length - 1] > 3600e3) HITS.delete(k); }, 600e3).unref();

/* ---------- accounts ---------- */
function pwHash(pw) { const salt = crypto.randomBytes(16).toString("hex"); return salt + ":" + crypto.scryptSync(String(pw), salt, 32).toString("hex"); }
function pwCheck(pw, stored) { if (!stored || !stored.includes(":")) return false; const [salt, h] = stored.split(":"); const a = Buffer.from(h, "hex"), b = crypto.scryptSync(String(pw), salt, 32); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function newSession(u) { const key = rid(24); u.keys = [sha(key), ...(u.keys || [])].slice(0, 6); store.put("users", u.id, u); return `${u.id}.${key}`; }
function authUser(req) {
  const [id, key] = String(req.headers["x-owl-auth"] || "").split("."); if (!id || !key) return null;
  const u = store.get("users", id); if (!u || u.banned) return null;
  return (u.keys || []).includes(sha(key)) ? u : null;
}
const byName = (n) => store.all("users").find((u) => u.username.toLowerCase() === String(n || "").trim().toLowerCase());
const isAdmin = (req) => ADMIN_KEY.length >= 8 && String(req.headers["x-owl-admin"] || "") === ADMIN_KEY;
function ageOf(dob) { const d = new Date(dob + "T12:00:00Z"); if (isNaN(d)) return null; const t = new Date(); let a = t.getUTCFullYear() - d.getUTCFullYear(); const m = t.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && t.getUTCDate() < d.getUTCDate())) a--; return a; }

/* ---------- night logic ---------- */
// "Tonight" runs 8pm to 8am UK time, so 2am on Wednesday still counts as Tuesday night.
function londonParts(t = now()) { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hour: +p.hour }; }
function tonight() { const { day, hour } = londonParts(); return hour < 8 ? (day + 6) % 7 : day; }
const isNight = () => { const { hour } = londonParts(); return hour >= 20 || hour < 8; };
const ONLINE = new Map(); // uid -> last seen
const onlineNow = (uid) => now() - (ONLINE.get(uid) || 0) < 15 * 60e3;

/* ---------- distance ---------- */
const rad = (d) => (d * Math.PI) / 180;
function km(a, b) { if (!a || !b || a.lat == null || b.lat == null) return null; const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); }

/* ---------- profiles ---------- */
const JOBS = ["NHS / nursing", "Care work", "Security", "Police", "Fire & ambulance", "Warehouse & logistics", "Driving", "Factory & production", "Hospitality & bars", "Retail & supermarkets", "Cleaning", "Call centre", "Other nights"];
const SHIFTS = ["Permanent nights", "Rotating shifts", "Lates", "Mix of days and nights"];
const PROMPTS = ["My 3am snack", "Best thing about nights", "After shift, you'll find me", "Song that gets me through a night", "Perfect day off"];
const complete = (u) => !!(u.photos && u.photos.length && u.name && u.dob && u.gender && u.seeking);
function profileOut(u, me) {
  const tn = tonight(), mine = new Set((me && me.nights) || []), shared = (u.nights || []).filter((d) => mine.has(d));
  const d = me ? km(me.loc, u.loc) : null;
  return { id: u.id, name: u.name, age: ageOf(u.dob), job: u.job || "", shift: u.shift || "", nights: u.nights || [], onTonight: (u.nights || []).includes(tn), shared, bio: u.bio || "", prompts: u.prompts || {}, photos: u.photos || [], town: u.town || "", km: d == null ? null : Math.max(1, Math.round(d)), online: u.demo ? demoOnline(u) : onlineNow(u.id), verified: !!u.verified, demo: !!u.demo };
}
function myProfile(u) { return { ...profileOut(u, null), username: u.username, dob: u.dob, gender: u.gender, seeking: u.seeking, ageMin: u.ageMin || 18, ageMax: u.ageMax || 60, maxKm: u.maxKm || 40, hasLoc: !!(u.loc && u.loc.lat != null), complete: complete(u) }; }
const wants = (a, b) => a.seeking === "everyone" || (a.seeking === "men" && b.gender === "man") || (a.seeking === "women" && b.gender === "woman");
const blockedEither = (a, b) => (a.blocked || []).includes(b.id) || (b.blocked || []).includes(a.id);

/* ---------- demo profiles (testing only, always labelled) ---------- */
const DEMO_REPLIES = [
  "Haha hiya! How's your night going?", "Ah that's class 😂 what shift are you on this week?", "I'm on tonight too, absolutely shattered already",
  "Same! Nights are a different world aren't they", "Ooh go on then, tell me more", "Coffee or energy drinks? Be honest 😅",
  "I'm on my break now, perfect timing", "Haha you're funny. Where abouts are you based?", "Fancy a brew after shift one morning? ☕",
  "That's the dream, a day off where I actually sleep", "Ha! Love that", "Sorry slow reply, been mad busy tonight 🙈",
];
const DEMO_ON = () => !!SITE_PASSWORD; // demo profiles only ever show while the site is private
const slot = () => Math.floor(now() / (15 * 60e3));
const demoOnline = (u) => { let h = 0; for (const ch of u.id + slot()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 100 < 62; };
async function seedDemo() {
  let people; try { people = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "demo", "people.json"), "utf8")); } catch (e) { throw new Error("Demo list missing."); }
  for (const u of store.all("users")) if (u.demo && !u.demoFile) deleteUser(u.id); // clear the old 16
  const have = new Set(store.all("users").filter((u) => u.demo).map((u) => u.demoFile)); let n = 0;
  for (const [i, d] of people.entries()) {
    if (have.has(d.file)) continue;
    let buf; try { buf = fs.readFileSync(path.join(__dirname, "public", "demo", d.file)); } catch (e) { continue; }
    const img = rid(14); try { await store.putImg(img, buf); } catch (e) { console.error("[demo] photo", d.file, e.message); continue; }
    const id = rid(8), dob = `${new Date().getFullYear() - d.age - 1}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`;
    store.put("users", id, { id, demo: true, demoFile: d.file, username: `demo_${d.file.slice(0, 3)}`, pw: "", name: d.name, dob, gender: d.gender, seeking: d.seeking, photos: [img], nights: d.nights, prompts: d.prompts, bio: d.bio, job: d.job, shift: d.shift, town: "Leeds", keys: [], blocked: [], ageMin: 18, ageMax: 99, maxKm: 500, loc: { lat: d.lat, lng: d.lng }, created: now() - Math.floor(Math.random() * 30) * 864e5 });
    n++;
  }
  return n;
}
function demoReply(mm, demoId) {
  setTimeout(() => {
    const cur = store.get("matches", mm.id); if (!cur || cur.ended) return;
    const said = new Set(cur.msgs.filter((x) => x.f === demoId).map((x) => x.t));
    const pool = DEMO_REPLIES.filter((t) => !said.has(t)); const t = (pool.length ? pool : DEMO_REPLIES)[Math.floor(Math.random() * (pool.length || DEMO_REPLIES.length))];
    cur.msgs.push({ f: demoId, t, at: now() }); store.put("matches", cur.id, cur);
  }, 3000 + Math.random() * 5000);
}

/* ---------- matches ---------- */
const mid = (a, b) => [a, b].sort().join("|");
function matchesOf(uid) { return store.all("matches").filter((m) => (m.a === uid || m.b === uid) && !m.ended); }
function matchOut(m, me) {
  const other = store.get("users", m.a === me.id ? m.b : m.a); if (!other || other.banned) return null;
  const last = m.msgs[m.msgs.length - 1];
  return { id: m.id, at: m.at, user: profileOut(other, me), last: last ? { t: last.t, mine: last.f === me.id, at: last.at } : null, unread: !!(last && last.f !== me.id && ((m.seen || {})[me.id] || 0) < last.at) };
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname, M = req.method, me = authUser(req);
  if (me) ONLINE.set(me.id, now());
  const need = () => { if (!me) { send(res, 401, { error: "Please log in." }); return false; } return true; };
  const body = M === "POST" ? await readBody(req, p === "/api/me/photo" ? 1.6 * 1024 * 1024 : 64 * 1024) : {};
  const slow = (k, max, ms) => { if (limited(`${k}:${me ? me.id : ipOf(req)}`, max, ms)) { send(res, 429, { error: "Slow down a bit and try again shortly." }); return true; } return false; };
  let m;

  if (p === "/api/status") return send(res, 200, { ok: true, version: VERSION, store: store.status(), admin: ADMIN_KEY.length >= 8, private: !!SITE_PASSWORD });
  if (p === "/api/boot") {
    const online = [...ONLINE.entries()].filter(([, t]) => now() - t < 15 * 60e3).length + (DEMO_ON() ? store.all("users").filter((u) => u.demo && demoOnline(u)).length : 0);
    return send(res, 200, { me: me ? myProfile(me) : null, online, night: isNight(), tonight: tonight(), jobs: JOBS, shifts: SHIFTS, prompts: PROMPTS, version: VERSION });
  }

  /* accounts */
  if (p === "/api/signup" && M === "POST") {
    if (limited("signup:" + ipOf(req), 6, 3600e3)) return send(res, 429, { error: "Too many sign-ups from here. Try later." });
    const username = clean(body.username, 20);
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) return send(res, 400, { error: "Username: 3 to 20 letters, numbers, dots or underscores." });
    if (byName(username)) return send(res, 409, { error: "That username's taken." });
    if (!(typeof body.password === "string" && body.password.length >= 8)) return send(res, 400, { error: "Password needs at least 8 characters." });
    const name = clean(body.name, 30); if (!name) return send(res, 400, { error: "What's your first name?" });
    const age = ageOf(String(body.dob || "")); if (age == null) return send(res, 400, { error: "Add your date of birth." });
    if (age < 18) return send(res, 400, { error: "Night Owl is for over-18s only." });
    if (age > 99) return send(res, 400, { error: "Check your date of birth." });
    if (!["man", "woman", "nonbinary"].includes(body.gender)) return send(res, 400, { error: "Choose how you identify." });
    if (!["men", "women", "everyone"].includes(body.seeking)) return send(res, 400, { error: "Choose who you'd like to meet." });
    if (!body.agree) return send(res, 400, { error: "Please confirm you're 18+ and agree to the terms." });
    const id = rid(8);
    const u = { id, username, pw: pwHash(body.password), name, dob: String(body.dob), gender: body.gender, seeking: body.seeking, photos: [], nights: [], prompts: {}, keys: [], blocked: [], ageMin: 18, ageMax: Math.min(99, Math.max(30, age + 12)), maxKm: 40, created: now() };
    store.put("users", id, u);
    return send(res, 200, { token: newSession(u) });
  }
  if (p === "/api/login" && M === "POST") {
    const n = String(body.username || "").trim().toLowerCase();
    if (limited("login:" + ipOf(req), 20, 900e3) || limited("loginname:" + n, 8, 900e3)) return send(res, 429, { error: "Too many tries. Wait 15 minutes." });
    const u = byName(n); if (!u || u.banned || !pwCheck(body.password, u.pw)) return send(res, 401, { error: "Username or password not right." });
    return send(res, 200, { token: newSession(u) });
  }
  if (p === "/api/logout" && M === "POST") { if (me) { const [, key] = String(req.headers["x-owl-auth"]).split("."); me.keys = (me.keys || []).filter((k) => k !== sha(key)); store.put("users", me.id, me); } return send(res, 200, { ok: true }); }
  if (p === "/api/me/update" && M === "POST") {
    if (!need()) return;
    if (body.name != null) me.name = clean(body.name, 30) || me.name;
    if (body.bio != null) me.bio = clean(body.bio, 500);
    if (body.job != null) me.job = JOBS.includes(body.job) ? body.job : "";
    if (body.shift != null) me.shift = SHIFTS.includes(body.shift) ? body.shift : "";
    if (body.nights != null) me.nights = [...new Set([].concat(body.nights).map((x) => int(x, 0, 6, -1)).filter((x) => x >= 0))];
    if (body.town != null) me.town = clean(body.town, 40);
    if (body.prompts != null && typeof body.prompts === "object") { const o = {}; for (const k of PROMPTS) { const v = clean(body.prompts[k], 120); if (v) o[k] = v; } me.prompts = o; }
    if (body.gender != null && ["man", "woman", "nonbinary"].includes(body.gender)) me.gender = body.gender;
    if (body.seeking != null && ["men", "women", "everyone"].includes(body.seeking)) me.seeking = body.seeking;
    if (body.ageMin != null) me.ageMin = int(body.ageMin, 18, 99, 18);
    if (body.ageMax != null) me.ageMax = int(body.ageMax, me.ageMin || 18, 99, 60);
    if (body.maxKm != null) me.maxKm = int(body.maxKm, 2, 500, 40);
    store.put("users", me.id, me); return send(res, 200, { me: myProfile(me) });
  }
  if (p === "/api/me/location" && M === "POST") {
    if (!need()) return; const lat = +body.lat, lng = +body.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return send(res, 400, { error: "Couldn't read your location." });
    me.loc = { lat: +lat.toFixed(2), lng: +lng.toFixed(2) }; // about 1 km: never an exact spot
    store.put("users", me.id, me); return send(res, 200, { me: myProfile(me) });
  }
  if (p === "/api/me/photo" && M === "POST") {
    if (!need()) return; if (slow("photo", 30, 3600e3)) return;
    if ((me.photos || []).length >= 6) return send(res, 400, { error: "Six photos max. Remove one first." });
    const mt = String(body.data || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/); if (!mt) return send(res, 400, { error: "That photo didn't come through." });
    const buf = Buffer.from(mt[1], "base64"); if (buf.length < 2000 || buf.length > 900 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 400, { error: "That photo didn't come through." });
    const img = rid(14); try { await store.putImg(img, buf); } catch (e) { return send(res, 500, { error: "Couldn't save the photo." }); }
    me.photos = [...(me.photos || []), img]; store.put("users", me.id, me);
    const q = store.get("meta", "photoq") || { list: [] }; q.list = [{ uid: me.id, img, at: now() }, ...q.list].slice(0, 200); store.put("meta", "photoq", q);
    return send(res, 200, { me: myProfile(me) });
  }
  if (p === "/api/me/photo/del" && M === "POST") { if (!need()) return; const id = String(body.id || ""); if (!(me.photos || []).includes(id)) return send(res, 404, { error: "Not found." }); me.photos = me.photos.filter((x) => x !== id); store.delImg(id); store.put("users", me.id, me); return send(res, 200, { me: myProfile(me) }); }
  if (p === "/api/me/photo/main" && M === "POST") { if (!need()) return; const id = String(body.id || ""); if (!(me.photos || []).includes(id)) return send(res, 404, { error: "Not found." }); me.photos = [id, ...me.photos.filter((x) => x !== id)]; store.put("users", me.id, me); return send(res, 200, { me: myProfile(me) }); }
  if (p === "/api/me/password" && M === "POST") {
    if (!need()) return; if (!pwCheck(body.current, me.pw)) return send(res, 400, { error: "Current password isn't right." });
    if (!(typeof body.password === "string" && body.password.length >= 8)) return send(res, 400, { error: "New password needs at least 8 characters." });
    me.pw = pwHash(body.password); store.put("users", me.id, me); return send(res, 200, { ok: true });
  }
  if (p === "/api/me/delete" && M === "POST") {
    if (!need()) return; if (!pwCheck(body.password, me.pw)) return send(res, 400, { error: "Password isn't right." });
    deleteUser(me.id); return send(res, 200, { ok: true });
  }

  /* discover */
  if (p === "/api/discover") {
    if (!need()) return;
    if (!complete(me)) return send(res, 200, { cards: [], incomplete: true });
    const onlyTonight = url.searchParams.get("tonight") === "1", tn = tonight();
    const seen = new Set(store.all("swipes").filter((s) => s.from === me.id).map((s) => s.to));
    const cand = store.all("users").filter((u) => u.id !== me.id && !u.banned && (!u.demo || DEMO_ON()) && complete(u) && !seen.has(u.id) && !blockedEither(me, u) && wants(me, u) && wants(u, me))
      .map((u) => ({ u, age: ageOf(u.dob), d: km(me.loc, u.loc) }))
      .filter((x) => x.age >= (me.ageMin || 18) && x.age <= (me.ageMax || 99) && (x.d == null || x.d <= (me.maxKm || 40)))
      .filter((x) => !onlyTonight || (x.u.nights || []).includes(tn))
      .map((x) => { const shared = (x.u.nights || []).filter((d) => (me.nights || []).includes(d)).length; const score = ((x.u.nights || []).includes(tn) ? 40 : 0) + shared * 8 + (onlineNow(x.u.id) ? 25 : 0) + (x.u.shift && x.u.shift === me.shift ? 6 : 0) - (x.d == null ? 15 : Math.min(30, x.d * 0.4)) + Math.random() * 6; return { ...x, score }; })
      .sort((a, b) => b.score - a.score).slice(0, 40);
    return send(res, 200, { cards: cand.map((x) => profileOut(x.u, me)) });
  }
  if (p === "/api/swipe" && M === "POST") {
    if (!need()) return; if (slow("swipe", 300, 3600e3)) return;
    const other = store.get("users", String(body.id || "")); if (!other || other.id === me.id) return send(res, 404, { error: "Not found." });
    const like = !!body.like; store.put("swipes", `${me.id}:${other.id}`, { from: me.id, to: other.id, like, at: now() });
    if (like) {
      if (other.demo && !store.get("swipes", `${other.id}:${me.id}`) && Math.random() < 0.65) store.put("swipes", `${other.id}:${me.id}`, { from: other.id, to: me.id, like: true, at: now() });
      const back = store.get("swipes", `${other.id}:${me.id}`);
      if (back && back.like && !blockedEither(me, other)) {
        const id = mid(me.id, other.id); let mm = store.get("matches", id);
        if (!mm || mm.ended) { mm = store.put("matches", id, { id, a: me.id, b: other.id, at: now(), msgs: [], seen: {} }); }
        return send(res, 200, { match: matchOut(mm, me) });
      }
    }
    return send(res, 200, { match: null });
  }
  if (p === "/api/rewind" && M === "POST") { if (!need()) return; const s = store.all("swipes").filter((x) => x.from === me.id && !x.like).sort((a, b) => b.at - a.at)[0]; if (!s) return send(res, 200, { card: null }); store.del("swipes", `${me.id}:${s.to}`); const u = store.get("users", s.to); return send(res, 200, { card: u ? profileOut(u, me) : null }); }
  if (p === "/api/likes") { if (!need()) return; const mine = new Set(store.all("swipes").filter((s) => s.from === me.id).map((s) => s.to)); const n = store.all("swipes").filter((s) => s.to === me.id && s.like && !mine.has(s.from)).length; return send(res, 200, { likedYou: n }); }

  /* matches & chat */
  if (p === "/api/matches") { if (!need()) return; const L = matchesOf(me.id).map((x) => matchOut(x, me)).filter(Boolean).sort((a, b) => (b.last ? b.last.at : b.at) - (a.last ? a.last.at : a.at)); return send(res, 200, { matches: L, unread: L.filter((x) => x.unread).length }); }
  if ((m = p.match(/^\/api\/chat\/([\w%|-]+)$/)) && M === "GET") {
    if (!need()) return; const mm = store.get("matches", decodeURIComponent(m[1])); if (!mm || mm.ended || (mm.a !== me.id && mm.b !== me.id)) return send(res, 404, { error: "This chat has ended." });
    mm.seen = mm.seen || {}; mm.seen[me.id] = now(); store.put("matches", mm.id, mm);
    const o = matchOut(mm, me); if (!o) return send(res, 404, { error: "This chat has ended." });
    return send(res, 200, { match: o, msgs: mm.msgs.map((x) => ({ mine: x.f === me.id, t: x.t, at: x.at })) });
  }
  if (p === "/api/chat" && M === "POST") {
    if (!need()) return; if (slow("msg", 40, 600e3)) return;
    const mm = store.get("matches", String(body.mid || "")); if (!mm || mm.ended || (mm.a !== me.id && mm.b !== me.id)) return send(res, 404, { error: "This chat has ended." });
    const t = clean(body.text, 1000); if (!t) return send(res, 400, { error: "Say something first." });
    mm.msgs.push({ f: me.id, t, at: now() }); if (mm.msgs.length > 500) mm.msgs = mm.msgs.slice(-500); mm.seen = mm.seen || {}; mm.seen[me.id] = now();
    store.put("matches", mm.id, mm);
    const oid = mm.a === me.id ? mm.b : mm.a, ou = store.get("users", oid); if (ou && ou.demo) demoReply(mm, oid);
    return send(res, 200, { ok: true });
  }
  if (p === "/api/unmatch" && M === "POST") { if (!need()) return; const mm = store.get("matches", String(body.mid || "")); if (mm && (mm.a === me.id || mm.b === me.id)) { mm.ended = now(); store.put("matches", mm.id, mm); } return send(res, 200, { ok: true }); }
  if (p === "/api/block" && M === "POST") {
    if (!need()) return; const o = store.get("users", String(body.uid || "")); if (!o || o.id === me.id) return send(res, 404, { error: "Not found." });
    me.blocked = [...new Set([...(me.blocked || []), o.id])]; store.put("users", me.id, me);
    const mm = store.get("matches", mid(me.id, o.id)); if (mm && !mm.ended) { mm.ended = now(); store.put("matches", mm.id, mm); }
    return send(res, 200, { ok: true });
  }
  if (p === "/api/report" && M === "POST") {
    if (!need()) return; if (slow("report", 20, 3600e3)) return;
    const o = store.get("users", String(body.uid || "")); if (!o) return send(res, 404, { error: "Not found." });
    const k = o.id; const r = store.get("reports", k) || { id: k, uid: k, by: [], reasons: [], at: now(), status: "open" };
    if (!r.by.includes(me.id)) { r.by.push(me.id); r.reasons.push(clean(body.reason, 200) || "No reason given"); }
    r.status = "open"; r.last = now(); store.put("reports", k, r);
    if (r.by.length >= 3 && !o.banned) { o.banned = true; o.autoBanned = true; store.put("users", o.id, o); }
    if (body.block) { me.blocked = [...new Set([...(me.blocked || []), o.id])]; store.put("users", me.id, me); const mm = store.get("matches", mid(me.id, o.id)); if (mm && !mm.ended) { mm.ended = now(); store.put("matches", mm.id, mm); } }
    return send(res, 200, { ok: true });
  }

  /* admin */
  if (p.startsWith("/api/admin/")) {
    if (!isAdmin(req)) return send(res, 403, { error: "Admin key wrong." });
    if (p === "/api/admin/overview") {
      const U = store.all("users");
      const reps = store.all("reports").filter((r) => r.status === "open").sort((a, b) => (b.last || b.at) - (a.last || a.at)).map((r) => { const u = store.get("users", r.uid); return { ...r, count: r.by.length, user: u ? { id: u.id, username: u.username, name: u.name, age: ageOf(u.dob), photos: u.photos || [], bio: u.bio || "", banned: !!u.banned } : null }; });
      const q = (store.get("meta", "photoq") || { list: [] }).list.filter((x) => { const u = store.get("users", x.uid); return u && (u.photos || []).includes(x.img); }).slice(0, 60).map((x) => ({ ...x, username: (store.get("users", x.uid) || {}).username }));
      return send(res, 200, { users: U.length, complete: U.filter(complete).length, banned: U.filter((u) => u.banned).length, matches: store.all("matches").filter((x) => !x.ended).length, swipes: store.all("swipes").length, demo: U.filter((u) => u.demo).length, reports: reps, photos: q, store: store.status() });
    }
    if (p === "/api/admin/act" && M === "POST") {
      const u = store.get("users", String(body.uid || "")); if (!u) return send(res, 404, { error: "No user." });
      if (body.action === "ban" || body.action === "unban") { u.banned = body.action === "ban"; store.put("users", u.id, u); }
      if (body.action === "verify") { u.verified = !u.verified; store.put("users", u.id, u); }
      if (body.action === "delphoto") { u.photos = (u.photos || []).filter((x) => x !== body.img); store.delImg(String(body.img)); store.put("users", u.id, u); }
      if (body.action === "delete") deleteUser(u.id);
      if (body.action === "dismiss") { const r = store.get("reports", u.id); if (r) { r.status = "done"; store.put("reports", r.id, r); } }
      return send(res, 200, { ok: true });
    }
    if (p === "/api/admin/resetpw" && M === "POST") { const u = byName(body.username); if (!u) return send(res, 404, { error: "No user with that username." }); const temp = rid(5).replace(/[^A-Za-z0-9]/g, "x") + "-" + Math.floor(1000 + Math.random() * 9000); u.pw = pwHash(temp); u.keys = []; store.put("users", u.id, u); return send(res, 200, { username: u.username, temp }); }
    if (p === "/api/admin/demo" && M === "POST") {
      if (body.action === "add") return send(res, 200, { added: await seedDemo() });
      if (body.action === "remove") { const D = store.all("users").filter((u) => u.demo); for (const u of D) deleteUser(u.id); return send(res, 200, { removed: D.length }); }
      return send(res, 400, { error: "Unknown action." });
    }
    if (p === "/api/admin/wipe" && M === "POST") {
      if (body.confirm !== "DELETE") return send(res, 400, { error: "Type DELETE to confirm." });
      for (const u of store.all("users")) for (const img of u.photos || []) store.delImg(img);
      for (const c of store.COLLECTIONS) await store.wipe(c);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: "Not found" });
}
function deleteUser(uid) {
  const u = store.get("users", uid); if (!u) return;
  for (const img of u.photos || []) store.delImg(img);
  for (const s of store.all("swipes")) if (s.from === uid || s.to === uid) store.del("swipes", `${s.from}:${s.to}`);
  for (const mm of store.all("matches")) if (mm.a === uid || mm.b === uid) store.del("matches", mm.id);
  store.del("reports", uid); store.del("users", uid);
}

/* ---------- static files and the private-site lock ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8" };
const SEC = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "x-robots-tag": "noindex, nofollow", "permissions-policy": "geolocation=(self), microphone=(), camera=()",
  "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" };
function locked(req) {
  if (!SITE_PASSWORD) return false;
  const h = String(req.headers.authorization || ""); if (!h.startsWith("Basic ")) return true;
  const [, pass] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const a = Buffer.from(sha(pass || "")), b = Buffer.from(sha(SITE_PASSWORD));
  return !crypto.timingSafeEqual(a, b);
}
async function serveStatic(req, res, url) {
  let m;
  if ((m = url.pathname.match(/^\/img\/([\w-]{14})\.jpg$/))) { const buf = await store.getImg(m[1]); if (!buf) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "private, max-age=31536000, immutable", ...SEC }); return res.end(buf); }
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, ""), file = path.join(PUB, rel);
  if (rel && file.startsWith(PUB + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() && rel !== "index.html") {
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": rel === "sw.js" ? "no-cache" : "public, max-age=3600", ...SEC });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-cache", ...SEC });
  res.end(fs.readFileSync(path.join(PUB, "index.html"), "utf8").replace(/__VERSION__/g, VERSION));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (locked(req) && url.pathname !== "/api/status") { res.writeHead(401, { "www-authenticate": 'Basic realm="Night Owl (private)", charset="UTF-8"', "content-type": "text/plain" }); return res.end("Night Owl is private while it's being built."); }
  try { if (url.pathname.startsWith("/api/")) return await api(req, res, url); return await serveStatic(req, res, url); }
  catch (e) { if (!res.headersSent) send(res, e.code || 500, { error: e.code === 413 ? "That's too big." : "Something went wrong." }); if (!e.code) console.error(e); }
});
console.log(`[boot] Night Owl ${VERSION} starting on Node ${process.version}`);
let bootT; Promise.race([store.init().finally(() => clearTimeout(bootT)), new Promise((r) => { bootT = setTimeout(() => { console.warn("[boot] storage slow, starting anyway"); r(); }, 25000); })]).then(() => {
  server.listen(PORT, () => console.log(`Night Owl ${VERSION} on port ${PORT} (store: ${store.status().mode}, private: ${SITE_PASSWORD ? "yes" : "no"})`));
});
