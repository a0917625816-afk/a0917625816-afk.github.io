// 策略實驗室 第三十二輪（11/22 會議決議）：事件型家族兩題，皆無對應部門 → 照 C17 絕對門檻判
// 實驗一 R36 總經數據日動能（觀察員1 11/21）：事件＝FOMC／CPI／非農／PPI；標的 BTC、ETH（另列 list19 當日成交額前 5）；公布後第一根 15 分K 收盤相對公布前一根收盤變動 ≥ +1.0% 做多、≤ −1.0% 做空；次根開盤進場；停損 1.0%；持有 8 小時平倉（或停損）；每事件每幣最多 1 筆。3 個參數（門檻、停損、持有；審查 ±20%）。
// 實驗二 R12 事件日擁擠方清洗順勢（觀察員1 11/10）：前置（事件日 00:00 UTC）BTC OI 較 5 日前升 ≥5% 且近 5 日 BTC 費率日合計同號（正＝多擁擠、負＝空擁擠）；觸發：含公布時刻的 4h K 收盤逆擁擠方向 ≥1%；進場：下一根 4h 開盤順該方向；停損＝事件 4h K 極值；出場＝1.5R 或持有 6 根 4h（24h）平倉。先 BTC／ETH，另列 40 幣（各用自己的 OI／費率）。審查：OI 4／6%、觸發 0.8／1.2%、持有 5／7 根、R:R 1.2／1.8。另列對照：無 OI、只用費率同號（2024-05 起）。
// 偏誤交代（審查表 B）：事件時刻寫死（EVENTS_LIST＋PPI_LIST，美東時間含夏令時 nthSunday／etToUtc）；只用已收盤 K；進場用訊號 K 之後那根開盤；成本分級（BTC／ETH 落 0.14%）；R36 持有 8h 可能跨一次費率結算、R12 持有 24h 跨 3 次，兩者皆未計費率（另列估算）；停損用 min(開盤, 停損價) 保守出、滑價另計；OI 2025-05 起（約 18 個月）→ R12 樣本可能不足＝判不了；幣池 list19 只含 2026-11-10 仍在前 40 名的幣（存活者偏差）；前 5 幣用進場前一日的 30 日均成交額點時選取。
// 鐵律＝合格要勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；無對應部門 → 絕對門檻：兩段各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近過半合格才算通過審查。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 60), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5, H1 = 36e5;
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
function mock(base) { let s = [...base].reduce((x, c) => x + c.charCodeAt(0), 7) * 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const n = MONTHS * 30 * 96, out = []; let p = 100; const t0 = Math.floor(Date.now() / D1) * D1 - n * M15; for (let i = 0; i < n; i++) { const sg = 0.004, o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 900 + s % 7) * sg * 0.15); out.push({ t: t0 + i * M15, o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1e7 * (1 + rnd() * (rnd() < 0.03 ? 6 : 1)) }); p = c; } return out; }

// ===== 固定幣清單 =====
const CL = JSON.parse(await fs.readFile("lab/data/coins.json", "utf8"));
const LIST19 = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS) : CL.list19;
const LIST18 = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS) : CL.list18;
const want = [...new Set([...LIST19, ...LIST18])];
const data = {};
for (const base of want) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(base) : await binance15(base); console.log(base, m.length); if (m.length < 35000) continue; data[base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"],["2026-11-06","08:30","NFP"],["2026-11-10","08:30","CPI"]];
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());
const U19 = LIST19.filter(c => data[c]), U18 = LIST18.filter(c => data[c]);
console.log("list19 可用", U19.length, "list18 可用", U18.length);

// ===== 濾網（同現行機器人；排行依清單各算一份）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rkCache = new Map();
function top(day, U) { const key = U.key + ":" + day; if (rkCache.has(key)) return rkCache.get(key); const sc = []; for (const cn of U.list) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rkCache.set(key, s); return s; }
const okF = (cn, t, U) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1, U).has(cn);
const UNI19 = { key: "19", list: U19 }, UNI18 = { key: "18", list: U18 };

// ===== 市場狀態（第十二輪定義）、趨勢上（日內 D 用）=====
const bA = atr(bD, 14);
const stateMap = new Map(), trendUp = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * 1.03) s = "趨勢上"; else if (b.c < bE[i] * 0.97) s = "趨勢下"; else s = "盤整"; stateMap.set(dk(b.t), s); trendUp.set(dk(b.t), !(r5 <= -0.08 || ap >= 0.045) && b.c > bE[i] * 1.03); });
const stateAt = t => stateMap.get(dk(t) - 1) || "未知";
const trendBlock = t => trendUp.get(dk(t) - 1) === true;
// 盤整濾網（run30 實驗二同定義）：ban(cn,t)＝進場前一日 BTC 狀態 ≠ 盤整
function stateFn(band = 0.03, pr5 = 0.08, patr = 0.045) { const m = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -pr5 || ap >= patr) s = "恐慌"; else if (b.c > bE[i] * (1 + band)) s = "趨勢上"; else if (b.c < bE[i] * (1 - band)) s = "趨勢下"; else s = "盤整"; m.set(dk(b.t), s); }); return (cn, t) => m.get(dk(t) - 1) !== "盤整"; }

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m", "d"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const mIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].m.forEach((b, i) => m.set(b.t, i)); mIdx[cn] = m; }

// ===== 重大事件日曆、美東時間換算（含夏令時）=====
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS_LIST.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const EVP = [...EVENTS_LIST, ...PPI_LIST].map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const evBlock = t => EV.some(e => t >= e.t - 4 * H1 && t < e.t + 4 * H1); // 日內 C：FOMC／CPI／非農 前後 4h
const evNear = (t, before, after) => EVP.some(e => e.t >= t - before && e.t <= t + after);

// ===== 費率／OI（lab/data/fo-daily.json，本輪只讀不補）=====
let FO; try { FO = JSON.parse(await fs.readFile("lab/data/fo-daily.json", "utf8")); } catch { FO = { coins: {} }; }
const FR = cn => (FO.coins[cn] || { fr: {} }).fr, OI = cn => (FO.coins[cn] || { oi: {} }).oi;
const oiLast = (cn, d) => { const x = OI(cn)[d]; return x ? x[0] : NaN; };
const oiChg = (cn, d, k = 1) => { const a = oiLast(cn, d), b = oiLast(cn, d - k); return a > 0 && b > 0 ? a / b - 1 : NaN; };
const frAt = (cn, d) => { const v = FR(cn)[d]; return v == null ? NaN : v; };
if (process.env.MOCK) { for (const cn of coins) { FO.coins[cn] = { fr: {}, oi: {} }; let s = 11; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let o = 1e9; for (const b of data[cn].d) { const d = dk(b.t); o *= 1 + (r() - 0.5) * 0.3; FO.coins[cn].oi[d] = [Math.round(o), Math.round(o * 1.05)]; FO.coins[cn].fr[d] = +((r() - 0.5) * 0.4).toFixed(4); } } }

// ===== 交易引擎（部門共用；o.costMul 成本倍數、o.stopMul 停損倍數、o.ban(cn,t) 禁多；o.mid={N,lvl,keep27} 中點移動停損出場）=====
function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } if (f.ev && evBlock(t)) return false; if (f.trend && trendBlock(t)) return false; return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function midOf(c, i, N, lvl) { let hi = -Infinity, lo = Infinity; for (let j = i - N + 1; j <= i; j++) { hi = Math.max(hi, c[j].c); lo = Math.min(lo, c[j].c); } return lo + lvl * (hi - lo); }
function trades(cn, S, U, o = {}) {
  const kind = S.kind, x = S.x, f = S.f, q = S.q, stopMul = o.stopMul || 1, costMul = o.costMul || 1, mid = o.mid;
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = (kind === "swing" ? 2 : 6) * stopMul;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = pos.trail ? "中點停損" : "停損"; }
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing" && (!mid || mid.keep27)) { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
        else if (kind !== "swing" && b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
        if (ex == null && mid && kind === "swing") { const m = midOf(c, i, mid.N, mid.lvl); if (m > pos.st) { pos.st = m; pos.trail = true; } if (b.c < pos.st) { ex = c[i + 1].o; why = "收盤跌破中點"; } }
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const gross = pos.real + left * (ex - pos.e) / pos.r, costR = pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R: gross - costMul * costR, gross, costR, state: pos.state, why, bars: i - pos.i }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t, U)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
    if (!passF(cn, t, f)) continue;
    if (o.ban && o.ban(cn, t)) continue;
    const e = c[i + 1].o, r = stopK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    let st = e - r; if (mid && kind === "swing") { const m = midOf(c, i, mid.N, mid.lvl); if (m > st && m < e) st = m; }
    pos = { e, r: e - st, st, t, i: i + 1, real: 0, took: false, trail: false, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to, maxOpen = 5) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {}; let legF = 0, legP = 0;
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); if (open.length >= maxOpen || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; legF += x.legF || 0; legP += x.legP || 0; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, legF: n ? +(legF / n).toFixed(3) : 0, legP: n ? +(legP / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const seg = (tr, mo = 5) => ({ IS: portfolio(tr, t0, cut, mo), OOS: portfolio(tr, cut, Infinity, mo), ALL: portfolio(tr, t0, Infinity, mo) });
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
const okSeg = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
function whySeg(nm, b, x) { const why = []; if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`); if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`); if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`); if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`); return why; }
function judge(base, v) { const why = [...whySeg("樣本內", base.IS, v.IS), ...whySeg("樣本外", base.OOS, v.OOS)]; return { pass: okSeg(base.IS, v.IS) && okSeg(base.OOS, v.OOS), why }; }
const J = j => `${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`;
const mk = p => p ? " ✅" : " ❌";
const bySt = p => Object.entries(p.byState).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const byW = p => Object.entries(p.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、") || "無";
const byC = p => Object.entries(p.byCoin).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${k} ${v.n} 筆／${v.avgR}R`).join("；") || "無";
const bySd = p => Object.entries(p.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const verdictNote = (j, v) => { const small = v.IS.n < 30 || v.OOS.n < 30; if (j.pass) return ""; const onlySize = j.why.every(w => /筆數/.test(w)); return small ? (onlySize ? "（筆數不足、數字本身過關：判不了，等樣本）" : "（筆數不足且數字也差）") : "（樣本夠，是真的差）"; };
// 按月：正月數／總月數、最好與最差月、是否靠 1–2 個月撐（最大兩個月合計R 佔總R 比例）
function monthly(p) { const ms = Object.entries(p.byMonth).sort(); if (!ms.length) return { months: 0, pos: 0, text: "無", top2: 0 }; const pos = ms.filter(([, v]) => v.avgR > 0).length; const sums = ms.map(([k, v]) => [k, v.avgR * v.n]); const tot = sums.reduce((a, x) => a + x[1], 0); const top2 = sums.map(x => x[1]).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0); return { months: ms.length, pos, top2: tot > 0 ? +(top2 / tot).toFixed(2) : null, text: ms.map(([k, v]) => `${k.slice(2)} ${v.avgR > 0 ? "+" : ""}${v.avgR}(${v.n})`).join("、") }; }
const monthText = m => `${m.months} 個月中 ${m.pos} 個月為正${m.top2 != null ? `、最好兩個月佔總R ${Math.round(m.top2 * 100)}%` : "（總R ≤0，最好兩個月佔比不計）"}`;
const costMul = (tr, k) => tr.map(x => ({ ...x, R: x.gross - k * x.costR }));
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const pos2 = v => v.IS.avgR > 0 && v.OOS.avgR > 0;
const byYear = tr => { const g = {}; for (const x of tr) { const y = new Date(x.t).getUTCFullYear(); const v = g[y] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const yrText = o => Object.entries(o).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const grp = (tr, key) => { const g = {}; for (const x of tr) { const k = x[key] ?? "未知"; const v = g[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const grpText = o => Object.entries(o).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
// 絕對門檻判定（無原本部門；與 run31 C17 同）
function judgeAbs(raw) { const v = seg(raw), v15 = seg(costMul(raw, 1.5)), be = breakEven(raw); const why = []; for (const [nm2, s, s15] of [["樣本內", v.IS, v15.IS], ["樣本外", v.OOS, v15.OOS]]) { if (s.n < 30) why.push(`${nm2}筆數 ${s.n} < 30`); if (!(s.avgR > 0)) why.push(`${nm2}平均R ${s.avgR} ≤ 0`); if (!(s.win > 50)) why.push(`${nm2}勝率 ${s.win}% ≤ 50%`); if (!(s15.avgR > 0)) why.push(`${nm2}成本×1.5 後平均R ${s15.avgR} ≤ 0`); } if (!(be >= 1.5)) why.push(`損益兩平成本倍數 ${be} < 1.5`); return { pass: !why.length, res: v, res15: v15, be, why, n: raw.length }; }
const smallOf = v => v.IS.n < 30 || v.OOS.n < 30;
const verdictAbs = j => j.pass ? "合格" : smallOf(j.res) ? (j.why.every(w => /筆數/.test(w)) ? "判不了（筆數不足、數字本身過關）" : "判不了（筆數不足且數字也差）") : "不合格（樣本夠，是真的差）";
const hIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].h.forEach((b, i) => m.set(b.t, i)); hIdx[cn] = m; }
// 前 5 幣（進場前一日 30 日均成交額，排除 BTC／ETH，點時選取）
function top5At(t) { const d = dk(t) - 1; const sc = []; for (const cn of U19) { if (cn === "BTC" || cn === "ETH") continue; const v = LIQ[cn].get(d); if (v > 0) sc.push([cn, v]); } sc.sort((a, b) => b[1] - a[1]); return sc.slice(0, 5).map(x => x[0]); }
const EVALL = EVP.filter(e => e.t >= t0 && e.t < t1);
const feeLegs = (t, tx) => { let k = 0; for (let u = Math.ceil(t / (8 * H1)) * 8 * H1; u < tx; u += 8 * H1) k++; return k; }; // 跨幾次 8h 費率結算
const frLeg = (cn, t, tx) => { const d = dk(t); const f = frAt(cn, d - 1); return isNaN(f) ? NaN : f / 100 / 3 * feeLegs(t, tx); }; // 用前一日費率日合計／3 估每次結算（比例）

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, events: EVALL.length, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第三十二輪：R36 總經數據日動能＋R12 事件日擁擠方清洗順勢（事件型家族）", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣；主測只用 BTC／ETH）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；資料期間內事件 ${EVALL.length} 場（FOMC／CPI／非農／PPI）；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；審查表 A 另看 成本 ×1.5／×2、停損高原、按月。「原本」會前寫死（11/22 會議）：兩題都是事件型多空、沒有對應部門 → 用絕對門檻判（樣本內／外各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近過半合格才算通過審查）。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：事件時刻寫死（EVENTS_LIST＋PPI_LIST，美東時間含夏令／冬令換算）；只用已收盤 K；進場用訊號 K 之後那根開盤；成本分級（BTC／ETH 落 0.14%，前 5 幣照各自成交額）；R36 持有 8h 可能跨一次費率結算、R12 持有 24h 跨 3 次，主表未計費率，另列「費率腿估算」（用前一日費率日合計 ÷3 × 跨結算次數）；停損用 min(開盤, 停損價) 保守出、滑價另計；OI 2025-05 起（約 18 個月）→ R12 樣本可能不足＝判不了，另列無 OI 對照（2024-05 起）；幣池 list19 只含 2026-11-10 仍在前 40 名的幣（存活者偏差），前 5 幣用進場前一日 30 日均成交額點時選取；參數只在樣本內定、樣本外只看不調。", ""];

// ===== 實驗一：R36 總經數據日動能 =====
L.push("## 實驗一：R36 總經數據日動能（事件型多空；主測 BTC／ETH；無對應部門 → 絕對門檻）", "",
  "定義：事件 T（FOMC／CPI／非農／PPI 公布時刻）。pre＝結束於 T 的 15 分K（t＝T−15m）、post＝公布後第一根（t＝T）。Δ＝post.c／pre.c −1；Δ ≥ +1.0% 做多、≤ −1.0% 做空、否則不做；進場＝t＝T+15m 那根開盤；停損＝進場 ∓1.0%（1R＝停損距離）；出場＝先到停損（用 min(開盤,停損) 保守）或持有 8 小時（32 根）後以該根收盤平倉；每事件每幣最多 1 筆。gross＝side×(出場−進場)／進場／停損%、costR＝分級成本／停損%。鄰近（每個對基準單改一項，±20%）：門檻 0.8／1.2%、停損 0.8／1.2%、持有 6.4h（26 根）／9.6h（38 根）。另列：停損高原 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只多／只空、按事件類型、前 5 幣版、BTC+ETH+前 5 幣合併版、費率腿估算。", "");
// opt：th 門檻、stop 停損比例、hold 根數、coins 幣清單函數、costMul
function r36(opt = {}) {
  const { th = 0.01, stop = 0.01, hold = 32, pick = () => ["BTC", "ETH"], costMul: cm = 1 } = opt; const out = []; let sig = 0, cand = 0;
  for (const ev of EVALL) {
    for (const cn of pick(ev.t)) {
      if (!data[cn]) continue; const M = data[cn].m, ix = mIdx[cn]; const iPre = ix.get(ev.t - M15), iPost = ix.get(ev.t); if (iPre == null || iPost == null) continue; cand++;
      const d = M[iPost].c / M[iPre].c - 1; let side = 0; if (d >= th) side = 1; else if (d <= -th) side = -1; if (!side) continue; sig++;
      const iE = iPost + 1; if (iE >= M.length) continue; const e = M[iE].o; if (!(e > 0)) continue; const st = side > 0 ? e * (1 - stop) : e * (1 + stop); const iEnd = Math.min(iE + hold - 1, M.length - 1);
      let ex = M[iEnd].c, why = "時間平倉", tx = M[iEnd].t + M15;
      for (let i = iE; i <= iEnd; i++) { const b = M[i]; if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; } }
      const gross = side * (ex - e) / e / stop, costR = tieredCost(cn, M[iE].t) / stop, fl = frLeg(cn, M[iE].t, tx); const feeR = isNaN(fl) ? 0 : -side * fl / stop;
      out.push({ cn, t: M[iE].t, tx, R: gross - cm * costR, gross, costR, feeR, state: stateAt(M[iE].t), why, side: side > 0 ? "多" : "空", ev: ev.k, d: +d.toFixed(4) });
    }
  }
  out.sig = sig; out.cand = cand; return out;
}
{
  const o = { neigh: {}, extra: {}, tried: 0, passed: 0 }; const cnt = j => { o.tried++; if (j.pass) o.passed++; return j; };
  const rawB = r36(); const jB = cnt(judgeAbs(rawB)); o.base = { judge: jB, res: jB.res, be: jB.be, raw: rawB.length, sig: rawB.sig, cand: rawB.cand };
  L.push(...HDR, row("R36 基準：BTC／ETH、門檻 1.0%、停損 1.0%、持有 8h" + mk(jB.pass), jB.res));
  let np = 0, nn = 0;
  for (const [nm2, opt] of [["門檻 0.8%", { th: 0.008 }], ["門檻 1.2%", { th: 0.012 }], ["停損 0.8%", { stop: 0.008 }], ["停損 1.2%", { stop: 0.012 }], ["持有 6.4h（26 根）", { hold: 26 }], ["持有 9.6h（38 根）", { hold: 38 }]]) {
    const rr = r36(opt), nj = cnt(judgeAbs(rr)); o.neigh[nm2] = { judge: nj, res: nj.res, be: nj.be, raw: rr.length }; nn++; if (nj.pass) np++; L.push(row("　鄰近：" + nm2 + mk(nj.pass), nj.res));
  }
  const stops = {}; let sp = 0; for (const sm of [0.5, 0.75, 1.25, 1.5]) { const rr = r36({ stop: 0.01 * sm }), nj = cnt(judgeAbs(rr)); stops[sm] = { judge: nj, res: nj.res, be: nj.be }; if (nj.pass) sp++; L.push(row(`　停損高原 ×${sm}（${(sm).toFixed(2)}%）` + mk(nj.pass), nj.res)); } o.stops = stops; o.plateau = `${sp}/4`;
  const v15 = seg(costMul(rawB, 1.5)), v2 = seg(costMul(rawB, 2)); o.extra["成本 ×1.5"] = { res: v15, pos: pos2(v15) }; o.extra["成本 ×2"] = { res: v2, pos: pos2(v2) };
  L.push(row("　另列：成本 ×1.5（兩段平均R>0？）" + mk(pos2(v15)), v15), row("　另列：成本 ×2（兩段平均R>0？）" + mk(pos2(v2)), v2));
  const vL = seg(rawB.filter(x => x.side === "多")), vS = seg(rawB.filter(x => x.side === "空")); o.extra["只多"] = { res: vL, pos: pos2(vL) }; o.extra["只空"] = { res: vS, pos: pos2(vS) };
  L.push(row("　另列：只做多（兩段平均R>0？）" + mk(pos2(vL)), vL), row("　另列：只做空（兩段平均R>0？）" + mk(pos2(vS)), vS));
  const vBTC = seg(rawB.filter(x => x.cn === "BTC")), vETH = seg(rawB.filter(x => x.cn === "ETH")); o.extra["只 BTC"] = { res: vBTC }; o.extra["只 ETH"] = { res: vETH };
  L.push(row("　另列：只 BTC" + mk(pos2(vBTC)), vBTC), row("　另列：只 ETH" + mk(pos2(vETH)), vETH));
  const raw5 = r36({ pick: t => top5At(t) }), j5 = cnt(judgeAbs(raw5)); const rawAll = r36({ pick: t => ["BTC", "ETH", ...top5At(t)] }), jAll = cnt(judgeAbs(rawAll));
  o.extra["前 5 幣版"] = { judge: j5, res: j5.res, be: j5.be, raw: raw5.length }; o.extra["BTC+ETH+前 5 幣"] = { judge: jAll, res: jAll.res, be: jAll.be, raw: rawAll.length };
  L.push(row("　另列：前 5 幣版（排除 BTC／ETH、點時選取）" + mk(j5.pass), j5.res), row("　另列：BTC+ETH+前 5 幣合併" + mk(jAll.pass), jAll.res));
  const rawFee = rawB.map(x => ({ ...x, R: x.R + x.feeR })), vFee = seg(rawFee); o.extra["含費率腿估算"] = { res: vFee };
  L.push(row("　另列：含費率腿估算（前一日費率÷3×跨結算次數）" + mk(pos2(vFee)), vFee));
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = jB.pass && o.overfit.ok; o.res = jB.res; o.month = monthly(jB.res.ALL); o.year = byYear(rawB); o.byEv = grp(rawB, "ev"); o.byEvAll = grp(rawAll, "ev"); o.verdict = o.ok ? "合格（新部門候選，與現有各組並列）" : verdictAbs(jB).replace(/（.*/, "") ;
  L.push("", `R36 基準：事件×幣 候選 ${rawB.cand}、過門檻 ${rawB.sig}、成交 ${rawB.length} 筆；損益兩平成本倍數 ${jB.be}；多空：${bySd(jB.res.ALL)}；出場原因：${byW(jB.res.ALL)}；分狀態：${bySt(jB.res.ALL)}；按事件類型：${grpText(o.byEv)}（合併版：${grpText(o.byEvAll)}）；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}；按年：${yrText(o.year)}；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}；停損高原 ${o.plateau}；含費率腿全期平均R ${vFee.ALL.avgR}（未含 ${jB.res.ALL.avgR}）`);
  L.push(`判定：${J(jB)}（${verdictAbs(jB)}）；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → **${o.ok ? "合格（新部門候選，與現有各組並列）" : verdictAbs(jB).startsWith("判不了") ? "判不了" : "不合格"}**`);
  L.push(`【審查表】R36：共試 ${o.tried} 組（基準 1＋鄰近 ${nn}＋停損高原 4＋前 5 幣 2）、合格 ${o.passed} 組；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}${pos2(v15) ? "（仍正）" : "（轉負）"}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}${pos2(v2) ? "（仍正）" : "（轉負）"}；按月 ${o.month.months} 個月中 ${o.month.pos} 個月為正；最好兩個月佔總R ${o.month.top2 != null ? Math.round(o.month.top2 * 100) + "%" : "不計（總R ≤0）"}；停損高原 ${o.plateau}；只多 ${vL.ALL.n} 筆／${vL.ALL.avgR}R、只空 ${vS.ALL.n} 筆／${vS.ALL.avgR}R`, "");
  OUT.exp1 = o; console.log("R36 完成", rawB.length, "筆", elapsed());
}

// ===== 實驗二：R12 事件日擁擠方清洗順勢 =====
L.push("## 實驗二：R12 事件日擁擠方清洗順勢（事件型多空；主測 BTC／ETH，擁擠度用 BTC 的 OI／費率；無對應部門 → 絕對門檻）", "",
  "定義：事件日 d（UTC）00:00 評估：BTC OI（前一日日末）較 5 日前升 ≥5%，且 d−5～d−1 五個 BTC 費率日合計同號（全正＝多擁擠 → 之後只做空；全負＝空擁擠 → 只做多）。觸發：含公布時刻的 4h K（t＝floor(T/4h)）收盤相對該根開盤逆擁擠方向 ≥1%（多擁擠時收跌 ≥1%）。進場＝下一根 4h 開盤（用 15 分K 走路徑）；停損＝事件 4h K 極值（空＝高點、多＝低點），1R＝進場到停損距離；出場＝先到 1.5R 停利或停損（同根先算停損）或持有 6 根 4h（24h）後收盤平倉。鄰近（±20%）：OI 4／6%、觸發 0.8／1.2%、持有 5／7 根、R:R 1.2／1.8。另列：停損距離 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只多／只空、按事件類型、40 幣版（各用自己的 OI／費率）、無 OI 對照（只用費率同號，2024-05 起）、費率腿估算。", "");
// opt：oiTh、trig、hold（4h 根數）、rr、stopMul、useOI、ownOI（各幣自己的 OI／費率）、pick、costMul
function r12(opt = {}) {
  const { oiTh = 0.05, trig = 0.01, hold = 6, rr = 1.5, stopMul = 1, useOI = true, ownOI = false, pick = () => ["BTC", "ETH"], costMul: cm = 1 } = opt; const out = []; let pre = 0, sig = 0, cand = 0;
  for (const ev of EVALL) {
    const d = dk(ev.t);
    for (const cn of pick(ev.t)) {
      if (!data[cn]) continue; const gcn = ownOI ? cn : "BTC"; cand++;
      if (useOI) { const ch = oiChg(gcn, d - 1, 5); if (!(ch >= oiTh)) continue; }
      let crowd = 0, okF = true; for (let k = 1; k <= 5; k++) { const f = frAt(gcn, d - k); if (isNaN(f) || f === 0) { okF = false; break; } const s = f > 0 ? 1 : -1; if (!crowd) crowd = s; else if (crowd !== s) { okF = false; break; } } if (!okF || !crowd) continue; pre++;
      const H = data[cn].h, hi = hIdx[cn]; const t4 = Math.floor(ev.t / H4) * H4; const i4 = hi.get(t4); if (i4 == null || i4 + 1 >= H.length) continue; const b4 = H[i4]; const mv = b4.c / b4.o - 1;
      const side = -crowd; // 多擁擠→空
      if (!(side * mv >= trig)) continue; sig++;
      const M = data[cn].m, ix = mIdx[cn]; const iE = ix.get(t4 + H4); if (iE == null) continue; const e = M[iE].o; if (!(e > 0)) continue;
      const ext = side > 0 ? b4.l : b4.h; let r = Math.abs(e - ext) * stopMul; if (!(r > 0) || r / e < 0.001) continue; const st = side > 0 ? e - r : e + r, tp = side > 0 ? e + rr * r : e - rr * r; const iEnd = Math.min(iE + hold * 16 - 1, M.length - 1);
      let ex = M[iEnd].c, why = "時間平倉", tx = M[iEnd].t + M15;
      for (let i = iE; i <= iEnd; i++) { const b = M[i]; if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; } if (side > 0 ? b.h >= tp : b.l <= tp) { ex = side > 0 ? Math.max(b.o, tp) : Math.min(b.o, tp); why = "停利"; tx = b.t + M15; break; } }
      const gross = side * (ex - e) / r, costR = tieredCost(cn, M[iE].t) * e / r, fl = frLeg(cn, M[iE].t, tx); const feeR = isNaN(fl) ? 0 : -side * fl * e / r;
      out.push({ cn, t: M[iE].t, tx, R: gross - cm * costR, gross, costR, feeR, state: stateAt(M[iE].t), why, side: side > 0 ? "多" : "空", ev: ev.k, crowd: crowd > 0 ? "多擁擠" : "空擁擠", rPct: +(r / e * 100).toFixed(2) });
    }
  }
  out.pre = pre; out.sig = sig; out.cand = cand; return out;
}
{
  const o = { neigh: {}, extra: {}, tried: 0, passed: 0 }; const cnt = j => { o.tried++; if (j.pass) o.passed++; return j; };
  const rawB = r12(); const jB = cnt(judgeAbs(rawB)); o.base = { judge: jB, res: jB.res, be: jB.be, raw: rawB.length, pre: rawB.pre, sig: rawB.sig, cand: rawB.cand };
  L.push(...HDR, row("R12 基準：BTC／ETH、OI +5%、觸發 1%、1.5R／24h" + mk(jB.pass), jB.res));
  let np = 0, nn = 0;
  for (const [nm2, opt] of [["OI 4%", { oiTh: 0.04 }], ["OI 6%", { oiTh: 0.06 }], ["觸發 0.8%", { trig: 0.008 }], ["觸發 1.2%", { trig: 0.012 }], ["持有 5 根", { hold: 5 }], ["持有 7 根", { hold: 7 }], ["R:R 1.2", { rr: 1.2 }], ["R:R 1.8", { rr: 1.8 }]]) {
    const rr2 = r12(opt), nj = cnt(judgeAbs(rr2)); o.neigh[nm2] = { judge: nj, res: nj.res, be: nj.be, raw: rr2.length }; nn++; if (nj.pass) np++; L.push(row("　鄰近：" + nm2 + mk(nj.pass), nj.res));
  }
  const stops = {}; let sp = 0; for (const sm of [0.5, 0.75, 1.25, 1.5]) { const rr2 = r12({ stopMul: sm }), nj = cnt(judgeAbs(rr2)); stops[sm] = { judge: nj, res: nj.res, be: nj.be }; if (nj.pass) sp++; L.push(row(`　停損距離 ×${sm}` + mk(nj.pass), nj.res)); } o.stops = stops; o.plateau = `${sp}/4`;
  const v15 = seg(costMul(rawB, 1.5)), v2 = seg(costMul(rawB, 2)); o.extra["成本 ×1.5"] = { res: v15, pos: pos2(v15) }; o.extra["成本 ×2"] = { res: v2, pos: pos2(v2) };
  L.push(row("　另列：成本 ×1.5（兩段平均R>0？）" + mk(pos2(v15)), v15), row("　另列：成本 ×2（兩段平均R>0？）" + mk(pos2(v2)), v2));
  const vL = seg(rawB.filter(x => x.side === "多")), vS = seg(rawB.filter(x => x.side === "空")); o.extra["只多"] = { res: vL, pos: pos2(vL) }; o.extra["只空"] = { res: vS, pos: pos2(vS) };
  L.push(row("　另列：只做多（空擁擠清洗）" + mk(pos2(vL)), vL), row("　另列：只做空（多擁擠清洗）" + mk(pos2(vS)), vS));
  const raw40 = r12({ ownOI: true, pick: () => U19 }), j40 = cnt(judgeAbs(raw40)); o.extra["40 幣版"] = { judge: j40, res: j40.res, be: j40.be, raw: raw40.length, pre: raw40.pre, sig: raw40.sig };
  L.push(row("　另列：40 幣版（各用自己的 OI／費率）" + mk(j40.pass), j40.res));
  const rawNO = r12({ useOI: false }), jNO = cnt(judgeAbs(rawNO)); o.extra["無 OI 對照"] = { judge: jNO, res: jNO.res, be: jNO.be, raw: rawNO.length, pre: rawNO.pre, sig: rawNO.sig };
  L.push(row("　另列：無 OI 對照（只用費率同號，2024-05 起）" + mk(jNO.pass), jNO.res));
  const rawNO40 = r12({ useOI: false, ownOI: true, pick: () => U19 }), jNO40 = cnt(judgeAbs(rawNO40)); o.extra["無 OI 40 幣對照"] = { judge: jNO40, res: jNO40.res, be: jNO40.be, raw: rawNO40.length };
  L.push(row("　另列：無 OI 40 幣對照" + mk(jNO40.pass), jNO40.res));
  const rawFee = rawB.map(x => ({ ...x, R: x.R + x.feeR })), vFee = seg(rawFee); o.extra["含費率腿估算"] = { res: vFee };
  L.push(row("　另列：含費率腿估算" + mk(pos2(vFee)), vFee));
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = jB.pass && o.overfit.ok; o.res = jB.res; o.month = monthly(jB.res.ALL); o.year = byYear(rawB); o.byEv = grp(rawB, "ev"); o.byCrowd = grp(rawB, "crowd"); o.byEvNO = grp(rawNO, "ev");
  const avgRp = rawB.length ? +(rawB.reduce((a, x) => a + x.rPct, 0) / rawB.length).toFixed(2) : null;
  L.push("", `R12 基準：事件×幣 候選 ${rawB.cand}、過前置（OI＋費率同號）${rawB.pre}、過觸發 ${rawB.sig}、成交 ${rawB.length} 筆（無 OI 對照 ${rawNO.length} 筆、40 幣版 ${raw40.length} 筆）；平均停損距離 ${avgRp}%；損益兩平成本倍數 基準 ${jB.be}、無 OI ${jNO.be}、40 幣 ${j40.be}；多空：${bySd(jB.res.ALL)}；擁擠方向：${grpText(o.byCrowd)}；出場原因：${byW(jB.res.ALL)}；分狀態：${bySt(jB.res.ALL)}；按事件類型：${grpText(o.byEv)}（無 OI 對照：${grpText(o.byEvNO)}）；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}；按年：${yrText(o.year)}；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}；停損高原 ${o.plateau}；含費率腿全期平均R ${vFee.ALL.avgR}`);
  L.push(`判定：${J(jB)}（${verdictAbs(jB)}）；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → **${o.ok ? "合格（新部門候選，與現有各組並列）" : verdictAbs(jB).startsWith("判不了") ? "判不了" : "不合格"}**`);
  L.push(`【審查表】R12：共試 ${o.tried} 組（基準 1＋鄰近 ${nn}＋停損 4＋40 幣 1＋無 OI 對照 2）、合格 ${o.passed} 組；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}${pos2(v15) ? "（仍正）" : "（轉負）"}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}${pos2(v2) ? "（仍正）" : "（轉負）"}；按月 ${o.month.months} 個月中 ${o.month.pos} 個月為正；最好兩個月佔總R ${o.month.top2 != null ? Math.round(o.month.top2 * 100) + "%" : "不計（總R ≤0）"}；停損高原 ${o.plateau}；只多 ${vL.ALL.n} 筆／${vL.ALL.avgR}R、只空 ${vS.ALL.n} 筆／${vS.ALL.avgR}R`, "");
  OUT.exp2 = o; console.log("R12 完成", rawB.length, "筆", elapsed());
}
const fin = (o, nm2) => `${nm2} ${o.ok ? "合格" : verdictAbs(o.base.judge).startsWith("判不了") ? "判不了" : "不合格"}（全期 ${o.res.ALL.n} 筆、樣本外 ${o.res.OOS.n} 筆；共試 ${o.tried} 組合格 ${o.passed} 組；鄰近 ${o.overfit.pass}/${o.overfit.n}；停損高原 ${o.plateau}）`;
L.push(`結論：${fin(OUT.exp1, "R36")}；${fin(OUT.exp2, "R12")}。合格者才能以新一組虛擬單並列上線；判不了＝等樣本或擴幣池，不得當作「差」也不得上線。`);
await fs.writeFile("lab/report32.md", L.join("\n"));
await fs.writeFile("lab/results32.json", JSON.stringify(OUT));
console.log(L.join("\n"));
