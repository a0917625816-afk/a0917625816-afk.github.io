// 策略實驗室 第二十七輪（11/17 會議決議）
// 實驗一（run26 補測事後發現，C14b）：「週一（UTC）不開新單」濾網，套用於 波段A／波段B／日內（≥1 億U）／日內B（≥5 億U），四個部門各自對自己的原本判定。定義（照 queue 原文）：進場訊號觸發時刻（UTC）落在週一 00:00～23:59 → 不開新單，其餘照各部門原規則；出場不變。審查（鄰近）：窗起點 ±4h（週日 20:00～週一 20:00、週一 04:00～週二 04:00）、窗長 20／29h（1 基準＋4 鄰近）；另列：「週日 10–16 UTC 也不開」疊加版、「只排除週一 00–12 UTC」半天版、成本 ×1.5／×2；按月拆開；分狀態；被拿掉的「週一桶」按月拆開看是不是靠 1–2 個月撐。
// 偏誤交代：這條是看完 run26 分桶才想到的（同一份資料）＝事後假設；就算全部過關，第一次上線也只能「新增虛擬單並列、標註事後假設」，要用 2026-11 之後的新資料看樣本外。1 個參數（星期）＋窗起點 1 個 → 快篩過。
// 實驗二（CEO 網上研究 11/09，C2，低優先只做一次快速否證）：橫截面動能 CSMOM(14,7)。定義（照 queue 原文）：每 7 天以過去 14 日報酬排序 list19 中有資料的幣，做多前 20%、做空後 20%，等權，持有 7 天；成本分級＋持有期間費率日合計（多付空收）；無停損（1R＝進場前一日 2×日ATR14 只為計 R）。審查：排序 11／17 日、持有 6／8 日、分組 15／25%（1 基準＋6 鄰近）；另列：排序 14／持有 14 日每 14 日換倉（Dobrynskaya 變體）、只多腿、只空腿、空腿加順跌 Sharpe ≤ −1.7（常設變體）、成本 ×1.5／×2、損益兩平成本倍數、C3 CTREND 簡化版（7 條 SMA 比率橫截面平均排名）。原本＝波段A（持有 7 天 >48h）。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K／已結算費率、進場用下一根開盤；成本分級；C2 計入持有期間資金費率日合計；實驗一與原本同口徑（未計費率，可比）；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告。
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
// ===== 四個部門（原本）=====

const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I", name: "日內（≥1 億U）", kind: "intra", q: QI, x: XA, f: { liq: 100 } },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
if (process.env.MOCK) for (const cn of coins) for (const k in FO.coins[cn].fr) FO.coins[cn].fr[k] = +(FO.coins[cn].fr[k] * 0.3 + (cn.charCodeAt(0) % 5) * 0.01 * Math.sin(+k / 9)).toFixed(4);
const BIG3 = new Set(["BTC", "ETH", "SOL"]);
const legs = tr => tr.length ? `價格腿 ${(tr.reduce((a, x) => a + (x.legP || 0), 0) / tr.length).toFixed(3)}R、費率腿 ${(tr.reduce((a, x) => a + (x.legF || 0), 0) / tr.length).toFixed(3)}R／筆` : "—";

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, extra: {} };
const L = ["# 策略實驗室 第二十七輪：C14b 週一（UTC）不開新單濾網（波段A／B／日內／日內B）＋C2 橫截面動能 CSMOM(14,7) 快速否證", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；實驗一最多 5 張（同各部門）、C2 最多 16 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；空單另加「損益兩平成本倍數 <1.5 直接淘汰」。「原本」會前寫死（11/17 會議）：C14b 各部門對自己（波段A 對波段A、波段B 對波段B、日內 對日內、日內B 對日內B）；C2 持有 7 天 → 原本＝波段A。樣本外 <30 筆＝判不了（不能上線、也不能說它差）。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、已結算費率；進場用下一根開盤；成本分級；C2 計入持有期間資金費率日合計（多付空收）；實驗一與原本同口徑（都未計費率，可比）；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；兩個實驗各試的組數都寫在下面。**C14b 是看完 run26 分桶後才想到的事後假設（同一份資料）**：就算全部過關，第一次上線也只能「新增虛擬單並列、標註事後假設」，要用 2026-11 之後的新資料看樣本外。", ""];

// ===== 實驗一：C14b 週一（UTC）不開新單 =====
L.push("## 實驗一：C14b 週一（UTC）不開新單濾網（run26 補測事後發現；四個部門各對自己的原本判定）", "",
  "定義：進場 K 線（下一根開盤那根）的時刻（UTC）落在「週一 00:00 起 24 小時」內 → 不開新單；其餘進出場規則一律不變。審查（鄰近）：窗起點 −4h（週日 20:00～週一 20:00）、+4h（週一 04:00～週二 04:00）、窗長 20h（週一 00:00～20:00）、29h（週日 22:00～週二 03:00）（1 基準＋4 鄰近）。另列：疊加「週日 10–16 UTC 也不開」、「只排除週一 00–12 UTC」半天版、成本 ×1.5／×2。", "");
const MON0 = Date.UTC(2024, 0, 1); // 2024-01-01 是週一 00:00 UTC
const wk = t => (((t - MON0) % (7 * D1)) + 7 * D1) % (7 * D1);
const banWin = (startH, lenH) => (cn, t) => { const w = wk(t); const s = ((startH * H1) % (7 * D1) + 7 * D1) % (7 * D1), e = s + lenH * H1; return e <= 7 * D1 ? (w >= s && w < e) : (w >= s || w < e - 7 * D1); };
const banSun = (cn, t) => { const w = wk(t); return w >= 6 * D1 + 10 * H1 && w < 6 * D1 + 16 * H1; };
{
  const VARS = [["基準：週一 00:00 起 24h", { ban: banWin(0, 24) }], ["窗起點 −4h（週日 20:00～週一 20:00）", { ban: banWin(-4, 24) }], ["窗起點 +4h（週一 04:00～週二 04:00）", { ban: banWin(4, 24) }], ["窗長 20h（週一 00:00～20:00）", { ban: banWin(0, 20) }], ["窗長 29h（週日 22:00～週二 03:00）", { ban: banWin(-2, 29) }]];
  const EXTRA = [["疊加 週日 10–16 UTC 也不開", { ban: (cn, t) => banWin(0, 24)(cn, t) || banSun(cn, t) }], ["半天版 只排除週一 00–12 UTC", { ban: banWin(0, 12) }], ["成本 ×1.5（原本也 ×1.5）", { ban: banWin(0, 24), costMul: 1.5 }], ["成本 ×2（原本也 ×2）", { ban: banWin(0, 24), costMul: 2 }]];
  OUT.exp1 = { depts: {} }; const summary = [];
  for (const S of DEPTS) {
    const base = BASE[S.key]; const o = { base, neigh: {}, extra: {} }; let np = 0, nn = 0;
    L.push(`### ${S.name}`, "", ...HDR, row(`原本 ${S.name}（判定用）`, base));
    for (let k = 0; k < VARS.length; k++) {
      const [nm, opt] = VARS[k]; const tr = runRaw(S, UNI19, opt), v = seg(tr), j = judge(base, v);
      if (k === 0) { o.res = v; o.judge = j; o.raw = tr.length; } else { o.neigh[nm] = { res: v, judge: j }; nn++; if (j.pass) np++; }
      L.push(row((k === 0 ? "C14b " : "　") + nm + (j.pass ? " ✅" : " ❌"), v)); console.log("C14b", S.key, nm, elapsed());
    }
    for (const [nm, opt] of EXTRA) {
      const tr = runRaw(S, UNI19, opt), v = seg(tr); const b2 = opt.costMul ? seg(runRaw(S, UNI19, { costMul: opt.costMul })) : base; const j = judge(b2, v);
      o.extra[nm] = { res: v, base: b2, judge: j }; L.push(row("　另列：" + nm + (j.pass ? " ✅" : " ❌"), v)); if (opt.costMul) L.push(row(`　　（原本 ×${opt.costMul}）`, b2));
    }
    // 被拿掉的「週一桶」本身：按月拆開，看是不是靠 1–2 個月撐出「週一差」
    const monTr = RAW[S.key].filter(x => banWin(0, 24)(x.cn, x.t)); const bm = {}; for (const x of monTr) { const k = new Date(x.t).toISOString().slice(0, 7); const v = bm[k] ||= { n: 0, s: 0 }; v.n++; v.s += x.R; }
    const ms = Object.entries(bm).sort(); const neg = ms.filter(([, v]) => v.s < 0).length; const sums = ms.map(([, v]) => v.s); const tot = sums.reduce((a, x) => a + x, 0); const worst2 = [...sums].sort((a, b) => a - b).slice(0, 2).reduce((a, b) => a + b, 0);
    o.monBucket = { n: monTr.length, avgR: monTr.length ? +(monTr.reduce((a, x) => a + x.R, 0) / monTr.length).toFixed(3) : null, months: ms.length, neg, worst2Share: tot < 0 ? +(worst2 / tot).toFixed(2) : null, text: ms.map(([k, v]) => `${k.slice(2)} ${v.s > 0 ? "+" : ""}${v.s.toFixed(2)}(${v.n})`).join("、") };
    o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = o.judge.pass && o.overfit.ok; o.note = verdictNote(o.judge, o.res); o.month = monthly(o.res.ALL); o.monthBase = monthly(base.ALL);
    L.push("", `週一桶（原始訊號、被拿掉的那些）：${o.monBucket.n} 筆、平均 ${o.monBucket.avgR}R；按月合計R：${o.monBucket.text}；${o.monBucket.months} 個月中 ${o.monBucket.neg} 個月為負${o.monBucket.worst2Share != null ? `、最差兩個月佔週一桶總虧 ${Math.round(o.monBucket.worst2Share * 100)}%` : ""}`);
    L.push(`C14b 分狀態：${bySt(o.res.ALL)}；按月平均R（濾網版）：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正（原本 ${o.monthBase.pos}／${o.monthBase.months}）`);
    L.push(`判定：${J(o.judge)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格（事後假設，上線只能標註並列）**" : (o.res.OOS.n < 30 || o.res.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
    delete o.raw; OUT.exp1.depts[S.key] = o; summary.push(`${S.name} ${o.ok ? "合格" : (o.res.OOS.n < 30 || o.res.IS.n < 30) ? "判不了" : "不合格"}`);
  }
  OUT.exp1.summary = summary; L.push(`實驗一小結：${summary.join("；")}。`, "");
}

// ===== 實驗二：C2 橫截面動能 CSMOM(14,7) 快速否證 =====
L.push("## 實驗二：C2 橫截面動能 CSMOM(14,7)（CEO 網上研究 11/09，Han/Kang/Ryu SSRN 4675565；低優先快速否證；原本＝波段A）", "",
  "定義：每 7 天（以週五 UTC 日K 收盤為排序日）算過去 14 日報酬（Close／14 日前 Close −1），list19 中前一日 30 日日均成交額 ≥1 億U 且有費率資料的幣排序：做多前 20%、放空後 20%（四捨五入、至少 1 檔），等權；週六 00:00 UTC 開盤進場、7 天後 00:00 開盤出場；無停損（1R＝進場前一日 2×日ATR14 只為計 R）；費率日合計計入（多付空收）；成本分級。審查：排序 11／17 日、持有 6／8 日、分組 15／25%（1 基準＋6 鄰近）。另列：排序 14／持有 14 日、每 14 日換倉（Dobrynskaya 變體）、只多腿、只空腿、空腿加順跌 Sharpe ≤ −1.7、成本 ×1.5／×2、C3 CTREND 簡化版（7 條 SMA 比率 Close/SMA(5,10,20,30,50,100,200) 橫截面平均排名）。", "");
function sharpe30(cn, day) { const i = dIdx[cn].get(day); if (i == null || i < 31) return NaN; const d = data[cn].d, rs = []; for (let j = i - 29; j <= i; j++) rs.push(Math.log(d[j].c / d[j - 1].c)); const mu = rs.reduce((a, x) => a + x, 0) / rs.length, sd = Math.sqrt(rs.reduce((a, x) => a + (x - mu) ** 2, 0) / (rs.length - 1)); return sd > 0 ? mu / sd * Math.sqrt(365) : NaN; }
const dayStart = dk(t0), dayEnd = dk(t1);
function portfolioK(ts0, from, to, maxOpen = 16) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0, lf = 0, lp = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); const key = x.k || x.cn; if (open.length >= maxOpen || open.some(o => (o.k || o.cn) === key)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; lf += x.legF || 0; lp += x.legP || 0; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, legF: n ? +(lf / n).toFixed(3) : 0, legP: n ? +(lp / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const segK = (tr, mo = 16) => ({ IS: portfolioK(tr, t0, cut, mo), OOS: portfolioK(tr, cut, Infinity, mo), ALL: portfolioK(tr, t0, Infinity, mo) });
const bySd = p => Object.entries(p.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
function c2(p) {
  const out = []; const look = p.look ?? 14, hold = p.hold ?? 7, frac = p.frac ?? 0.2, every = p.every ?? 7;
  const isFri = d => new Date(d * D1).getUTCDay() === 5;
  let lastRank = -Infinity;
  for (let d = dayStart; d <= dayEnd - hold - 1; d++) {
    if (!isFri(d) || d - lastRank < every) continue;
    const cand = [];
    for (const cn of U19) { const i = dIdx[cn].get(d); if (i == null || i < (p.ctrend ? 210 : 31)) continue; const dd = data[cn].d; if (i + hold + 1 >= dd.length) continue; const liq = LIQ[cn].get(d - 1); if (!(liq >= 100e6)) continue; if (isNaN(frAt(cn, d))) continue; const a = pre[cn].d.a[i]; if (!(a > 0)) continue;
      let score;
      if (p.ctrend) { const c = dd[i].c; const rs = []; for (const n of [5, 10, 20, 30, 50, 100, 200]) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += dd[j].c; rs.push(c / (s / n)); } score = rs; }
      else { const b = dd[i - look]; if (!(b && b.c > 0)) continue; score = dd[i].c / b.c - 1; }
      cand.push({ cn, score, i, a }); }
    if (cand.length < 4) continue;
    lastRank = d;
    if (p.ctrend) { // 7 條比率各自橫截面排名，取平均名次
      const K = 7; const avg = new Array(cand.length).fill(0); for (let r = 0; r < K; r++) { const ord = cand.map((c, idx) => [c.score[r], idx]).sort((a, b) => a[0] - b[0]); ord.forEach(([, idx], rank) => avg[idx] += rank); } cand.forEach((c, idx) => c.score = avg[idx] / K); }
    cand.sort((a, b) => b.score - a.score);
    const k = Math.max(1, Math.round(cand.length * frac));
    const picks = []; for (let j = 0; j < k; j++) if (!p.onlyShort) picks.push([cand[j], "多"]); for (let j = cand.length - k; j < cand.length; j++) if (!p.onlyLong) picks.push([cand[j], "空"]);
    for (const [c, side] of picks) {
      const cn = c.cn, i = c.i; if (side === "空" && p.sh != null) { const s = sharpe30(cn, d); if (!(s <= p.sh)) continue; }
      const dd = data[cn].d, sgn = side === "多" ? 1 : -1, e = dd[i + 1].o, r = 2 * c.a; if (!(r > 0) || r / e < 0.002) continue;
      const ex = dd[i + 1 + hold].o, tx = dd[i + 1 + hold].t;
      const legP = sgn * (ex - e) / r, legF = -sgn * fundSum(cn, dk(dd[i + 1].t), dk(dd[i + hold].t) + 1).s / 100 * e / r, costR = tieredCost(cn, dd[i + 1].t) * (p.costK || 1) * e / r;
      out.push({ cn, k: cn + side, t: dd[i + 1].t, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why: "換倉", side, state: stateAt(dd[i + 1].t) });
    }
  }
  return { res: segK(out, p.maxOpen || 16), raw: out };
}
{
  const base = BASE.A; const P = { look: 14, hold: 7, frac: 0.2, every: 7 };
  const r = c2(P), v = r.res, j = judge(base, v); const be = breakEven(r.raw);
  const o = { base, res: v, judge: j, judgeAlt: judge(BASE.B, v), neigh: {}, extra: {}, be }; let np = 0, nn = 0;
  L.push("### C2 基準（排序 14 日、多前 20%／空後 20%、持有 7 天、每 7 天換倉）", "", `全期 ${v.ALL.n} 筆；${legs(r.raw)}；損益兩平成本倍數 ${be}${be != null && be < 1.5 ? "（<1.5：含空單腿，依常設條款邊太薄）" : ""}`, "", ...HDR, row("原本 波段A（判定用）", base), row("參考 波段B", BASE.B), row("C2 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["排序 11 日", { ...P, look: 11 }], ["排序 17 日", { ...P, look: 17 }], ["持有 6 日", { ...P, hold: 6 }], ["持有 8 日", { ...P, hold: 8 }], ["分組 15%", { ...P, frac: 0.15 }], ["分組 25%", { ...P, frac: 0.25 }]]) { const vv = c2(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); console.log("C2", nm, elapsed()); }
  for (const [nm, p] of [["排序 14／持有 14／每 14 日換倉（Dobrynskaya）", { ...P, hold: 14, every: 14 }], ["只多腿", { ...P, onlyLong: true }], ["只空腿", { ...P, onlyShort: true }], ["只空腿＋順跌 Sharpe ≤ −1.7", { ...P, onlyShort: true, sh: -1.7 }], ["成本 ×1.5", { ...P, costK: 1.5 }], ["成本 ×2", { ...P, costK: 2 }], ["C3 CTREND 簡化版（7 條 SMA 比率平均排名）", { ...P, ctrend: true }]]) { const rr = c2(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); console.log("C2", nm, elapsed()); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 多空腿：${bySd(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}；對波段B：${J(o.judgeAlt)}`, "");
  OUT.exp2 = o; console.log("C2 完成", elapsed());
}
{
  const nm = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";
  L.push(`結論：C14b 週一不開單 → ${OUT.exp1.summary.join("；")}（事後假設：合格也只能新增虛擬單並列、標註事後假設，用 2026-11 之後新資料看樣本外）；C2 CSMOM ${nm(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆）。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report27.md", L.join("\n"));
await fs.writeFile("lab/results27.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
