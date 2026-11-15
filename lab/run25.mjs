// 策略實驗室 第二十五輪（11/15 會議決議）
// 實驗一（出場研究員，出場改良名額）：C6 衍生「波段A 進場＋Donchian 中點移動停損出場」。定義（照 queue 原文）：進場、濾網完全照波段A（4h 突破 55 根新高＋4h EMA200 之上＋BTC 日線>EMA50＋20 日漲幅前 10）；出場改成「每根 4h 收盤後取近 55 根最高收盤與最低收盤的中點，停損＝max(前一根停損, 中點) 只上不下，收盤跌破 → 隔根開盤出」；初始停損＝2ATR 與進場時中點取較近者；原本＝波段A（進場相同、只改出場）。審查：回看 44／66 根、中點位置 40%／60%（1 基準＋4 鄰近）。另列：保留「跌破 27 根低」兩者先到先出、套用波段B（1R 先平 1/3 後剩餘用中點停損）、停損 ×0.5／0.75／1.25／1.5 高原、成本 ×1.5／×2、按月、出場原因、平均持有根數。
// 實驗二（CEO 網上研究 11/09）：C7 高點動能週頻多空（Fičura 2023，布拉格經濟大學 FFA WP 5:003）。定義（照 queue 原文）：每週五 UTC 收盤算 log(Close／過去 7 日最高 High)，list19 排序，做多前 8（最接近高點）、放空後 8，等權、每週換倉（週六 00:00 UTC 開盤進、下週六 00:00 開盤出）；停損無（1R 以進場前一日 2×日ATR14 換算，只為計 R）；變體：單幣 −15% 週停損；成本分級＋持有期間資金費率日合計（多付空收）。審查：回看 6／8 日、分組 6／10 幣、持有 6／8 日（1 基準＋6 鄰近）。另列：只多腿、只空腿、空腿加順跌 Sharpe ≤ −1.7（常設變體）、單幣 −15% 停損、成本 ×1.5／×2、損益兩平成本倍數、費率腿／價格腿、分狀態、按月。原本＝波段A（持有 7 天 >48h）。
// 補測（不佔名額，審查表 A 第 3 關）：C6 只慢模型（N≥60）以 5 張上限重算回撤＋資金費率計入。事後挑選，只能「再修」不能合格。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K、進場用下一根開盤；成本分級；C7 與補測計入資金費率日合計，實驗一（4h、多日）未計費率另記；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格；空單另加損益兩平成本倍數 <1.5 直接淘汰。沒過就是沒過，不放寬。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、進場用下一根開盤；成本分級；C6 持倉多日未計資金費率（另記：多頭期費率多為正＝多方付，實際會更差一點）、C4 持有 30 分鐘不跨結算；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告；C6 每個 (幣, N) 各算一筆、同幣可同時持多個 N 的倉（最多 90 張）。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格；空單另加損益兩平成本倍數 <1.5 直接淘汰。沒過就是沒過，不放寬。
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
const want = [...LIST19];
const data = {};
for (const base of want) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(base) : await binance15(base); console.log(base, m.length); if (m.length < 35000) continue; data[base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"],["2026-11-06","08:30","NFP"],["2026-11-10","08:30","CPI"]];
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());
const U19 = LIST19.filter(c => data[c]);
console.log("list19 可用", U19.length);

// ===== 濾網（同現行機器人；排行依清單各算一份）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rkCache = new Map();
function top(day, U) { const key = U.key + ":" + day; if (rkCache.has(key)) return rkCache.get(key); const sc = []; for (const cn of U.list) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rkCache.set(key, s); return s; }
const okF = (cn, t, U) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1, U).has(cn);
const UNI19 = { key: "19", list: U19 };

// ===== 市場狀態（第十二輪定義）、趨勢上（日內 D 用）=====
const bA = atr(bD, 14);
const stateMap = new Map(), trendUp = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * 1.03) s = "趨勢上"; else if (b.c < bE[i] * 0.97) s = "趨勢下"; else s = "盤整"; stateMap.set(dk(b.t), s); trendUp.set(dk(b.t), !(r5 <= -0.08 || ap >= 0.045) && b.c > bE[i] * 1.03); });
const stateAt = t => stateMap.get(dk(t) - 1) || "未知";
const trendBlock = t => trendUp.get(dk(t) - 1) === true;

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m", "d"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const mIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].m.forEach((b, i) => m.set(b.t, i)); mIdx[cn] = m; }

// ===== 重大事件日曆 =====
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

// ===== 交易引擎（六個部門共用；o.costMul 成本倍數、o.stopMul 停損倍數、o.ban(cn,t) 禁多；o.mid={N,lvl,keep27} 中點移動停損出場）=====
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
const bySt = p => Object.entries(p.byState).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const byW = p => Object.entries(p.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、") || "無";
const byC = p => Object.entries(p.byCoin).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${k} ${v.n} 筆／${v.avgR}R`).join("；") || "無";
const verdictNote = (j, v) => { const small = v.IS.n < 30 || v.OOS.n < 30; if (j.pass) return ""; const onlySize = j.why.every(w => /筆數/.test(w)); return small ? (onlySize ? "（筆數不足、數字本身過關：判不了，等樣本）" : "（筆數不足且數字也差）") : "（樣本夠，是真的差）"; };
// 按月：正月數／總月數、最好與最差月、是否靠 1–2 個月撐（最大兩個月合計R 佔總R 比例）
function monthly(p) { const ms = Object.entries(p.byMonth).sort(); if (!ms.length) return { months: 0, pos: 0, text: "無", top2: 0 }; const pos = ms.filter(([, v]) => v.avgR > 0).length; const sums = ms.map(([k, v]) => [k, v.avgR * v.n]); const tot = sums.reduce((a, x) => a + x[1], 0); const top2 = sums.map(x => x[1]).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0); return { months: ms.length, pos, top2: tot > 0 ? +(top2 / tot).toFixed(2) : null, text: ms.map(([k, v]) => `${k.slice(2)} ${v.avgR > 0 ? "+" : ""}${v.avgR}(${v.n})`).join("、") }; }
const costMul = (tr, k) => tr.map(x => ({ ...x, R: x.gross - k * x.costR }));
// ===== 六個部門（原本）=====
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I", name: "日內（≥1 億U）", kind: "intra", q: QI, x: XA, f: { liq: 100 } },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
  { key: "I4", name: "日內D（日內＋BTC 趨勢上不開單）", kind: "intra", q: QI, x: XA, f: { liq: 100, trend: true } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }
// 損益兩平成本倍數：平均 gross ÷ 平均成本R（≥2 代表成本翻倍仍正；<1 代表現在就是負的）
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const bySide = p => Object.entries(p.bySide).map(([k, x]) => `${k} ${x.n} 筆／${x.win}%／${x.avgR}R`).join("；") || "無";


if (process.env.MOCK) for (const cn of coins) for (const k in FO.coins[cn].fr) FO.coins[cn].fr[k] += (cn.charCodeAt(0) % 7) * 0.02 * Math.sin(+k / 3 + cn.length); // MOCK 只為了讓各幣費率排序會變動
// ===== 共用：日序索引、成交額前 20、順跌 Sharpe、事件日 =====
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const top20Cache = new Map();
function top20(day) { if (top20Cache.has(day)) return top20Cache.get(day); const sc = U19.map(cn => [cn, LIQ[cn].get(day) || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]); const s = new Set(sc.slice(0, 20).map(x => x[0])); top20Cache.set(day, s); return s; }
function sharpe30(cn, day) { const i = dIdx[cn].get(day); if (i == null || i < 31) return NaN; const d = data[cn].d, rs = []; for (let j = i - 29; j <= i; j++) rs.push(Math.log(d[j].c / d[j - 1].c)); const mu = rs.reduce((a, x) => a + x, 0) / rs.length, sd = Math.sqrt(rs.reduce((a, x) => a + (x - mu) ** 2, 0) / (rs.length - 1)); return sd > 0 ? mu / sd * Math.sqrt(365) : NaN; }
const EV_DAYS = new Set(EVP.map(e => dk(e.t)));
const dayStart = dk(t0), dayEnd = dk(t1);
const BIG3 = new Set(["BTC", "ETH", "SOL"]);


// ===== 組合（同幣可持多個模型的倉：以 k 去重；最多 maxOpen 張）=====
function portfolioK(ts0, from, to, maxOpen = 90) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {}, byN = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); const key = x.k || x.cn; if (open.length >= maxOpen || open.some(o => (o.k || o.cn) === key)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); acc(byN, x.N != null ? "N" + x.N : "-", x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth), byN: fin(byN) };
}
const segK = (tr, mo = 90) => ({ IS: portfolioK(tr, t0, cut, mo), OOS: portfolioK(tr, cut, Infinity, mo), ALL: portfolioK(tr, t0, Infinity, mo) });
const byNs = p => Object.entries(p.byN || {}).sort((a, b) => +a[0].slice(1) - +b[0].slice(1)).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const topKCache = new Map();
function topK(day, K) { const key = K + ":" + day; if (topKCache.has(key)) return topKCache.get(key); const sc = U19.map(cn => [cn, LIQ[cn].get(day) || 0]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]); const s = new Set(sc.slice(0, K).map(x => x[0])); topKCache.set(key, s); return s; }

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, extra: {} };
const L = ["# 策略實驗室 第二十五輪：波段A 進場＋中點移動停損出場（C6 衍生）＋C7 高點動能週頻多空＋補測 C6 慢模型 5 張重算", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；實驗一最多 5 張（同波段A）、C7 最多 16 張（多 8＋空 8）、補測 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；空單另加「損益兩平成本倍數 <1.5 直接淘汰」。「原本」會前寫死（11/15 會議）：實驗一 進場同波段A、只改出場 → 原本＝波段A；C7 持有 7 天 → 原本＝波段A，參考 波段B。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、進場用下一根開盤（中點停損出場也是隔根開盤）；成本分級；實驗一（4h、多日）未計資金費率（與原本波段A 同一基準，可比）；C7 與補測計入持有期間資金費率日合計（多付空收）；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；兩個實驗各試的組數都寫在下面。", ""];
const avgBars = tr => tr.length ? (tr.reduce((a, x) => a + (x.bars || 0), 0) / tr.length).toFixed(1) : "-";

// ===== 實驗一：波段A 進場＋Donchian 中點移動停損出場 =====
L.push("## 實驗一：波段A 進場＋Donchian 中點移動停損出場（C6 衍生，出場研究員；原本＝波段A）", "",
  "定義：進場、濾網完全照波段A；出場改成「每根 4h 收盤後取近 55 根最高收盤與最低收盤的中點，停損＝max(前一根停損, 中點) 只上不下，收盤跌破 → 隔根開盤出」；初始停損＝2ATR 與進場時中點取較近者（1R＝進場價 − 初始停損）；原本的「跌破 27 根低」在基準版拿掉（另列保留版）。審查：回看 44／66 根、中點位置 40%／60%（1 基準＋4 鄰近）。另列：保留 27 根低（先到先出）、套用波段B（1R 先平 1/3 後剩餘用中點停損）、停損 ×0.5／0.75／1.25／1.5 高原、成本 ×1.5／×2。", "");
{
  const SA = DEPTS[0], SB = DEPTS[1], base = BASE.A; const PM = { N: 55, lvl: 0.5 };
  const rawM = runRaw(SA, UNI19, { mid: PM }), v = seg(rawM), j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, plateau: {}, avgBars: avgBars(rawM), baseAvgBars: avgBars(RAW.A) };
  let np = 0, nn = 0;
  L.push("### 基準（回看 55 根、中點 50%、不保留 27 根低）", "", `全期 ${v.ALL.n} 筆；平均持有 ${o.avgBars} 根 4h（原本波段A ${o.baseAvgBars} 根）`, "", ...HDR, row("原本 波段A（判定用）", base), row("中點停損版" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["回看 44 根", { N: 44, lvl: 0.5 }], ["回看 66 根", { N: 66, lvl: 0.5 }], ["中點位置 40%", { N: 55, lvl: 0.4 }], ["中點位置 60%", { N: 55, lvl: 0.6 }]]) { const vv = seg(runRaw(SA, UNI19, { mid: p })), nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); console.log("實驗一", nm, elapsed()); }
  const rawK = runRaw(SA, UNI19, { mid: { ...PM, keep27: true } }), vK = seg(rawK), jK = judge(base, vK); o.extra["保留 27 根低（先到先出）"] = { res: vK, judge: jK, avgBars: avgBars(rawK) }; L.push(row("　另列：保留 27 根低（先到先出）" + (jK.pass ? " ✅" : " ❌"), vK));
  const rawB = runRaw(SB, UNI19, { mid: PM }), vB = seg(rawB), jB = judge(BASE.B, vB); o.extra["套用波段B（原本＝波段B）"] = { res: vB, judge: jB, avgBars: avgBars(rawB) }; L.push(row("參考 原本 波段B", BASE.B), row("　另列：波段B＋中點停損（對波段B 判定）" + (jB.pass ? " ✅" : " ❌"), vB));
  for (const k of [0.5, 0.75, 1.25, 1.5]) { const vv = seg(runRaw(SA, UNI19, { mid: PM, stopMul: k })); o.plateau["停損 ×" + k] = vv; L.push(row(`　高原：初始停損 ×${k}`, vv)); }
  for (const k of [1.5, 2]) { const vv = seg(costMul(rawM, k)); o.extra["成本 ×" + k] = { res: vv, judge: judge(base, vv) }; L.push(row(`　另列：成本 ×${k}`, vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL); o.baseMonth = monthly(base.ALL); o.be = breakEven(rawM);
  const plateauPos = Object.values(o.plateau).filter(x => x.ALL.avgR > 0).length;
  L.push("", `原本 波段A 出場原因（全期）：${byW(base.ALL)}；按月：${o.baseMonth.text}`, "", `中點停損版 出場原因（全期）：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；損益兩平成本倍數 ${o.be}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}；停損高原：4 組中 ${plateauPos} 組全期平均R 為正`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；波段B 版：${J(jB)}`, "");
  OUT.exp1 = o; console.log("實驗一完成", elapsed());
}

// ===== 共用：費率日合計（持有 d0～d1 日，含 d0、不含 d1）=====
const fundSum = (cn, d0, d1) => { let s = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) s += f; } return s; };

// ===== 實驗二：C7 高點動能週頻多空 =====
L.push("## 實驗二：C7 高點動能週頻多空（CEO 網上研究 11/09，Fičura 2023；原本＝波段A）", "",
  "定義：每週五 UTC 日K 收盤算 log(Close／過去 7 日最高 High)（含當日），list19 中前一日 30 日日均成交額 ≥1 億U 且有費率資料的幣排序：做多最接近高點前 8、放空最遠後 8（可排序 <16 檔就各取 1/4）；週六 00:00 UTC 開盤進場、下週六 00:00 開盤出場（持有 7 天）；無停損（1R＝進場前一日 2×日ATR14 只為計 R）；費率日合計計入（多付空收）；成本分級。審查：回看 6／8 日、分組 6／10 幣、持有 6／8 日（1 基準＋6 鄰近）。另列：只多腿、只空腿、空腿加順跌 Sharpe ≤ −1.7、單幣 −15% 停損、成本 ×1.5／×2、損益兩平成本倍數。", "");
function c7(p) {
  const out = []; const look = p.look || 7, K = p.K || 8, hold = p.hold || 7;
  const isFri = d => new Date(d * D1).getUTCDay() === 5;
  for (let d = dayStart; d <= dayEnd - hold - 1; d++) {
    if (!isFri(d)) continue;
    const cand = [];
    for (const cn of U19) { const i = dIdx[cn].get(d); if (i == null || i < 31) continue; const dd = data[cn].d; if (i + hold + 1 >= dd.length) continue; const liq = LIQ[cn].get(d - 1); if (!(liq >= 100e6)) continue; if (isNaN(frAt(cn, d))) continue; let hi = -Infinity; for (let j = i - look + 1; j <= i; j++) hi = Math.max(hi, dd[j].h); if (!(hi > 0)) continue; const a = pre[cn].d.a[i]; if (!(a > 0)) continue; cand.push([cn, Math.log(dd[i].c / hi), i, a]); }
    if (cand.length < 4) continue;
    cand.sort((a, b) => b[1] - a[1]);
    const k = Math.min(K, Math.floor(cand.length / 4));
    const picks = []; for (let j = 0; j < k; j++) { if (!p.onlyShort) picks.push([...cand[j], "多"]); } for (let j = cand.length - k; j < cand.length; j++) { if (!p.onlyLong) picks.push([...cand[j], "空"]); }
    for (const [cn, , i, a, side] of picks) {
      if (side === "空" && p.sh != null) { const s = sharpe30(cn, d); if (!(s <= p.sh)) continue; }
      const dd = data[cn].d, sgn = side === "多" ? 1 : -1, e = dd[i + 1].o, r = 2 * a; if (!(r > 0) || r / e < 0.002) continue;
      let ex = dd[i + 1 + hold].o, tx = dd[i + 1 + hold].t, why = "換倉", lastD = i + 1 + hold;
      if (p.stopPct) { const st = e * (1 - sgn * p.stopPct); for (let j = i + 1; j <= i + hold; j++) { const b = dd[j]; if (sgn > 0 ? b.l <= st : b.h >= st) { ex = sgn > 0 ? Math.min(b.o, st) : Math.max(b.o, st); tx = b.t + D1; why = "週停損"; lastD = j + 1; break; } } }
      const legP = sgn * (ex - e) / r, legF = -sgn * fundSum(cn, dk(dd[i + 1].t), dk(dd[lastD - 1].t) + 1) / 100 * e / r, costR = tieredCost(cn, dd[i + 1].t) * (p.costK || 1) * e / r;
      out.push({ cn, k: cn + side, t: dd[i + 1].t, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side, state: stateAt(dd[i + 1].t) });
    }
  }
  return { res: segK(out, 16), raw: out };
}
{
  const base = BASE.A; const P7 = { look: 7, K: 8, hold: 7 };
  const r = c7(P7), v = r.res, j = judge(base, v); const be = breakEven(r.raw);
  const legs = x => `（費率腿 ${x.ALL.legF ?? "-"}R、價格腿 ${x.ALL.legP ?? "-"}R／筆）`;
  const o = { base, res: v, judge: j, judgeAlt: judge(BASE.B, v), neigh: {}, extra: {}, be }; let np = 0, nn = 0;
  L.push("### C7 基準（回看 7 日、多 8 空 8、持有 7 天）", "", `全期 ${v.ALL.n} 筆；損益兩平成本倍數 ${be}${be != null && be < 1.5 ? "（<1.5：含空單腿，依常設條款邊太薄）" : ""}`, "", ...HDR, row("原本 波段A（判定用）", base), row("參考 波段B", BASE.B), row("C7 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["回看 6 日", { ...P7, look: 6 }], ["回看 8 日", { ...P7, look: 8 }], ["分組 6 幣", { ...P7, K: 6 }], ["分組 10 幣", { ...P7, K: 10 }], ["持有 6 日", { ...P7, hold: 6 }], ["持有 8 日", { ...P7, hold: 8 }]]) { const vv = c7(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); console.log("C7", nm, elapsed()); }
  for (const [nm, p] of [["只多腿（最接近高點前 8）", { ...P7, onlyLong: true }], ["只空腿（最遠後 8）", { ...P7, onlyShort: true }], ["只空腿＋順跌 Sharpe ≤ −1.7", { ...P7, onlyShort: true, sh: -1.7 }], ["單幣 −15% 週停損", { ...P7, stopPct: 0.15 }], ["成本 ×1.5", { ...P7, costK: 1.5 }], ["成本 ×2", { ...P7, costK: 2 }]]) { const rr = c7(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（損益兩平 ${breakEven(rr.raw)}）`, vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  const gl = r.raw.length ? (r.raw.reduce((a, x) => a + x.legP, 0) / r.raw.length).toFixed(3) : "-", gf = r.raw.length ? (r.raw.reduce((a, x) => a + x.legF, 0) / r.raw.length).toFixed(3) : "-";
  L.push("", `基準 價格腿平均 ${gl}R／筆、費率腿平均 ${gf}R／筆；多空腿：${bySide(v.ALL)}；出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : "**不合格**"}；對波段B：${J(o.judgeAlt)}`, "");
  OUT.exp2 = o; console.log("C7 完成", elapsed());
}

// ===== 補測：C6 只慢模型（N≥60）5 張上限重算＋費率 =====
L.push("## 補測（不佔名額）：C6 只慢模型（N∈{60,90,150,250,360}）以 5 張上限重算回撤＋資金費率計入", "", "run24 的 100% 回撤是 90 張同時持倉的組合層級數字；這裡改成與波段A 相同的 5 張上限（同幣同時只持 1 張、先到先進）、並把持有期間資金費率日合計算進去。警告：「只慢模型」是看完 run24 結果才挑的，屬事後選擇，就算這裡過關也只能列「再修」、不能合格；要用 2026-11 之後的新資料才算樣本外。", "");
function c6slow(p) {
  const out = []; const Ns = p.Ns; const lvl = 0.5; const K = 20;
  for (const cn of U19) {
    const d = data[cn].d, n = d.length;
    for (const N of Ns) {
      let pos = null;
      for (let i = Math.max(60, N + 1); i < n - 1; i++) {
        const b = d[i], day = dk(b.t);
        if (pos) {
          let hi = -Infinity, lo = Infinity; for (let j = i - N + 1; j <= i; j++) { hi = Math.max(hi, d[j].c); lo = Math.min(lo, d[j].c); }
          pos.st = Math.max(pos.st, lo + lvl * (hi - lo));
          if (b.c < pos.st) { const ex = d[i + 1].o, legP = (ex - pos.e) / pos.r, legF = -fundSum(cn, dk(pos.t), dk(d[i + 1].t)) / 100 * pos.e / pos.r, costR = pos.cost * pos.e / pos.r * (p.costK || 1); out.push({ cn, k: p.perN ? cn + "·" + N : cn, N, t: pos.t, tx: d[i + 1].t, R: legP + (p.noFund ? 0 : legF) - costR, gross: legP + (p.noFund ? 0 : legF), legP, legF, costR, why: "跌破中點停損", side: "多", state: pos.state, days: i + 1 - pos.i }); pos = null; }
          continue;
        }
        if (!topK(day, K).has(cn)) continue;
        let hi = -Infinity, lo = Infinity; for (let j = i - N; j < i; j++) { hi = Math.max(hi, d[j].c); lo = Math.min(lo, d[j].c); }
        if (!(b.c > hi)) continue;
        if (p.btcFilter && btcUp.get(day) !== true) continue;
        const e = d[i + 1].o; const hi2 = Math.max(hi, b.c), lo2 = Math.min(lo, b.c); const st = lo2 + lvl * (hi2 - lo2); const r = e - st;
        if (!(r > 0) || r / e < 0.002 || r / e > 0.5) continue;
        pos = { e, r, st, t: d[i + 1].t, i: i + 1, cost: tieredCost(cn, d[i + 1].t), state: stateAt(d[i + 1].t) };
      }
      if (pos) { const last = d[n - 1], legP = (last.c - pos.e) / pos.r, legF = -fundSum(cn, dk(pos.t), dk(last.t) + 1) / 100 * pos.e / pos.r, costR = pos.cost * pos.e / pos.r * (p.costK || 1); out.push({ cn, k: p.perN ? cn + "·" + N : cn, N, t: pos.t, tx: last.t + D1, R: legP + (p.noFund ? 0 : legF) - costR, gross: legP + (p.noFund ? 0 : legF), legP, legF, costR, why: "資料結束", side: "多", state: pos.state, days: n - pos.i }); }
    }
  }
  return { res: segK(out, p.maxOpen || 5), raw: out };
}
{
  const base = BASE.A; const PS = { Ns: [60, 90, 150, 250, 360], maxOpen: 5 };
  const r = c6slow(PS), v = r.res, j = judge(base, v);
  const o = { base, res: v, judge: j, extra: {}, be: breakEven(r.raw) };
  L.push(...HDR, row("原本 波段A（判定用）", base), row("C6 慢模型 5 張＋費率" + (j.pass ? " ✅（事後挑選：只算再修）" : " ❌"), v));
  for (const [nm, p] of [["5 張、不計費率（對照 run24 口徑）", { ...PS, noFund: true }], ["5 張＋費率＋BTC<EMA50 不開", { ...PS, btcFilter: true }], ["90 張（run24 口徑）＋費率", { ...PS, maxOpen: 90, perN: true }], ["成本 ×1.5", { ...PS, costK: 1.5 }], ["成本 ×2", { ...PS, costK: 2 }]]) { const rr = c6slow(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（損益兩平 ${breakEven(rr.raw)}）`, vv)); console.log("補測", nm, elapsed()); }
  o.month = monthly(v.ALL); const gf = r.raw.length ? (r.raw.reduce((a, x) => a + x.legF, 0) / r.raw.length).toFixed(3) : "-";
  L.push("", `費率腿平均 ${gf}R／筆；出場原因：${byW(v.ALL)}；分模型：${byNs(v.ALL)}；分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`補測結論：${J(j)}（事後挑選，最高只能「再修」；回撤 ${v.IS.dd}%／${v.OOS.dd}% vs 波段A ${base.IS.dd}%／${base.OOS.dd}%）`, "");
  OUT.extra.c6slow = o; console.log("補測完成", elapsed());
}
{
  const ok = [OUT.exp1.ok ? "波段A＋中點移動停損出場" : null, OUT.exp2.ok ? "C7 高點動能週頻多空" : null].filter(Boolean);
  L.push(`結論：${ok.length ? `合格：${ok.join("、")}（以新增一組虛擬單並列上線，不動既有組）` : `實驗一${OUT.exp1.note || ""}、C7${OUT.exp2.note || ""}，都不合格或判不了`}。補測 C6 慢模型只能列再修。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report25.md", L.join("\n"));
await fs.writeFile("lab/results25.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
