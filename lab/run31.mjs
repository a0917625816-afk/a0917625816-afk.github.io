// 策略實驗室 第三十一輪（11/21 會議決議）
// 實驗一（CEO 網上研究，來源 Shen、Urquhart & Wang 2022〈Bitcoin Intraday Time-Series Momentum〉Financial Review；登記 C17）：BTC 美股末半小時日內時序動能，只做 BTC、多空。定義：ONFH＝C(10:00 ET)/C(前一日 17:00 ET)−1、SLH＝C(16:30 ET)/C(16:00 ET)−1；16:30 ET 收盤算訊號：ONFH>0 且 SLH<0 做多、ONFH≤0 且 SLH≥0 做空、其餘不做；16:30 ET 那根開盤進、17:00 ET 平倉；每天最多 1 筆；主測只做週一～週五 ET、無停損（原文無）；1R 固定＝進場價 1.5%（有無停損都一樣算，兩版可比）。主測加「高量日濾網」：16:30 ET 前 24h 成交額 ≥ 過去 30 個日曆日每日成交額中位數才交易；無濾網版當對照、上三分位當副測。無對應部門 → 用絕對門檻判：樣本內／外各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近（ONFH 視窗 60 分、SLH 視窗 60 分、進場 16:15／16:45、全週 7 天、量濾網上三分位）過半合格才算通過審查。另列：成本 ×1.5／×2、無停損 vs 1.5% 硬停、只多／只空、按月、分狀態、按年。
// 實驗二（run30 盤整濾網「再修」，11/20 登記補測）：波段A 只在「盤整」開單（進場前一日 BTC 非恐慌且在 EMA50 ±3% 內），原本＝波段A。本輪補四件事、全部要過才合格：① 細鄰近 盤整帶 ±2.4／2.7／3.3／3.6%（恐慌參數不綁定、不再列），算合格比例；② 去掉盤整版 ALL 按月合計R 最高的兩個月（基準同去），重算 seg 與 judge；③ 幣清單聯集 list18 ∪ list19，基準同聯集；④ 疊加「盤整＋週一不開單」：judge vs 波段A、按月、成本 ×1.5／×2、停損高原、鄰近四組都疊週一、與波段A-M（只 isMon）比較與重疊。
// 偏誤交代（審查表 B）：C17 單幣 BTC（無幣池存活者偏差）；ET 換算含夏令時（nthSunday／etToUtc）；訊號只用已收盤 15 分K；進場用訊號 K 之後那根開盤；成本分級（BTC 落 0.14%）；日內單不計費率（17:00 ET 平倉、不過 UTC 00:00 結算，不比波段少算）；停損滑價另計（有停損版用 min(開盤, 停損價) 保守出）；3 個主要參數（ONFH 視窗、SLH 視窗、進場時刻）＋量濾網 1 個。盤整濾網：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）、聯集另列；指標只用已收盤 K、市場狀態用進場前一日日K；進場用下一根開盤；成本分級；與波段A 同口徑（未計費率）；1 個參數（盤整帶）。樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告。
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
// ===== 部門（原本）=====
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const nm = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";

// ===== ADX（Wilder；本輪未用，保留工具）=====
function adx(c, n = 14) { const L = c.length, out = new Array(L).fill(NaN); if (L <= 2 * n) return out; const tr = [], pdm = [], ndm = []; for (let i = 0; i < L; i++) { if (!i) { tr.push(c[i].h - c[i].l); pdm.push(0); ndm.push(0); continue; } const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l; pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0); tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c))); } let sTR = 0, sP = 0, sN = 0; for (let i = 1; i <= n; i++) { sTR += tr[i]; sP += pdm[i]; sN += ndm[i]; } const dx = new Array(L).fill(NaN); const dxAt = () => { const pdi = sTR > 0 ? 100 * sP / sTR : 0, ndi = sTR > 0 ? 100 * sN / sTR : 0; return pdi + ndi > 0 ? 100 * Math.abs(pdi - ndi) / (pdi + ndi) : 0; }; dx[n] = dxAt(); for (let i = n + 1; i < L; i++) { sTR = sTR - sTR / n + tr[i]; sP = sP - sP / n + pdm[i]; sN = sN - sN / n + ndm[i]; dx[i] = dxAt(); } let s = 0; for (let i = n; i < 2 * n; i++) s += dx[i]; out[2 * n - 1] = s / n; for (let i = 2 * n; i < L; i++) out[i] = (out[i - 1] * (n - 1) + dx[i]) / n; return out; }
const hIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].h.forEach((b, i) => m.set(b.t, i)); hIdx[cn] = m; }
const ADX = {}; const adxOf = (cn, tf, n) => { const k = cn + tf + n; return ADX[k] ||= adx(data[cn][tf], n); };
const adxBan4h = (th, n = 14, inv = false) => (cn, t) => { const i = hIdx[cn].get(t); if (i == null || i < 1) return true; const v = adxOf(cn, "h", n)[i - 1]; if (!(v >= 0)) return true; return inv ? v < th : !(v < th); };
const adxBanD = (th, n = 14) => (cn, t) => { const i = dIdx[cn].get(dk(t) - 1); if (i == null) return true; const v = adxOf(cn, "d", n)[i]; if (!(v >= 0)) return true; return !(v < th); };

// 週一桶（與 run27／波段A-M 同定義：UTC 週一 00:00～24:00）
const MON0 = Date.UTC(2024, 0, 1);
const wk = t => (((t - MON0) % (7 * D1)) + 7 * D1) % (7 * D1);
const isMon = t => wk(t) < 24 * H1;
// 重疊統計工具
const keyOf = x => x.cn + ":" + x.t;
function overlap(a, b) { const sb = new Set(b.map(keyOf)); const both = a.filter(x => sb.has(keyOf(x))).length; return { a: a.length, b: b.length, both, jaccard: a.length + b.length - both ? +(both / (a.length + b.length - both)).toFixed(2) : 0 }; }
const stopRows = (S, base0, ban, baseRaw) => { const rows = []; for (const sm of [0.5, 0.75, 1.25, 1.5]) { const bb = seg(runRaw(S, UNI19, { stopMul: sm })), vv = seg(runRaw(S, UNI19, { ban, stopMul: sm })), nj = judge(bb, vv); rows.push({ sm, base: bb, res: vv, judge: nj }); L.push(row(`　停損 ×${sm}（原本同倍數）` + mk(nj.pass), vv), row("　　（原本）", bb)); } return rows; };
const plateau = rows => { const p = rows.filter(r => r.judge.pass).length; return { n: rows.length, pass: p, text: `${p}/${rows.length}` }; };

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, list18: U18, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第三十一輪：C17 BTC 美股末半小時時序動能（高量日濾網版）＋盤整濾網再修", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣；list18 ${U18.length} 幣；實驗一只用 BTC）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；審查表 A 另看 成本 ×1.5／×2、停損高原、按月。「原本」會前寫死（11/21 會議）：實驗一 C17 是 BTC 單幣日內多空、沒有對應部門 → 用絕對門檻判（樣本內／外各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近過半合格才算通過審查）；實驗二盤整濾網是套用於波段A 的純進場濾網 → 原本＝波段A，run30 判「再修」，本輪四項補測全部要過才合格。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：C17 單幣 BTC，無幣池存活者偏差；美東時間換算含夏令時；訊號只用已收盤 15 分K、進場用訊號 K 之後那根的開盤；成本分級（BTC 落 0.14%）、1R 固定＝進場價 1.5%；日內單 17:00 ET 平倉不跨 UTC 結算、未計費率；有停損版用 min(開盤, 停損價) 保守出、滑價另計；3 個主要參數（ONFH 視窗、SLH 視窗、進場時刻）＋量濾網分位 1 個，各試組數寫在下面。盤整濾網：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內），另列 list18 ∪ list19 聯集；指標只用已收盤 K、市場狀態用進場前一日的日K；進場用下一根開盤；成本分級；與波段A 同口徑（未計費率）；停損滑價另計；1 個參數（盤整帶）。樣本內 65%／樣本外 35%，參數只在樣本內定。", ""];

// ===== 實驗一：C17 BTC 美股末半小時日內時序動能 =====
L.push("## 實驗一：C17 BTC 美股末半小時日內時序動能（高量日濾網版；只做 BTC、多空；無對應部門 → 絕對門檻）", "",
  "定義（Shen、Urquhart & Wang 2022）：交易日 D（主測只做週一～週五 ET）：ONFH＝C(10:00 ET, D)／C(17:00 ET, D−1)−1；SLH＝C(16:30 ET)／C(16:00 ET)−1（C(hh:mm)＝結束於 hh:mm ET 那根 15 分K 的收盤）。16:30 ET 收盤算訊號：ONFH>0 且 SLH<0 → 做多；ONFH≤0 且 SLH≥0 → 做空；其餘不做；每天最多 1 筆。進場＝16:30 ET 那根（t＝16:30 ET 開始）的開盤；出場＝17:00 ET 平倉（t＝16:45 ET 那根的收盤）。主測無停損（原文無）、副測 1.5% 硬停損（15 分K 的 l／h 碰到就出）。1R 固定＝進場價 1.5%（有無停損都一樣算，兩版可比）：gross＝side×(出場−進場)／進場／0.015、costR＝分級成本／0.015。高量日濾網（主測）：D 日 16:30 ET 前 24 小時 BTC 成交額（前 96 根 c×v 合計）≥ 過去 30 個日曆日「每日成交額」（同法算、結束於各日 16:30 ET）的中位數才交易；副測 ≥ 上三分位（第 67 百分位）；無濾網版當對照。鄰近（每個對基準單改一項）：ONFH 視窗到 10:30 ET（60 分）、SLH 視窗 15:30→16:30（60 分）、進場 16:15 ET／出場 16:45（訊號窗同移 15 分：SLH 15:45→16:15）、進場 16:45 ET／出場 17:00（只持 15 分，SLH 16:15→16:45）、全週 7 天、量濾網上三分位。判定：樣本內／外各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數（gross 合計／costR 合計）≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近過半合格才算通過審查。", "");
const BM = data.BTC.m, BQ = new Float64Array(BM.length + 1); for (let i = 0; i < BM.length; i++) BQ[i + 1] = BQ[i] + BM[i].c * BM[i].v;
const bi = t => mIdx.BTC.get(t);
const hmAdd = (hm, min) => { const [h, m] = hm.split(":").map(Number); const x = h * 60 + m + min; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
const dayStr = ms => new Date(ms).toISOString().slice(0, 10);
const DAYS = []; { const a = Math.floor(BM[0].t / D1) * D1, b = Math.floor(BM.at(-1).t / D1) * D1; for (let d = a; d <= b + D1; d += D1) DAYS.push(d); }
const dowOf = d => new Date(d).getUTCDay();
const vol24 = t => { const i = bi(t); return i == null || i < 96 ? NaN : BQ[i] - BQ[i - 96]; }; // 結束於 t（不含 t 那根）的前 96 根成交額（U）
const quantile = (arr, q) => { const a = arr.filter(x => x >= 0).sort((x, y) => x - y); if (!a.length) return NaN; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); };
// opt：onfh（ONFH 結束 ET 時刻）、slhLen（SLH 視窗分鐘，結束於 entry）、entry／exit（ET 時刻）、week 5|7、stop（比例或 null）、volQ（量濾網分位或 null）、costMul
function c17(opt = {}) {
  const { onfh = "10:00", slhLen = 30, entry = "16:30", exit = "17:00", week = 5, stop = null, volQ = null, costMul: cm = 1 } = opt; const RU = 0.015, out = [];
  const closeAt = (ds, hm) => { const i = bi(etToUtc(ds, hm) - M15); return i == null ? NaN : BM[i].c; };
  const vcache = new Map(); const v24 = ds => { if (!vcache.has(ds)) vcache.set(ds, vol24(etToUtc(ds, entry))); return vcache.get(ds); };
  let sig = 0;
  for (let k = 1; k < DAYS.length; k++) {
    const d = DAYS[k], ds = dayStr(d), dp = dayStr(DAYS[k - 1]), dow = dowOf(d);
    if (week === 5 && (dow === 0 || dow === 6)) continue;
    const tE = etToUtc(ds, entry), tX = etToUtc(ds, exit); const iE = bi(tE), iX = bi(tX - M15); if (iE == null || iX == null || iX < iE) continue;
    const cPrev = closeAt(dp, "17:00"), cOn = closeAt(ds, onfh), c1 = closeAt(ds, hmAdd(entry, -slhLen)), c2 = closeAt(ds, entry);
    if (![cPrev, cOn, c1, c2].every(x => x > 0)) continue;
    const onf = cOn / cPrev - 1, slh = c2 / c1 - 1; let side = 0; if (onf > 0 && slh < 0) side = 1; else if (onf <= 0 && slh >= 0) side = -1; if (!side) continue;
    sig++;
    let vf = null; if (volQ != null) { const hist = []; for (let j = 1; j <= 30 && k - j >= 1; j++) hist.push(v24(dayStr(DAYS[k - j]))); const h2 = hist.filter(x => x >= 0); if (h2.length < 20) continue; const th = quantile(h2, volQ), cur = v24(ds); if (!(cur >= th)) continue; vf = +(cur / th).toFixed(2); }
    const e = BM[iE].o; let ex = BM[iX].c, why = `${exit} 平倉`, tx = BM[iX].t + M15;
    if (stop) { const st = side > 0 ? e * (1 - stop) : e * (1 + stop); for (let i = iE; i <= iX; i++) { const b = BM[i]; if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; } } }
    if (!(e > 0 && ex > 0)) continue;
    const gross = side * (ex - e) / e / RU, costR = tieredCost("BTC", tE) / RU;
    out.push({ cn: "BTC", t: tE, tx, R: gross - cm * costR, gross, costR, state: stateAt(tE), why, side: side > 0 ? "多" : "空", day: ds, onfh: +onf.toFixed(5), slh: +slh.toFixed(5), vf });
  }
  const res = out.filter(x => x.t >= t0); res.sig = sig; return res;
}
// 絕對門檻判定（無原本部門）
function judgeAbs(raw) { const v = seg(raw), v15 = seg(costMul(raw, 1.5)), be = breakEven(raw); const why = []; for (const [nm2, s, s15] of [["樣本內", v.IS, v15.IS], ["樣本外", v.OOS, v15.OOS]]) { if (s.n < 30) why.push(`${nm2}筆數 ${s.n} < 30`); if (!(s.avgR > 0)) why.push(`${nm2}平均R ${s.avgR} ≤ 0`); if (!(s.win > 50)) why.push(`${nm2}勝率 ${s.win}% ≤ 50%`); if (!(s15.avgR > 0)) why.push(`${nm2}成本×1.5 後平均R ${s15.avgR} ≤ 0`); } if (!(be >= 1.5)) why.push(`損益兩平成本倍數 ${be} < 1.5`); return { pass: !why.length, res: v, res15: v15, be, why, n: raw.length }; }
const pos2 = v => v.IS.avgR > 0 && v.OOS.avgR > 0;
const byYear = tr => { const g = {}; for (const x of tr) { const y = new Date(x.t).getUTCFullYear(); const v = g[y] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const yrText = o => Object.entries(o).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
{
  const o = { neigh: {}, extra: {}, tried: 0, passed: 0 }; const cnt = j => { o.tried++; if (j.pass) o.passed++; return j; };
  const rawNF = c17(), rawB = c17({ volQ: 0.5 }); const jNF = cnt(judgeAbs(rawNF)), jB = cnt(judgeAbs(rawB));
  o.nofilter = { judge: jNF, res: jNF.res, be: jNF.be, raw: rawNF.length, sig: rawNF.sig }; o.base = { judge: jB, res: jB.res, be: jB.be, raw: rawB.length, sig: rawB.sig };
  L.push(...HDR, row("對照：無量濾網（週一～五、無停損）" + mk(jNF.pass), jNF.res), row("C17 基準：高量日 ≥ 30 日中位數（週一～五、無停損）" + mk(jB.pass), jB.res));
  let np = 0, nn = 0;
  for (const [nm2, opt] of [["ONFH 視窗到 10:30 ET（60 分）", { volQ: 0.5, onfh: "10:30" }], ["SLH 視窗 15:30→16:30（60 分）", { volQ: 0.5, slhLen: 60 }], ["進場 16:15 ET、出場 16:45（SLH 15:45→16:15）", { volQ: 0.5, entry: "16:15", exit: "16:45" }], ["進場 16:45 ET、出場 17:00（只持 15 分，SLH 16:15→16:45）", { volQ: 0.5, entry: "16:45" }], ["全週 7 天", { volQ: 0.5, week: 7 }], ["量濾網 ≥ 上三分位（第 67 百分位）", { volQ: 0.67 }]]) {
    const rr = c17(opt), nj = cnt(judgeAbs(rr)); o.neigh[nm2] = { judge: nj, res: nj.res, be: nj.be, raw: rr.length }; nn++; if (nj.pass) np++; L.push(row("　" + nm2 + mk(nj.pass), nj.res));
  }
  // 另列：停損版、成本倍數、只多／只空
  const rawBS = c17({ volQ: 0.5, stop: 0.015 }), rawNFS = c17({ stop: 0.015 }); const jBS = cnt(judgeAbs(rawBS)), jNFS = cnt(judgeAbs(rawNFS));
  o.extra["1.5% 硬停損（基準＋量濾網）"] = { judge: jBS, res: jBS.res, be: jBS.be, raw: rawBS.length }; o.extra["1.5% 硬停損（無濾網）"] = { judge: jNFS, res: jNFS.res, be: jNFS.be, raw: rawNFS.length };
  L.push(row("　另列：1.5% 硬停損（基準＋量濾網）" + mk(jBS.pass), jBS.res), row("　另列：1.5% 硬停損（無濾網）" + mk(jNFS.pass), jNFS.res));
  const v15 = seg(costMul(rawB, 1.5)), v2 = seg(costMul(rawB, 2)); o.extra["成本 ×1.5"] = { res: v15, pos: pos2(v15) }; o.extra["成本 ×2"] = { res: v2, pos: pos2(v2) };
  L.push(row("　另列：成本 ×1.5（兩段平均R>0？）" + mk(pos2(v15)), v15), row("　另列：成本 ×2（兩段平均R>0？）" + mk(pos2(v2)), v2));
  const vL = seg(rawB.filter(x => x.side === "多")), vS = seg(rawB.filter(x => x.side === "空")); o.extra["只多"] = { res: vL, pos: pos2(vL) }; o.extra["只空"] = { res: vS, pos: pos2(vS) };
  L.push(row("　另列：只做多（兩段平均R>0？）" + mk(pos2(vL)), vL), row("　另列：只做空（兩段平均R>0？）" + mk(pos2(vS)), vS));
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = jB.pass && o.overfit.ok; o.res = jB.res; o.month = monthly(jB.res.ALL); o.monthNF = monthly(jNF.res.ALL); o.year = byYear(rawB); o.yearNF = byYear(rawNF);
  const small = jB.res.IS.n < 30 || jB.res.OOS.n < 30;
  L.push("", `C17 基準：訊號日 ${rawB.sig} 天、過量濾網 ${rawB.length} 筆（無濾網 ${rawNF.length} 筆）；損益兩平成本倍數 基準 ${jB.be}、無濾網 ${jNF.be}；多空：${bySd(jB.res.ALL)}；出場原因：${byW(jB.res.ALL)}；分狀態：${bySt(jB.res.ALL)}；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}（無濾網 ${monthText(o.monthNF)}）；按年：${yrText(o.year)}（無濾網 ${yrText(o.yearNF)}）；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}；無停損 vs 1.5% 硬停：全期平均R ${jB.res.ALL.avgR} vs ${jBS.res.ALL.avgR}、回撤 ${jB.res.ALL.dd}% vs ${jBS.res.ALL.dd}%`);
  L.push(`判定：${J(jB)}${jB.pass ? "" : small ? "（筆數不足：判不了，等樣本）" : "（樣本夠，是真的差）"}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格（新部門候選，與現有各組並列）**" : small ? "**判不了**" : "**不合格**"}`);
  L.push(`【審查表】C17：共試 ${o.tried} 組（基準 1＋鄰近 ${nn}＋無濾網對照 1＋停損版 2）、合格 ${o.passed} 組；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}${pos2(v15) ? "（仍正）" : "（轉負）"}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}${pos2(v2) ? "（仍正）" : "（轉負）"}；按月 ${o.month.months} 個月中 ${o.month.pos} 個月為正；最好兩個月佔總R ${o.month.top2 != null ? Math.round(o.month.top2 * 100) + "%" : "不計（總R ≤0）"}；只多 ${vL.ALL.n} 筆／${vL.ALL.avgR}R、只空 ${vS.ALL.n} 筆／${vS.ALL.avgR}R`, "");
  OUT.exp1 = o; console.log("C17 完成", rawB.length, "筆", elapsed());
}

// ===== 實驗二：盤整濾網 再修（四項補測）=====
L.push("## 實驗二：波段A 只在「盤整」開單 再修（run30 判再修；原本＝波段A；四項全過才合格）", "",
  "定義同 run30 實驗二：波段A 進場不變，另加「進場前一日 BTC 市場狀態＝盤整」才進（恐慌＝5 日報酬 ≤ −8% 或 ATR14/價 ≥4.5%；趨勢上＝收盤 > EMA50×1.03；趨勢下＝< EMA50×0.97；其餘＝盤整，即 BTC 非恐慌且在 EMA50 ±3% 內）；出場不變。本輪補四件事：① 細鄰近 盤整帶 ±2.4／2.7／3.3／3.6%（恐慌參數不綁定，不再列），過半合格才過；② 去掉盤整版 ALL 按月合計R 最高的兩個月（基準同去）重算 judge；③ 幣清單聯集 list18 ∪ list19（基準同聯集）judge；④ 疊加「盤整＋週一不開單」：judge vs 波段A、按月、成本 ×1.5／×2（原本同倍）、停損高原、鄰近四組都疊週一、與波段A-M 比較與重疊。", "");
{
  const S = DEPTS[0], base = BASE.A; const banR = stateFn(); const raw = runRaw(S, UNI19, { ban: banR }), v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, raw: raw.length, items: {} };
  const keep = new Set(raw.map(keyOf)); const cut0 = RAW.A.filter(x => !keep.has(keyOf(x))); o.cutBucket = { n: cut0.length, win: cut0.length ? +(100 * cut0.filter(x => x.R > 0).length / cut0.length).toFixed(1) : null, avgR: cut0.length ? +(cut0.reduce((a, x) => a + x.R, 0) / cut0.length).toFixed(3) : null };
  o.be = breakEven(raw); o.month = monthly(v.ALL); o.monthBase = monthly(base.ALL);
  L.push(...HDR, row("原本 波段A（判定用）", base), row("盤整濾網 基準（帶 ±3%；run30 再修）" + mk(j.pass), v));
  L.push("", `基準：保留 ${raw.length} 筆（波段A 原始 ${RAW.A.length} 筆、被濾掉 ${cut0.length} 筆：勝率 ${o.cutBucket.win}%、平均 ${o.cutBucket.avgR}R）、損益兩平成本倍數 ${o.be}；出場原因：${byW(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}（原本 ${monthText(o.monthBase)}）。判定（基準 vs 波段A）：${J(j)} ${verdictNote(j, v)}`, "");
  // ① 細鄰近
  L.push("### ① 細鄰近：盤整帶 ±2.4／2.7／3.3／3.6%（恐慌參數不綁定，不列）", "", ...HDR, row("原本 波段A", base));
  { let np = 0, nn = 0; const rows = {}; for (const bd of [0.024, 0.027, 0.033, 0.036]) { const vv = seg(runRaw(S, UNI19, { ban: stateFn(bd) })), nj = judge(base, vv); nn++; if (nj.pass) np++; rows[`±${(bd * 100).toFixed(1)}%`] = { res: vv, judge: nj }; L.push(row(`　盤整帶 ±${(bd * 100).toFixed(1)}%` + mk(nj.pass), vv)); } o.items.neigh = { n: nn, pass: np, ok: np * 2 > nn, rows }; L.push("", `① 結果：${np}/${nn} 組合格（${(100 * np / nn).toFixed(0)}%）→ ${o.items.neigh.ok ? "**過**" : "**不過**（鄰近只在單一數值賺＝尖峰）"}`, ""); }
  // ② 去掉最好兩個月
  { const sums = Object.entries(v.ALL.byMonth).map(([k, x]) => [k, +(x.avgR * x.n).toFixed(2)]).sort((a, b) => b[1] - a[1]); const top2 = sums.slice(0, 2); const tm = new Set(top2.map(x => x[0])); const notTop = x => !tm.has(new Date(x.t).toISOString().slice(0, 7));
    const bEx = seg(RAW.A.filter(notTop)), rEx = raw.filter(notTop), vEx = seg(rEx), jEx = judge(bEx, vEx);
    o.items.exTop2 = { months: top2, base: bEx, res: vEx, judge: jEx, ok: jEx.pass, removed: raw.length - rEx.length };
    L.push(`### ② 去掉最好兩個月（盤整版 ALL 按月合計R 最高：${top2.map(x => `${x[0]}（合計 ${x[1] > 0 ? "+" : ""}${x[1]}R）`).join("、") || "無"}；拿掉盤整版 ${raw.length - rEx.length} 筆、基準 ${RAW.A.length - RAW.A.filter(notTop).length} 筆）`, "", ...HDR, row("原本 波段A（同樣去掉那兩個月）", bEx), row("盤整版 去掉最好兩個月" + mk(jEx.pass), vEx));
    L.push("", `② 結果：${J(jEx)} ${verdictNote(jEx, vEx)} → ${jEx.pass ? "**過**" : "**不過**（靠少數月份撐）"}`, ""); }
  // ③ 幣清單聯集
  { const UL = [...new Set([...U19, ...U18])], UNIU = { key: "U", list: UL }; const rbU = runRaw(S, UNIU), bU = seg(rbU), rU = runRaw(S, UNIU, { ban: banR }), vU = seg(rU), jU = judge(bU, vU);
    o.items.union = { list: UL, base: bU, res: vU, judge: jU, ok: jU.pass, be: breakEven(rU) };
    L.push(`### ③ 幣清單聯集 list18 ∪ list19（${UL.length} 幣；基準也用聯集重算）`, "", ...HDR, row("原本 波段A（聯集）", bU), row("盤整版（聯集）" + mk(jU.pass), vU));
    L.push("", `③ 結果：${J(jU)} ${verdictNote(jU, vU)} → ${jU.pass ? "**過**" : "**不過**（清單敏感）"}`, ""); }
  // ④ 疊加 盤整＋週一不開單
  { const banRM = (cn, t) => banR(cn, t) || isMon(t); const rRM = runRaw(S, UNI19, { ban: banRM }), vRM = seg(rRM), jRM = judge(base, vRM);
    const rawAM = runRaw(S, UNI19, { ban: (cn, t) => isMon(t) }), vAM = seg(rawAM);
    const st = { res: vRM, judge: jRM, ok: jRM.pass, raw: rRM.length, month: monthly(vRM.ALL), be: breakEven(rRM), cost: {}, neigh: {}, am: { res: vAM, raw: rawAM.length } };
    L.push("### ④ 疊加：盤整＋週一不開單（ban＝盤整濾網 OR 週一）", "", ...HDR, row("原本 波段A（判定用）", base), row("疊加：盤整＋週一不開單" + mk(jRM.pass), vRM), row("　參考：波段A-M（只週一不開單，已上線）", vAM));
    for (const k of [1.5, 2]) { const bb = seg(costMul(RAW.A, k)), vv = seg(runRaw(S, UNI19, { ban: banRM, costMul: k })), nj = judge(bb, vv); st.cost[k] = { base: bb, res: vv, judge: nj }; L.push(row(`　成本 ×${k}（原本也 ×${k}）` + mk(nj.pass), vv), row("　　（原本）", bb)); }
    st.stops = stopRows(S, base, banRM); st.plateau = plateau(st.stops);
    let np = 0, nn = 0; for (const bd of [0.024, 0.027, 0.033, 0.036]) { const sf = stateFn(bd); const vv = seg(runRaw(S, UNI19, { ban: (cn, t) => sf(cn, t) || isMon(t) })), nj = judge(base, vv); nn++; if (nj.pass) np++; st.neigh[`±${(bd * 100).toFixed(1)}%`] = { res: vv, judge: nj }; L.push(row(`　鄰近 盤整帶 ±${(bd * 100).toFixed(1)}%＋週一` + mk(nj.pass), vv)); }
    st.overfit = { n: nn, pass: np, ok: np * 2 > nn };
    st.vsAM = { IS: { win: [vRM.IS.win, vAM.IS.win], avgR: [vRM.IS.avgR, vAM.IS.avgR], dd: [vRM.IS.dd, vAM.IS.dd] }, OOS: { win: [vRM.OOS.win, vAM.OOS.win], avgR: [vRM.OOS.avgR, vAM.OOS.avgR], dd: [vRM.OOS.dd, vAM.OOS.dd] }, overlap: overlap(rRM, rawAM), judgeVsAM: judge(vAM, vRM) };
    L.push("", `④ 疊加版：保留 ${rRM.length} 筆（波段A-M ${rawAM.length} 筆、波段A ${RAW.A.length} 筆）、損益兩平成本倍數 ${st.be}；按月平均R：${st.month.text}；時間穩定：${monthText(st.month)}；成本 ×1.5 ${st.cost[1.5].judge.pass ? "合格" : "不合格"}、×2 ${st.cost[2].judge.pass ? "合格" : "不合格"}；停損高原 ${st.plateau.text} 合格；鄰近（疊週一）${np}/${nn} 合格`);
    if (jRM.pass) L.push(`疊加版 vs 波段A-M：樣本內 勝率 ${vRM.IS.win}% vs ${vAM.IS.win}%、平均R ${vRM.IS.avgR} vs ${vAM.IS.avgR}、回撤 ${vRM.IS.dd}% vs ${vAM.IS.dd}%；樣本外 勝率 ${vRM.OOS.win}% vs ${vAM.OOS.win}%、平均R ${vRM.OOS.avgR} vs ${vAM.OOS.avgR}、回撤 ${vRM.OOS.dd}% vs ${vAM.OOS.dd}%；保留單重疊：疊加版 ${st.vsAM.overlap.a} 筆、A-M ${st.vsAM.overlap.b} 筆、同時保留 ${st.vsAM.overlap.both} 筆（Jaccard ${st.vsAM.overlap.jaccard}）；以 A-M 當原本判疊加版：${J(st.vsAM.judgeVsAM)}`);
    L.push(`④ 結果：${J(jRM)} ${verdictNote(jRM, vRM)} → ${jRM.pass ? "**過**" : "**不過**"}`, "");
    o.items.stack = st; }
  // 總判定
  const it = o.items; const flags = [["① 細鄰近", it.neigh.ok], ["② 去掉最好兩個月", it.exTop2.ok], ["③ 幣清單聯集", it.union.ok], ["④ 疊加週一", it.stack.ok]];
  const failed = flags.filter(x => !x[1]).map(x => x[0]); o.ok = j.pass && !failed.length; o.note = verdictNote(j, v);
  const small = v.IS.n < 30 || v.OOS.n < 30;
  o.verdict = o.ok ? "合格（可並列上線；上線時與波段A-M 擇一）" : !j.pass ? (small ? "判不了（基準筆數不足）" : "不合格（基準 vs 波段A 沒過）") : !it.neigh.ok ? "淘汰（細鄰近只在單一數值賺＝尖峰）" : !it.exTop2.ok ? "再修（去掉最好兩個月就不過＝靴子靠少數月份）" : "再修（" + failed.join("、") + "沒過）";
  L.push(`盤整濾網 本輪四項：${flags.map(x => `${x[0]} ${x[1] ? "過" : "不過"}`).join("；")}；基準 vs 波段A ${j.pass ? "合格" : "不合格"}${o.note}`);
  L.push(`判定：${j.pass ? "基準合格" : "基準不合格"}；四項 ${flags.length - failed.length}/${flags.length} 過 → **${o.verdict}**`, "");
  OUT.exp2 = o; console.log("盤整濾網再修 完成", raw.length, "筆", elapsed());
}

L.push(`結論：C17 ${OUT.exp1.ok ? "合格" : (OUT.exp1.res.OOS.n < 30 || OUT.exp1.res.IS.n < 30) ? "判不了" : "不合格"}（BTC 單幣日內多空、絕對門檻；全期 ${OUT.exp1.res.ALL.n} 筆、樣本外 ${OUT.exp1.res.OOS.n} 筆；共試 ${OUT.exp1.tried} 組合格 ${OUT.exp1.passed} 組；鄰近 ${OUT.exp1.overfit.pass}/${OUT.exp1.overfit.n}；損益兩平成本倍數 ${OUT.exp1.base.be}；按月 ${OUT.exp1.month.months} 個月 ${OUT.exp1.month.pos} 個月為正）；盤整濾網再修 ${OUT.exp2.verdict}（基準全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆；① 細鄰近 ${OUT.exp2.items.neigh.pass}/${OUT.exp2.items.neigh.n}；② 去掉 ${OUT.exp2.items.exTop2.months.map(x => x[0]).join("、") || "無"} 後 ${OUT.exp2.items.exTop2.ok ? "仍合格" : "不合格"}；③ 聯集 ${OUT.exp2.items.union.ok ? "合格" : "不合格"}；④ 疊加週一 ${OUT.exp2.items.stack.ok ? "合格" : "不合格"}、停損高原 ${OUT.exp2.items.stack.plateau.text}）。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
await fs.writeFile("lab/report31.md", L.join("\n"));
await fs.writeFile("lab/results31.json", JSON.stringify(OUT));
console.log(L.join("\n"));
