// 策略實驗室 第十九輪（11/10 會議決議）
// 實驗一：R10 低位空頭擁擠軋空（觀察員1 11/09，做多；4h 進場、最長 5 個交易日）→ 原本＝波段A（會前寫死：4h 以上持有的以波段A 為原本），另列對日內。
// 實驗二：R11 跌而不洗順勢空（觀察員2 11/09，做空；隔日 00:00 UTC 進場、48 小時）→ 原本＝日內（≥1 億U）（持有 ≤48 小時的籌碼型），另列對波段A。
// 資料（不佔名額）：資金費率補最近 1 個月＋日檔補到昨天；OI 日檔從最新日往後補到昨天；回寫 lab/data/fo-daily.json（單檔 <2MB）。統計欄（不佔名額）：C9 日內原本依進場 UTC 時段分組。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5, H1 = 36e5;
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));
const T_START = Date.now();
const elapsed = () => ((Date.now() - T_START) / 60000).toFixed(1) + " 分";

async function fetchZipCsv(url, tmp) {
  const r = await fetch(url);
  if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status);
  await fs.writeFile(tmp, Buffer.from(await r.arrayBuffer()));
  return execFileSync("unzip", ["-p", tmp], { maxBuffer: 1 << 28 }).toString();
}
async function binance15(base) {
  const sym = base + "USDT", out = [], now = new Date();
  for (let k = MONTHS; k >= 1; k--) {
    const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
    const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/monthly/klines/${sym}/15m/${sym}-15m-${ym}.zip`, `/tmp/k-${sym}.zip`);
    if (!csv) continue;
    for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 6 || isNaN(+x[0])) continue; out.push({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }); }
  }
  return out;
}
function agg(m, dt) { const out = []; let cur = null; for (const b of m) { const t = Math.floor(b.t / dt) * dt; if (!cur || cur.t !== t) { cur = { ...b, t }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } } return out; }
function mock(base) { let s = [...base].reduce((x, c) => x + c.charCodeAt(0), 7) * 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const n = MONTHS * 30 * 96, out = []; let p = 100; const t0 = Math.floor(Date.now() / D1) * D1 - n * M15; for (let i = 0; i < n; i++) { const sg = 0.004, o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 900 + s % 7) * sg * 0.15); out.push({ t: t0 + i * M15, o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1000 * (1 + rnd() * (rnd() < 0.03 ? 6 : 1)) }); p = c; } return out; }

const data = {};
const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
const cands = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS).map(base => ({ base })) : [{ base: "BTC" }, { base: "ETH" }, ...bx.symbols.filter(x => x.base !== "BTC" && x.base !== "ETH" && !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv)];
for (const s of cands) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(s.base) : await binance15(s.base); console.log(s.base, m.length); if (m.length < 35000) continue; data[s.base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", s.base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"],["2026-11-06","08:30","NFP"]];
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());

// ===== 濾網（同現行機器人）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const bRet = new Map(); bD.forEach((b, i) => { if (i) bRet.set(dk(b.t), b.c / bD[i - 1].c - 1); });
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rk = new Map();
function rank(day) { const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); return sc; }
function top(day) { if (rk.has(day)) return rk.get(day); const sc = rank(day); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rk.set(day, s); return s; }
const okF = (cn, t) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1).has(cn);

// ===== 市場狀態（第十二輪定義，只作統計欄）=====
const bA = atr(bD, 14);
const stateMap = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * 1.03) s = "趨勢上"; else if (b.c < bE[i] * 0.97) s = "趨勢下"; else s = "盤整"; stateMap.set(dk(b.t), s); });
const stateAt = t => stateMap.get(dk(t) - 1) || "未知";

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m", "d"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}, VOL30 = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(), mv = new Map(); let s = 0, sv = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; sv += d[i].v; if (i >= 30) { s -= q[i - 30]; sv -= d[i - 30].v; } if (i >= 29) { m.set(dk(d[i].t), s / 30); mv.set(dk(d[i].t), sv / 30); } } LIQ[cn] = m; VOL30[cn] = mv; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const mIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].m.forEach((b, i) => m.set(b.t, i)); mIdx[cn] = m; }

// ===== 重大事件日曆 =====
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS_LIST.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const EVP = [...EVENTS_LIST, ...PPI_LIST].map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const EV_DAYS = new Set(EVP.map(e => dk(e.t)));


// ===== 資料工程：資金費率補最近 1 個月＋日檔補到昨天；OI 日檔補到昨天 → lab/data/fo-daily.json =====
let FO; try { FO = JSON.parse(await fs.readFile("lab/data/fo-daily.json", "utf8")); } catch { FO = { created: new Date().toISOString(), note: "", coins: {} }; }
async function refreshFO() {
  if (process.env.MOCK) return;
  const now = new Date(); let okM = 0; const today = dk(Date.now());
  for (const cn of coins) {
    const sym = cn + "USDT"; const f = FO.coins[cn] ||= { fr: {}, oi: {} };
    for (let k = 1; k >= 0; k--) {
      const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
      try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${ym}.zip`, `/tmp/fr-${sym}.zip`); if (!csv) continue; const fr = {}; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 3 || isNaN(+x[0])) continue; const d = dk(+x[0]); fr[d] = +((fr[d] || 0) + (+x[2]) * 100).toFixed(5); } Object.assign(f.fr, fr); okM++; } catch (e) { console.log("費率失敗", sym, ym, e.message); }
    }
  }
  // 費率日檔補最近 12 天
  const jobs = [];
  for (const cn of coins) { const f = FO.coins[cn]; for (let d = today - 12; d < today; d++) if (f.fr[d] == null) jobs.push([cn, d]); }
  let idx = 0, okD = 0; const budget = Date.now() + 4 * 60000;
  const worker = async () => { while (idx < jobs.length && Date.now() < budget) { const [cn, d] = jobs[idx++]; const sym = cn + "USDT", ds = new Date(d * D1).toISOString().slice(0, 10); try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/daily/fundingRate/${sym}/${sym}-fundingRate-${ds}.zip`, `/tmp/frd-${sym}-${ds}.zip`); await fs.unlink(`/tmp/frd-${sym}-${ds}.zip`).catch(() => {}); if (!csv) continue; let s = 0, n = 0; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 3 || isNaN(+x[0])) continue; s += (+x[2]) * 100; n++; } if (n) { FO.coins[cn].fr[d] = +s.toFixed(5); okD++; } } catch { } } };
  await Promise.all(Array.from({ length: 8 }, worker));
  // OI 日檔：從每幣最新日往後補到昨天
  const jobs2 = [];
  for (const cn of coins) { const f = FO.coins[cn]; const have = Object.keys(f.oi).map(Number); const mx = have.length ? Math.max(...have) : today - 30; for (let d = mx + 1; d < today; d++) jobs2.push([cn, d]); }
  let idx2 = 0, okO = 0, missO = 0; const budget2 = Date.now() + 5 * 60000;
  const worker2 = async () => { while (idx2 < jobs2.length && Date.now() < budget2) { const [cn, d] = jobs2[idx2++]; const sym = cn + "USDT", ds = new Date(d * D1).toISOString().slice(0, 10); try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/daily/metrics/${sym}/${sym}-metrics-${ds}.zip`, `/tmp/oi-${sym}-${ds}.zip`); await fs.unlink(`/tmp/oi-${sym}-${ds}.zip`).catch(() => {}); if (!csv) { missO++; continue; } let last = NaN, mx = 0, lastT = ""; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 4 || x[0] === "create_time") continue; const v = +x[3]; if (!(v > 0)) continue; if (x[0] >= lastT) { lastT = x[0]; last = v; } mx = Math.max(mx, v); } if (last > 0) { FO.coins[cn].oi[d] = [Math.round(last), Math.round(mx)]; okO++; } } catch { missO++; } } };
  await Promise.all(Array.from({ length: 12 }, worker2));
  FO.refresh19 = { frMonths: okM, frDailyPlanned: jobs.length, frDailyOk: okD, oiPlanned: jobs2.length, oiOk: okO, oiMiss: missO };
  console.log("費率／OI 補檔完成", FO.refresh19, elapsed());
}
await refreshFO();
FO.updated = new Date().toISOString();
await fs.mkdir("lab/data", { recursive: true });
{ const s = JSON.stringify(FO); console.log("fo-daily.json 大小", (s.length / 1e6).toFixed(2), "MB"); if (!process.env.MOCK && s.length < 2e6) await fs.writeFile("lab/data/fo-daily.json", s); }
const FR = cn => (FO.coins[cn] || { fr: {} }).fr, OI = cn => (FO.coins[cn] || { oi: {} }).oi;
const oiLast = (cn, d) => { const x = OI(cn)[d]; return x ? x[0] : NaN; };
const oiChg = (cn, d, k = 1) => { const a = oiLast(cn, d), b = oiLast(cn, d - k); return a > 0 && b > 0 ? a / b - 1 : NaN; };
const frAt = (cn, d) => { const v = FR(cn)[d]; return v == null ? NaN : v; };
if (process.env.MOCK) { // 假資料：讓條件偶爾成立
  for (const cn of coins) { FO.coins[cn] = { fr: {}, oi: {} }; let s = 11; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let o = 1e9; for (const b of data[cn].d) { const d = dk(b.t); o *= 1 + (r() - 0.5) * 0.3; FO.coins[cn].oi[d] = [Math.round(o), Math.round(o * 1.05)]; FO.coins[cn].fr[d] = +((r() - 0.5) * 0.2).toFixed(4); } }
}
const FO_STAT = {}; for (const cn of coins) { const ks = Object.keys(OI(cn)).map(Number), fk = Object.keys(FR(cn)).map(Number); FO_STAT[cn] = { fr: fk.length, frMax: fk.length ? new Date(Math.max(...fk) * D1).toISOString().slice(0, 10) : "-", oi: ks.length, oiMin: ks.length ? new Date(Math.min(...ks) * D1).toISOString().slice(0, 10) : "-", oiMax: ks.length ? new Date(Math.max(...ks) * D1).toISOString().slice(0, 10) : "-" }; }
// ===== 原本：波段A 與 日內（同第十七輪引擎）=====
function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function trades(cn, kind, q, f) {
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = kind === "swing" ? 2 : 6;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = "停損"; }
      else if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
      else if (b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
      if (ex != null) { const R = (ex - pos.e) / pos.r - pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R, state: pos.state, why }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
    if (!passF(cn, t, f)) continue;
    const e = c[i + 1].o, r = stopK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    pos = { e, r, st: e - r, t, real: 0, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin) };
}
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const seg = tr => ({ IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity) });
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
const okSeg = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
function whySeg(nm, b, x) { const why = []; if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`); if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`); if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`); if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`); return why; }
function judge(base, v) { const why = [...whySeg("樣本內", base.IS, v.IS), ...whySeg("樣本外", base.OOS, v.OOS)]; return { pass: okSeg(base.IS, v.IS) && okSeg(base.OOS, v.OOS), why }; }
const J = j => `${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`;
const bySt = p => Object.entries(p.byState).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const byW = p => Object.entries(p.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、") || "無";
// 「判不了」vs「真的差」：筆數不足 30 時另外標記
const verdictNote = (j, v) => { const small = v.IS.n < 30 || v.OOS.n < 30; if (j.pass) return ""; const onlySize = j.why.every(w => /筆數/.test(w)); return small ? (onlySize ? "（筆數不足、數字本身過關：判不了，等樣本）" : "（筆數不足且數字也差）") : "（樣本夠，是真的差）"; };

const SA = { name: "波段A", kind: "swing", q: {}, f: {} };
const SI = { name: "日內（成交額≥1億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, f: { liq: 100 } };
const baseA = seg(coins.flatMap(cn => trades(cn, SA.kind, SA.q, SA.f)));
const baseI = seg(coins.flatMap(cn => trades(cn, SI.kind, SI.q, SI.f)));
console.log("原本完成", elapsed());

const OUT = { created: new Date().toISOString(), coins: coins.length, data: {}, exp1: {}, exp2: {}, c9: {} };
const L = ["# 策略實驗室 第十九輪：R10 低位空頭擁擠軋空（做多）＋R11 跌而不洗順勢空", "", `產生時間：${OUT.created}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%、最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死（11/10 會議）：R10 用 4h 進場、最長持有 5 個交易日 → 以波段A 為原本（判定用這個），另列對日內；R11 隔日 00:00 UTC 進場、持有 ≤48 小時 → 以「日內（≥1 億U）」為原本（判定用這個），另列對波段A。沒過就是沒過，不放寬。", "",
  "注意：OI 日資料只有 2025-05 起，兩題的樣本內（2024-06～2025-12）前 11 個月沒有 OI、無法觸發；筆數不足 30 一律標「判不了」而不是「不合格」。", ""];

// ===== 資料工程報告 =====
L.push("## 資料工程：資金費率／OI 補到昨天（lab/data/fo-daily.json）", "", `補檔：${JSON.stringify(FO.refresh19 || "MOCK 略過")}。`, "", "| 幣 | 費率天數 | 費率最新日 | OI 天數 | OI 最早日～最新日 |", "|---|---|---|---|---|");
for (const cn of coins.slice(0, 10)) L.push(`| ${cn} | ${FO_STAT[cn].fr} | ${FO_STAT[cn].frMax} | ${FO_STAT[cn].oi} | ${FO_STAT[cn].oiMin}～${FO_STAT[cn].oiMax} |`);
if (coins.length > 10) L.push(`| …（共 ${coins.length} 幣）| | | | |`);
OUT.data = { stat: FO_STAT, refresh: FO.refresh19 || null };
L.push("");

// ===== 共用 =====
const dIdx = {}, hIdx = {}, dE50 = {};
for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; const h = new Map(); data[cn].h.forEach((b, i) => h.set(b.t, i)); hIdx[cn] = h; dE50[cn] = ema(data[cn].d.map(x => x.c), 50); }
const dayRet = (cn, d) => { const a = dc[cn].get(d), b = dc[cn].get(d - 1); return a && b ? a / b - 1 : NaN; };
const evNear = (t, before, after) => EVP.some(e => e.t >= t - before && e.t <= t + after);
const byC = p => Object.entries(p.byCoin).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${k} ${v.n} 筆／${v.avgR}R`).join("；") || "無";
// 15 分K 逐根模擬：e 進場價、st 停損價、tp 停利價（可 null）、maxT 最晚出場時間、earlyFn(day) 在 00:00 UTC 檢查前一日
function sim15(cn, side, i0, e, st, tp, maxT, earlyFn) {
  const m = data[cn].m, r = side * (e - st); if (!(r > 0) || r / e < 0.002) return null;
  const cost = tieredCost(cn, m[i0].t); let ex = null, why = "", tx = 0;
  for (let i = i0; i < m.length; i++) {
    const b = m[i]; if (b.t >= maxT) { ex = m[i - 1].c; why = "到期"; tx = b.t; break; }
    if (earlyFn && i > i0 && b.t % D1 === 0 && earlyFn(dk(b.t) - 1)) { ex = b.o; why = "提早出場"; tx = b.t; break; }
    if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; }
    if (tp != null && (side > 0 ? b.h >= tp : b.l <= tp)) { ex = tp; why = "停利"; tx = b.t + M15; break; }
  }
  if (ex == null) { const last = m[m.length - 1]; ex = last.c; why = "到期"; tx = last.t + M15; }
  return { cn, t: m[i0].t, tx, R: side * (ex - e) / r - cost * e / r, why, side: side > 0 ? "多" : "空", state: stateAt(m[i0].t) };
}
function block(title, baseP, variants, fn, extras, mainBase, altBase, mainName, altName) {
  L.push(`### ${title}`, "", ...HDR, row(`原本 ${mainName}（判定用）`, mainBase), row(`參考 ${altName}`, altBase));
  const base = fn(baseP), j = judge(mainBase, base); const o = { res: base, judge: j, judgeAlt: judge(altBase, base), neigh: {}, extra: {} }; let np = 0, nn = 0;
  L.push(row(`${title.split("（")[0]} 基準` + (j.pass ? " ✅" : " ❌"), base));
  for (const [nm, p, isCtrl] of variants) { const v = fn(p), nj = judge(mainBase, v); o.neigh[nm] = { res: v, judge: nj, ctrl: !!isCtrl }; if (!isCtrl) { nn++; if (nj.pass) np++; } L.push(row("　" + nm + (isCtrl ? "（對照組，不計）" : (nj.pass ? " ✅" : " ❌")), v)); }
  for (const [nm, p] of (extras || [])) { const v = fn(p), nj = judge(mainBase, v); o.extra[nm] = { res: v, judge: nj }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌"), v)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, base);
  L.push("", `基準 出場原因（全期）：${byW(base.ALL)}；分狀態：${bySt(base.ALL)}；分腿：${Object.entries(base.ALL.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；")}；分幣（前 8）：${byC(base.ALL)}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對${altName}：${J(o.judgeAlt)}`, "");
  return o;
}

// ===== 實驗一：R10 低位空頭擁擠軋空（做多）=====
L.push("## 實驗一：R10 低位空頭擁擠軋空（觀察員1 11/09，做多）", "",
  "定義：日收盤 ≤ 近 20 日最低收盤×1.01，且當日與前一日費率日合計皆 < −0.03%，且當日 OI ≥ 3 日前 OI×1.08，且日成交額 ≥5,000 萬U → 訊號日後 48 小時內任一 4h 收盤 > 訊號日最高價，下一根 4h 開盤做多；停損＝訊號日最低 −0.5×日ATR14；停利 +2R，或滿 5 個交易日收盤平倉；每筆 1%、最多 5 筆、同幣不重複；CPI／FOMC／非農／PPI 前 12 小時不新開倉。審查：費率 −0.024／−0.036%、OI 1.064／1.096、低點容差 0.8／1.2%。另列：不濾事件、停利 +1.5R。", "");
function r10(p) {
  const out = [];
  for (const cn of coins) { const D = data[cn].d, H = data[cn].h, A = pre[cn].d.a;
    for (let i = 21; i < D.length - 1; i++) { const b = D[i], d = dk(b.t);
      let mn = Infinity; for (let k = i - 20; k < i; k++) mn = Math.min(mn, D[k].c); if (!(b.c <= mn * (1 + p.tol))) continue;
      const f0 = frAt(cn, d), f1 = frAt(cn, d - 1); if (!(f0 < -p.fr && f1 < -p.fr)) continue;
      const o0 = oiLast(cn, d), o3 = oiLast(cn, d - 3); if (!(o0 > 0 && o3 > 0 && o0 >= o3 * p.oi)) continue;
      if (!(b.c * b.v >= 50e6)) continue;
      const hi = b.h, lo = b.l, atrD = A[i]; if (!(atrD > 0)) continue;
      let ent = null; const w0 = (d + 1) * D1, w1 = w0 + 48 * H1;
      for (let t = w0; t < w1; t += H4) { const hi4 = hIdx[cn].get(t); if (hi4 == null || hi4 + 1 >= H.length) break; if (H[hi4].c > hi) { ent = hi4 + 1; break; } }
      if (ent == null) continue; const te = H[ent].t; if (p.ev && evNear(te, 0, 12 * H1)) continue;
      const i0 = mIdx[cn].get(te); if (i0 == null) continue; const e = data[cn].m[i0].o, st = lo - 0.5 * atrD, r = e - st; if (!(r > 0)) continue;
      const tr = sim15(cn, 1, i0, e, st, e + p.tp * r, te + 5 * D1, null); if (tr) out.push(tr);
    } }
  return seg(out);
}
const P10 = { tol: 0.01, fr: 0.03, oi: 1.08, tp: 2, ev: true };
OUT.exp1 = block("R10 低位空頭擁擠軋空（做多，4h 進場，最長 5 日）", P10,
  [["費率 −0.024%", { ...P10, fr: 0.024 }], ["費率 −0.036%", { ...P10, fr: 0.036 }], ["OI 1.064", { ...P10, oi: 1.064 }], ["OI 1.096", { ...P10, oi: 1.096 }], ["低點容差 0.8%", { ...P10, tol: 0.008 }], ["低點容差 1.2%", { ...P10, tol: 0.012 }]],
  r10, [["不濾事件", { ...P10, ev: false }], ["停利 +1.5R", { ...P10, tp: 1.5 }]], baseA, baseI, "波段A", "日內（≥1 億U）");
console.log("R10 完成", elapsed());

// ===== 實驗二：R11 跌而不洗順勢空 =====
L.push("## 實驗二：R11 跌而不洗順勢空（觀察員2 11/09，做空，R6 的反面）", "",
  "定義：日線（UTC）當日收盤跌幅 ≤ −2%（BTC／ETH）或 ≤ −4%（其他），且當日 OI 日末值較前日 ≥ −1%，且費率日合計 > 0，且收盤 < 日線 EMA50，且隔日非 FOMC／CPI／非農／PPI → 隔日 00:00 UTC 做空；停損 +3%（或訊號日高點，取較近）；持有 48 小時平倉；期間任一日 OI 降 ≥8% 或費率轉負提早出場。審查：跌幅 ×0.8／×1.2、OI ≥0％／≥+2%、持有 24／72h。對照組＝同樣跌幅但 OI 降 ≥5%（預期方向相反）。另列：加「BTC 同日 OI ≥ −1% 且費率 > 0」（空方辯手 11/10）。", "");
function r11(p) {
  const out = [];
  for (const cn of coins) { const D = data[cn].d, E = dE50[cn];
    for (let i = 51; i < D.length - 1; i++) { const b = D[i], d = dk(b.t); const thr = (cn === "BTC" || cn === "ETH" ? 0.02 : 0.04) * p.k;
      const ret = dayRet(cn, d); if (!(ret <= -thr)) continue;
      const oc = oiChg(cn, d), fr = frAt(cn, d); if (isNaN(oc) || isNaN(fr)) continue;
      const hit = p.ctrl ? oc <= -0.05 : (oc >= p.oi && fr > 0); if (!hit) continue;
      if (!(b.c < E[i])) continue;
      if (EV_DAYS.has(d + 1)) continue;
      if (p.btc && cn !== "BTC") { const bo = oiChg("BTC", d), bf = frAt("BTC", d); if (!(bo >= -0.01 && bf > 0)) continue; }
      const i0 = mIdx[cn].get((d + 1) * D1); if (i0 == null) continue; const e = data[cn].m[i0].o;
      const st = Math.min(e * 1.03, b.h > e * 1.003 ? b.h : e * 1.03);
      const early = day => oiChg(cn, day) <= -0.08 || frAt(cn, day) < 0;
      const tr = sim15(cn, -1, i0, e, st, null, (d + 1) * D1 + p.hold * H1, early); if (tr) out.push(tr);
    } }
  return seg(out);
}
const P11 = { k: 1, oi: -0.01, hold: 48 };
OUT.exp2 = block("R11 跌而不洗順勢空（做空，48h）", P11,
  [["跌幅 ×0.8", { ...P11, k: 0.8 }], ["跌幅 ×1.2", { ...P11, k: 1.2 }], ["OI ≥ 0%", { ...P11, oi: 0 }], ["OI ≥ +2%", { ...P11, oi: 0.02 }], ["持有 24h", { ...P11, hold: 24 }], ["持有 72h", { ...P11, hold: 72 }], ["對照：同樣跌幅但 OI 降 ≥5%", { ...P11, ctrl: true }, true]],
  r11, [["加 BTC 同日 OI ≥ −1% 且費率 > 0", { ...P11, btc: true }]], baseI, baseA, "日內（≥1 億U）", "波段A");
console.log("R11 完成", elapsed());

// ===== C9 統計欄：日內原本依進場 UTC 時段 =====
{
  const T = coins.flatMap(cn => trades(cn, SI.kind, SI.q, SI.f)).sort((a, b) => a.t - b.t); const g = {};
  for (const x of T) { const h = new Date(x.t).getUTCHours(); const k = h >= 21 && h < 24 ? "21–23 UTC" : h < 8 ? "00–07 UTC" : h < 14 ? "08–13 UTC" : "14–20 UTC"; const v = g[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; }
  OUT.c9 = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }]));
  L.push("## 統計欄 C9：日內原本（≥1 億U）依進場 UTC 時段（只看、不改規則；逐筆未經組合限制）", "", "| 時段 | 筆數 | 勝率 | 平均R |", "|---|---|---|---|", ...Object.entries(OUT.c9).map(([k, v]) => `| ${k} | ${v.n} | ${v.win}% | ${v.avgR} |`), "");
}
{ const ok = [OUT.exp1.ok ? "R10" : null, OUT.exp2.ok ? "R11" : null].filter(Boolean); L.push(`結論：${ok.length ? `合格：${ok.join("、")}（以新增一組虛擬單並列上線，不動既有組）` : `R10${OUT.exp1.note || "（真的差）"}、R11${OUT.exp2.note || "（真的差）"}，都不合格或判不了`}。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。`); }

await fs.writeFile("lab/report19.md", L.join("\n"));
await fs.writeFile("lab/results19.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
