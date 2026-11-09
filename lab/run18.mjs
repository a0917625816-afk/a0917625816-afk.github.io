// 策略實驗室 第十八輪（11/09 會議決議）
// 實驗一（觀察員規則 R6／R7／R8 合併一支，資料：日線＋lab/data/fo-daily.json 的資金費率日合計與 OI 日末值）：
//   R6 爆倉後清槓桿均值回歸（做多 48h）、R7 逆勢拉高 OI 未增做空（48h）、R8 事件後去槓桿反彈（BTC／ETH 做多 48h）；各附 ±20% 鄰近參數與對照組。
// 實驗二（觀察員規則 R5 事件K突破，含 R1 振幅變體）：非農／CPI 公布那根 15 分K，量能 ≥2 倍才算事件K；8 根內收盤突破高點做多、跌破低點做空；停損另一端；1.5 倍停損距離停利或滿 4 小時出場。BTC／ETH／SOL。
// 資料（不佔名額）：資金費率補最近 1 個月回寫 fo-daily.json（單檔 <2MB）。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。
// 「原本」的選法（會前寫死）：持有 ≤48 小時的事件／籌碼型策略以「日內（≥1 億U）」為原本；4h 波段型以波段A 為原本。報告兩種都列，判定用前者。
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

// ===== 資料工程：資金費率補最近 1 個月 → lab/data/fo-daily.json =====
let FO; try { FO = JSON.parse(await fs.readFile("lab/data/fo-daily.json", "utf8")); } catch { FO = { created: new Date().toISOString(), note: "", coins: {} }; }
async function refreshFR() {
  if (process.env.MOCK) return;
  const now = new Date(); let ok = 0;
  for (const cn of coins) {
    const sym = cn + "USDT"; const f = FO.coins[cn] ||= { fr: {}, oi: {} };
    for (let k = 1; k >= 0; k--) {
      const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
      try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${ym}.zip`, `/tmp/fr-${sym}.zip`); if (!csv) continue; const fr = {}; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 3 || isNaN(+x[0])) continue; const d = dk(+x[0]); fr[d] = +((fr[d] || 0) + (+x[2]) * 100).toFixed(5); } Object.assign(f.fr, fr); ok++; } catch (e) { console.log("費率失敗", sym, ym, e.message); }
    }
  }
  // 日檔補到昨天（月檔通常落後）
  const jobs = []; const today = dk(Date.now());
  for (const cn of coins) { const f = FO.coins[cn]; for (let d = today - 10; d < today; d++) if (f.fr[d] == null) jobs.push([cn, d]); }
  let idx = 0, ok2 = 0; const budget = Date.now() + 4 * 60000;
  const worker = async () => { while (idx < jobs.length && Date.now() < budget) { const [cn, d] = jobs[idx++]; const sym = cn + "USDT", ds = new Date(d * D1).toISOString().slice(0, 10); try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/daily/fundingRate/${sym}/${sym}-fundingRate-${ds}.zip`, `/tmp/frd-${sym}-${ds}.zip`); await fs.unlink(`/tmp/frd-${sym}-${ds}.zip`).catch(() => {}); if (!csv) continue; let s = 0, n = 0; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 3 || isNaN(+x[0])) continue; s += (+x[2]) * 100; n++; } if (n) { FO.coins[cn].fr[d] = +s.toFixed(5); ok2++; } } catch { } } };
  await Promise.all(Array.from({ length: 8 }, worker));
  FO.frRefresh18 = { months: ok, dailyPlanned: jobs.length, dailyOk: ok2 };
  console.log("費率補檔完成", FO.frRefresh18, elapsed());
}
await refreshFR();
FO.updated = new Date().toISOString();
await fs.mkdir("lab/data", { recursive: true });
{ const s = JSON.stringify(FO); console.log("fo-daily.json 大小", (s.length / 1e6).toFixed(2), "MB"); if (!process.env.MOCK && s.length < 2e6) await fs.writeFile("lab/data/fo-daily.json", s); }
const FR = cn => (FO.coins[cn] || { fr: {} }).fr, OI = cn => (FO.coins[cn] || { oi: {} }).oi;
const oiLast = (cn, d) => { const x = OI(cn)[d]; return x ? x[0] : NaN; };
const oiChg = (cn, d) => { const a = oiLast(cn, d), b = oiLast(cn, d - 1); return a > 0 && b > 0 ? a / b - 1 : NaN; };
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

const OUT = { created: new Date().toISOString(), coins: coins.length, data: {}, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第十八輪：R6／R7／R8 籌碼事件規則＋R5 事件K突破", "", `產生時間：${OUT.created}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%、最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死：持有 ≤48 小時的事件／籌碼型策略以「日內（≥1 億U）」為原本（判定用這個）；波段A 另列參考。沒過就是沒過，不放寬。", "",
  "注意：OI 日資料只有 2025-05 起約 18 個月，R6／R7／R8 的樣本內（2024-06～2025-12）前半沒有 OI，實際可觸發的區間比 15 分K 短；報告會標「判不了（筆數不足）」還是「真的差」。", ""];

// ===== 資料工程報告 =====
L.push("## 資料工程：資金費率補最近 1 個月（lab/data/fo-daily.json）", "", `費率補檔：${JSON.stringify(FO.frRefresh18 || "MOCK 略過")}。`, "", "| 幣 | 費率天數 | 費率最新日 | OI 天數 | OI 最早日～最新日 |", "|---|---|---|---|---|");
for (const cn of coins.slice(0, 10)) L.push(`| ${cn} | ${FO_STAT[cn].fr} | ${FO_STAT[cn].frMax} | ${FO_STAT[cn].oi} | ${FO_STAT[cn].oiMin}～${FO_STAT[cn].oiMax} |`);
if (coins.length > 10) L.push(`| …（共 ${coins.length} 幣）| | | | |`);
OUT.data = { stat: FO_STAT, frRefresh: FO.frRefresh18 || null };
L.push("");

// ===== 共用：隔日 00:00 UTC 開盤進場，持有 H 小時，固定 % 停損／停利（15 分K 逐根檢查）=====
function holdTrade(cn, day, side, p) { // p: {hold(h), stop(%), tp(%|0), earlyFn?}
  const m = data[cn].m, i0 = mIdx[cn].get((day + 1) * D1); if (i0 == null || i0 + 1 >= m.length) return null;
  const e = m[i0].o, st = side > 0 ? e * (1 - p.stop) : e * (1 + p.stop), tp = p.tp ? (side > 0 ? e * (1 + p.tp) : e * (1 - p.tp)) : null, r = e * p.stop;
  const cost = tieredCost(cn, m[i0].t), nb = Math.round(p.hold * 4);
  let ex = null, why = "", tx = 0;
  for (let i = i0; i < Math.min(m.length, i0 + nb); i++) {
    const b = m[i];
    if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; }
    if (tp != null && (side > 0 ? b.h >= tp : b.l <= tp)) { ex = tp; why = "停利"; tx = b.t + M15; break; }
    if (p.earlyFn && i > i0 && b.t % D1 === 0 && p.earlyFn(dk(b.t) - 1)) { ex = b.o; why = "提早出場"; tx = b.t; break; }
  }
  if (ex == null) { const last = m[Math.min(m.length - 1, i0 + nb - 1)]; ex = last.c; why = "到期"; tx = last.t + M15; }
  const R = side * (ex - e) / r - cost * e / r;
  return { cn, t: m[i0].t, tx, R, why, side: side > 0 ? "多" : "空", state: stateAt(m[i0].t) };
}
const dayRet = (cn, d) => { const a = dc[cn].get(d), b = dc[cn].get(d - 1); return a && b ? a / b - 1 : NaN; };
const allDays = (() => { const s = new Set(); for (const cn of coins) for (const d of dc[cn].keys()) s.add(d); return [...s].sort((a, b) => a - b); })();

// ===== 實驗一：R6／R7／R8 =====
L.push("## 實驗一：觀察員籌碼規則 R6／R7／R8（日線訊號，隔日 00:00 UTC 開盤進場，48 小時）", "",
  "R6（觀察員2 11/06）：任一幣日線收盤跌幅 ≥6%、當日 OI 日末值比前一日降 ≥10%、當日資金費率日合計 ≤0 → 次日 00:00 UTC 做多，持有 48 小時，停損 −4%、停利 +6%；對照組＝同樣跌幅但 OI 沒降（≥ −3%）。審查：跌幅 4.8／7.2%、OI 降 8／12%。",
  "R7（觀察員2 11/07）：任一幣日線收漲 ≥15% 且 BTC 同日報酬 ≤0% 且當日 OI 增 ≤5% 且費率日合計 ≥0.05% → 次日 00:00 UTC 做空，持有 48 小時，停損 +10%。審查：漲幅 12／18%、OI 4／6%。",
  "R8（觀察員1 11/07）：事件日 D（CPI／非農／FOMC）UTC 收盤時，當日費率日合計 ≤ 過去 90 日第 10 百分位且 OI 較 D−1 降 ≥5% → D+1 00:00 UTC 做多 BTC、ETH，持有 48 小時，停損 −3%、停利 +6%。審查：百分位 8／12、OI 4／6%。對照組＝事件日但條件不成立。", "",
  `原本（日內 ≥1 億U）各狀態（全期）：${bySt(baseI.ALL)}`, "");
function r6(p) { const out = []; for (const cn of coins) for (const d of dc[cn].keys()) { const ret = dayRet(cn, d), oc = oiChg(cn, d), fr = frAt(cn, d); if (!(ret <= -p.drop) || isNaN(oc) || isNaN(fr)) continue; const hit = p.ctrl ? oc >= -0.03 : (oc <= -p.oi && fr <= 0); if (!hit) continue; const tr = holdTrade(cn, d, 1, { hold: 48, stop: 0.04, tp: 0.06 }); if (tr) out.push(tr); } return seg(out); }
function r7(p) { const out = []; for (const cn of coins) for (const d of dc[cn].keys()) { if (cn === "BTC") continue; const ret = dayRet(cn, d), br = bRet.get(d), oc = oiChg(cn, d), fr = frAt(cn, d); if (!(ret >= p.up) || !(br <= 0) || isNaN(oc) || isNaN(fr)) continue; if (!(oc <= p.oi && fr >= 0.05)) continue; const tr = holdTrade(cn, d, -1, { hold: 48, stop: 0.10, tp: 0 }); if (tr) out.push(tr); } return seg(out); }
function pct(arr, q) { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); const i = Math.max(0, Math.min(s.length - 1, Math.floor(q / 100 * (s.length - 1)))); return s[i]; }
function r8(p) { const out = []; const evDays = [...new Set(EV.map(e => dk(e.t)))]; for (const cn of ["BTC", "ETH"].filter(c => data[c])) for (const d of evDays) { const fr = frAt(cn, d), oc = oiChg(cn, d); if (isNaN(fr) || isNaN(oc)) continue; const hist = []; for (let k = d - 90; k < d; k++) { const v = frAt(cn, k); if (!isNaN(v)) hist.push(v); } if (hist.length < 60) continue; const th = pct(hist, p.q); const hit = p.ctrl ? !(fr <= th && oc <= -p.oi) : (fr <= th && oc <= -p.oi); if (!hit) continue; const tr = holdTrade(cn, d, 1, { hold: 48, stop: 0.03, tp: 0.06 }); if (tr) out.push(tr); } return seg(out); }
OUT.exp1 = {};
function block(title, baseP, variants, fn) {
  L.push(`### ${title}`, "", ...HDR, row("原本 日內（≥1 億U）", baseI), row("參考 波段A", baseA));
  const base = fn(baseP), j = judge(baseI, base); const o = { res: base, judge: j, judgeVsA: judge(baseA, base), neigh: {} }; let np = 0, nn = 0;
  L.push(row(`${title.split("（")[0]} 基準` + (j.pass ? " ✅" : " ❌"), base));
  for (const [nm, p, isCtrl] of variants) { const v = fn(p), nj = judge(baseI, v); o.neigh[nm] = { res: v, judge: nj, ctrl: !!isCtrl }; if (!isCtrl) { nn++; if (nj.pass) np++; } L.push(row("　" + nm + (isCtrl ? "（對照組，不計）" : (nj.pass ? " ✅" : " ❌")), v)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, base);
  L.push("", `基準 出場原因（全期）：${byW(base.ALL)}；分狀態：${bySt(base.ALL)}；分腿：${Object.entries(base.ALL.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；")}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對波段A：${J(o.judgeVsA)}`, "");
  return o;
}
OUT.exp1.R6 = block("R6 爆倉後清槓桿均值回歸（做多 48h）", { drop: 0.06, oi: 0.10 }, [["跌幅 4.8%", { drop: 0.048, oi: 0.10 }], ["跌幅 7.2%", { drop: 0.072, oi: 0.10 }], ["OI 降 8%", { drop: 0.06, oi: 0.08 }], ["OI 降 12%", { drop: 0.06, oi: 0.12 }], ["對照：跌 ≥6% 但 OI 沒降（≥ −3%）", { drop: 0.06, ctrl: true }, true]], r6);
console.log("R6 完成", elapsed());
OUT.exp1.R7 = block("R7 逆勢拉高、OI 未增 做空（48h）", { up: 0.15, oi: 0.05 }, [["漲幅 12%", { up: 0.12, oi: 0.05 }], ["漲幅 18%", { up: 0.18, oi: 0.05 }], ["OI 增 ≤4%", { up: 0.15, oi: 0.04 }], ["OI 增 ≤6%", { up: 0.15, oi: 0.06 }]], r7);
console.log("R7 完成", elapsed());
OUT.exp1.R8 = block("R8 事件後去槓桿反彈（BTC／ETH 做多 48h）", { q: 10, oi: 0.05 }, [["百分位 8", { q: 8, oi: 0.05 }], ["百分位 12", { q: 12, oi: 0.05 }], ["OI 降 4%", { q: 10, oi: 0.04 }], ["OI 降 6%", { q: 10, oi: 0.06 }], ["對照：事件日但條件不成立", { q: 10, oi: 0.05, ctrl: true }, true]], r8);
console.log("R8 完成", elapsed());
{ const ok = Object.entries(OUT.exp1).filter(([, o]) => o.ok).map(([k]) => k); L.push(`實驗一結論：${ok.length ? `合格：${ok.join("、")}（以新增一組虛擬單並列上線）` : "R6／R7／R8 都不合格；" + Object.entries(OUT.exp1).map(([k, o]) => `${k}${o.note || "（真的差）"}`).join("、")}。`, ""); }

// ===== 實驗二：R5 事件K突破（BTC／ETH／SOL，含 R1 振幅變體）=====
L.push("## 實驗二：R5 事件K突破（觀察員1 11/06；BTC／ETH／SOL）", "",
  "定義：非農／CPI 公布那根 15 分K（美東 08:30，自動換算夏令／冬令），若成交量 ≥ 近 30 天日均成交量÷96 的 2 倍才算事件K；之後 8 根內任一根收盤站上事件K最高價就做多、跌破最低價就做空（下一根開盤進場）；停損放事件K另一端；停利 1.5 倍停損距離，或持倉滿 4 小時收盤出場；每事件每幣只進一次。審查：量能倍數 1.6／2.4、停利 1.2／1.8、窗口 6／10 根。另列：加 PPI 事件、FOMC 事件、R1 振幅變體（事件K振幅 >過去 20 日同時段均值 2 倍且收盤在極端 20% 內 → 順收盤方向進場，停損另一端，持有 8 根；當日費率 <0 只做多）。", "");
const R5C = ["BTC", "ETH", "SOL"].filter(c => data[c]);
function r5(p) {
  const evs = (p.events || EV).filter(e => (p.kinds || ["NFP", "CPI"]).includes(e.k)); const out = [];
  for (const cn of R5C) { const m = data[cn].m; for (const ev of evs) {
    const i0 = mIdx[cn].get(ev.t); if (i0 == null || i0 + p.win + 20 >= m.length) continue; const b0 = m[i0];
    const v30 = VOL30[cn].get(dk(ev.t) - 1); if (!(v30 > 0) || !(b0.v >= p.volK * v30 / 96)) continue;
    let ent = null;
    for (let i = i0 + 1; i <= i0 + p.win && i + 1 < m.length; i++) { const b = m[i]; if (b.c > b0.h) { ent = { side: 1, i: i + 1, st: b0.l }; break; } if (b.c < b0.l) { ent = { side: -1, i: i + 1, st: b0.h }; break; } }
    if (!ent) continue;
    const e = m[ent.i].o, r = ent.side * (e - ent.st); if (!(r > 0)) continue; const tp = e + ent.side * p.tp * r, cost = tieredCost(cn, m[ent.i].t);
    let ex = null, why = "", tx = 0;
    for (let i = ent.i; i < Math.min(m.length, ent.i + 16); i++) { const b = m[i]; if (ent.side > 0 ? b.l <= ent.st : b.h >= ent.st) { ex = ent.side > 0 ? Math.min(b.o, ent.st) : Math.max(b.o, ent.st); why = "停損"; tx = b.t + M15; break; } if (ent.side > 0 ? b.h >= tp : b.l <= tp) { ex = tp; why = "停利"; tx = b.t + M15; break; } }
    if (ex == null) { const last = m[Math.min(m.length - 1, ent.i + 15)]; ex = last.c; why = "滿 4 小時"; tx = last.t + M15; }
    out.push({ cn, t: m[ent.i].t, tx, R: ent.side * (ex - e) / r - cost * e / r, why, side: ent.side > 0 ? "多" : "空", state: stateAt(m[ent.i].t), k: ev.k });
  } }
  return seg(out);
}
function r1() {
  const evs = EV.filter(e => ["NFP", "CPI"].includes(e.k)); const out = [];
  for (const cn of R5C) { const m = data[cn].m; for (const ev of evs) {
    const i0 = mIdx[cn].get(ev.t); if (i0 == null || i0 + 10 >= m.length) continue; const b0 = m[i0], rng = b0.h - b0.l; if (!(rng > 0)) continue;
    let s = 0, n = 0; for (let k = 1; k <= 20; k++) { const j = mIdx[cn].get(ev.t - k * D1); if (j != null) { s += m[j].h - m[j].l; n++; } } if (n < 15 || !(rng > 2 * s / n)) continue;
    const pos = (b0.c - b0.l) / rng; let side = pos >= 0.8 ? 1 : pos <= 0.2 ? -1 : 0; if (!side) continue;
    const fr = frAt(cn, dk(ev.t) - 1); if (!isNaN(fr) && fr < 0 && side < 0) continue;
    const e = m[i0 + 1].o, st = side > 0 ? b0.l : b0.h, r = side * (e - st); if (!(r > 0)) continue; const cost = tieredCost(cn, m[i0 + 1].t);
    let ex = null, why = "", tx = 0;
    for (let i = i0 + 1; i < Math.min(m.length, i0 + 9); i++) { const b = m[i]; if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; } }
    if (ex == null) { const last = m[i0 + 8]; ex = last.c; why = "持有 8 根"; tx = last.t + M15; }
    out.push({ cn, t: m[i0 + 1].t, tx, R: side * (ex - e) / r - cost * e / r, why, side: side > 0 ? "多" : "空", state: stateAt(m[i0 + 1].t), k: ev.k });
  } }
  return seg(out);
}
const P5 = { volK: 2, tp: 1.5, win: 8 };
const R5N = [["量能 1.6 倍", { ...P5, volK: 1.6 }], ["量能 2.4 倍", { ...P5, volK: 2.4 }], ["停利 1.2 倍", { ...P5, tp: 1.2 }], ["停利 1.8 倍", { ...P5, tp: 1.8 }], ["窗口 6 根", { ...P5, win: 6 }], ["窗口 10 根", { ...P5, win: 10 }]];
const R5X = [["加 PPI 事件", { ...P5, events: EVP, kinds: ["NFP", "CPI", "PPI"] }], ["只 FOMC 事件（14:00 ET）", { ...P5, kinds: ["FOMC"] }], ["量能 1.0 倍（不濾量）", { ...P5, volK: 1.0 }]];
{
  L.push(...HDR, row("原本 日內（≥1 億U）", baseI), row("參考 波段A", baseA));
  const base = r5(P5), j = judge(baseI, base); const o = { res: base, judge: j, judgeVsA: judge(baseA, base), neigh: {}, extra: {} }; let np = 0;
  L.push(row("R5 基準（量能 2 倍、停利 1.5 倍、窗口 8 根）" + (j.pass ? " ✅" : " ❌"), base));
  for (const [nm, p] of R5N) { const v = r5(p), nj = judge(baseI, v); o.neigh[nm] = { res: v, judge: nj }; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), v)); }
  for (const [nm, p] of R5X) { const v = r5(p), nj = judge(baseI, v); o.extra[nm] = { res: v, judge: nj }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌"), v)); }
  { const v = r1(), nj = judge(baseI, v); o.extra["R1 振幅變體"] = { res: v, judge: nj }; L.push(row("　另列：R1 振幅變體（8 根持有）" + (nj.pass ? " ✅" : " ❌"), v)); }
  o.overfit = { n: R5N.length, pass: np, ok: np * 2 > R5N.length }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, base);
  L.push("", `基準 出場原因（全期）：${byW(base.ALL)}；分腿：${Object.entries(base.ALL.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；")}；分幣：${Object.entries(base.ALL.byCoin).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；")}；分狀態：${bySt(base.ALL)}`);
  L.push(`事件數：非農＋CPI ${EV.filter(e => ["NFP", "CPI"].includes(e.k)).length} 場 × ${R5C.length} 幣＝最多 ${EV.filter(e => ["NFP", "CPI"].includes(e.k)).length * R5C.length} 筆；通過量能濾網後全期 ${base.ALL.n} 筆。`);
  L.push(`判定「R5 事件K突破」：${J(j)} ${o.note}；審查：鄰近 ${R5N.length} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對波段A：${J(o.judgeVsA)}`, "");
  OUT.exp2 = o;
}
console.log("實驗二完成", elapsed());
L.push("合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。事件型策略若只因樣本外筆數不足判不了，可改成「劇本型態練習」在盤前室累積樣本，不直接上線。");

await fs.writeFile("lab/report18.md", L.join("\n"));
await fs.writeFile("lab/results18.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
