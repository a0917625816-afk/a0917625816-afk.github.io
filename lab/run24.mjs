// 策略實驗室 第二十四輪（11/14 會議決議）
// 實驗一：C6 Donchian 多回看期組合（CEO 網上研究 11/08；來源 Zarattini／Pagani／Barbon《Catching Crypto Trends》SSRN 5209907）。定義（照 queue 原文）：日線收盤創 N 日最高收盤即做多（隔日 00:00 UTC 開盤進場），N∈{5,10,20,30,60,90,150,250,360} 九個模型各自獨立一筆、等權；停損＝每日取 max(前一日停損, 該回看期最高與最低收盤中點)只上不下，日線收盤 < 停損 → 隔日開盤出場；1R＝進場價 − 進場時中點停損；宇宙＝list19 中前一日 30 日日均成交額前 20（原文「上市滿 365 天、中位成交額 ≥200 萬」改成「本資料集內已有 ≥60 根日K」，差異寫進偏誤）；只做多。原本＝波段A（會前寫死：持有多日 >48h），參考 波段B。審查：回看期全部 ×0.8／×1.2、停損位置＝區間 40%／60%（中點＝50%）、宇宙前 16／前 24（共 1 基準＋6 鄰近）。另列：只慢模型（N≥60）、只快模型（N≤20）、BTC<EMA50 期間不開（＝套我們的濾網）、附錄鏡像空（收盤創 N 日最低做空、停損中點只下不上）、成本 ×1.5／×2、損益兩平成本倍數、分狀態、按月、分幣。
// 實驗二：C4 BTC 日內時序動能（CEO 網上研究 11/06；來源 Shen／Urquhart／Wang, Financial Review 2022）。定義（照 queue 原文）：美東時間 16:00–16:30 報酬 B（夏令／冬令自動換算），B>0 於 16:30 那根 15 分K 開盤做多、B<0 做空，17:00 那根開盤平倉（持有 30 分鐘）；只做 BTC；原文無停損，1R 以 6×ATR14（15 分K，同日內家族）換算。組合版 A＝前日 17:00 到當日 10:00（美股開盤後 30 分鐘）報酬，A>0 且 B<0 做多、A<0 且 B>0 做空，否則空手。原本＝日內（≥1 億U），參考 日內B。審查：B 視窗 16:00–16:15／16:00–16:45、平倉 16:45／17:15、|B| 門檻 ≥0.1%／≥0.2%（共 1 基準＋6 鄰近）。另列：組合版 A、只多、只空、成本 ×1.5／×2、損益兩平成本倍數、分狀態、按月。
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

// ===== 交易引擎（六個部門共用；o.costMul 成本倍數、o.stopMul 停損倍數、o.ban(cn,t) 禁多）=====
function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } if (f.ev && evBlock(t)) return false; if (f.trend && trendBlock(t)) return false; return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function trades(cn, S, U, o = {}) {
  const kind = S.kind, x = S.x, f = S.f, q = S.q, stopMul = o.stopMul || 1, costMul = o.costMul || 1;
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = (kind === "swing" ? 2 : 6) * stopMul;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = "停損"; }
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
        else if (b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const gross = pos.real + left * (ex - pos.e) / pos.r, costR = pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R: gross - costMul * costR, gross, costR, state: pos.state, why }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t, U)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
    if (o.ak) { const rng = b.h - b.l; if (!(b.c - b.o >= o.ak.body * a[i])) continue; if (!(rng > 0 && (b.c - b.l) / rng >= o.ak.cs)) continue; }
    if (!passF(cn, t, f)) continue;
    if (o.ban && o.ban(cn, t)) continue;
    const e = c[i + 1].o, r = stopK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    pos = { e, r, st: e - r, t, real: 0, took: false, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
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

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第二十四輪：C6 Donchian 多回看期組合＋C4 BTC 日內時序動能", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；C6 最多 90 張（9 模型 × 前 20 幣）、C4 一次 1 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；空單另加「損益兩平成本倍數 <1.5 直接淘汰」。「原本」會前寫死（11/14 會議）：C6 持有多日 → 原本＝波段A，參考 波段B；C4 持有 30 分鐘 → 原本＝日內（≥1 億U），參考 日內B。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、進場用下一根開盤；成本分級；C6 未計資金費率（多日持倉，多頭期費率多為正＝多方付，實際會略差）、C4 不跨結算；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；C6 原文「上市滿 365 天、中位成交額 ≥200 萬美元」改為「資料集內 ≥60 根日K＋前一日 30 日成交額前 20」；C6 每個 (幣, 回看期) 各算一筆；兩個實驗各試的組數都寫在下面。", ""];

// ===== 實驗一：C6 Donchian 多回看期組合 =====
L.push("## 實驗一：C6 Donchian 多回看期組合（CEO 網上研究 11/08；原本＝波段A）", "",
  "定義：日線收盤 > 過去 N 日最高收盤（N∈{5,10,20,30,60,90,150,250,360}，九個模型各自獨立）→ 隔日 00:00 UTC 開盤做多；停損＝每日 max(前一日停損, 近 N 日最高收盤與最低收盤的中點)只上不下；日線收盤 < 停損 → 隔日開盤出場；1R＝進場價 − 進場時停損；宇宙＝前一日 30 日日均成交額前 20（list19）。審查：回看期 ×0.8／×1.2、停損位置 40%／60%、宇宙前 16／24（共 1 基準＋6 鄰近）。另列：只慢（N≥60）、只快（N≤20）、BTC<EMA50 不開（套我們的濾網）、附錄鏡像空、成本 ×1.5／×2、損益兩平成本倍數。", "");
const NS = [5, 10, 20, 30, 60, 90, 150, 250, 360];
function c6(p) {
  const out = []; const Ns = (p.Ns || NS).map(n => Math.max(3, Math.round(n * (p.nMul || 1)))); const lvl = p.lvl == null ? 0.5 : p.lvl; const sgn = p.short ? -1 : 1; const K = p.K || 20;
  for (const cn of U19) {
    const d = data[cn].d, n = d.length;
    for (const N of Ns) {
      let pos = null;
      for (let i = Math.max(60, N + 1); i < n - 1; i++) {
        const b = d[i], day = dk(b.t);
        if (pos) {
          let hi = -Infinity, lo = Infinity; for (let j = i - N + 1; j <= i; j++) { hi = Math.max(hi, d[j].c); lo = Math.min(lo, d[j].c); }
          const mid = sgn > 0 ? lo + lvl * (hi - lo) : hi - lvl * (hi - lo);
          pos.st = sgn > 0 ? Math.max(pos.st, mid) : Math.min(pos.st, mid);
          if (sgn > 0 ? b.c < pos.st : b.c > pos.st) { const ex = d[i + 1].o, gross = sgn * (ex - pos.e) / pos.r, costR = pos.cost * pos.e / pos.r * (p.costK || 1); out.push({ cn, k: cn + "·" + N, N, t: pos.t, tx: d[i + 1].t, R: gross - costR, gross, costR, why: "跌破中點停損", side: sgn > 0 ? "多" : "空", state: pos.state, days: i + 1 - pos.i }); pos = null; }
          continue;
        }
        if (!topK(day, K).has(cn)) continue;
        let hi = -Infinity, lo = Infinity; for (let j = i - N; j < i; j++) { hi = Math.max(hi, d[j].c); lo = Math.min(lo, d[j].c); }
        if (sgn > 0 ? !(b.c > hi) : !(b.c < lo)) continue;
        if (p.btcFilter && btcUp.get(day) !== true) continue;
        const e = d[i + 1].o; const hi2 = Math.max(hi, b.c), lo2 = Math.min(lo, b.c); const st = sgn > 0 ? lo2 + lvl * (hi2 - lo2) : hi2 - lvl * (hi2 - lo2); const r = sgn * (e - st);
        if (!(r > 0) || r / e < 0.002 || r / e > 0.5) continue;
        pos = { e, r, st, t: d[i + 1].t, i: i + 1, cost: tieredCost(cn, d[i + 1].t), state: stateAt(d[i + 1].t) };
      }
      if (pos) { const last = d[n - 1], gross = sgn * (last.c - pos.e) / pos.r, costR = pos.cost * pos.e / pos.r * (p.costK || 1); out.push({ cn, k: cn + "·" + N, N, t: pos.t, tx: last.t + D1, R: gross - costR, gross, costR, why: "資料結束", side: sgn > 0 ? "多" : "空", state: pos.state, days: n - pos.i }); }
    }
  }
  return { res: segK(out), raw: out };
}
{
  const base = BASE.A; const P6 = { nMul: 1, lvl: 0.5, K: 20 };
  const r = c6(P6), v = r.res, j = judge(base, v); const be = breakEven(r.raw);
  const avgDays = r.raw.length ? (r.raw.reduce((a, x) => a + x.days, 0) / r.raw.length).toFixed(1) : "-";
  const o = { base, res: v, judge: j, judgeAlt: judge(BASE.B, v), neigh: {}, extra: {}, be, avgDays }; let np = 0, nn = 0;
  L.push("### C6 基準（九模型、中點停損、前 20 幣）", "", `全期 ${v.ALL.n} 筆；平均持有 ${avgDays} 天；損益兩平成本倍數 ${be}`, "", ...HDR, row("原本 波段A（判定用）", base), row("參考 波段B", BASE.B), row("C6 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["回看期 ×0.8", { ...P6, nMul: 0.8 }], ["回看期 ×1.2", { ...P6, nMul: 1.2 }], ["停損位置 40%", { ...P6, lvl: 0.4 }], ["停損位置 60%", { ...P6, lvl: 0.6 }], ["宇宙前 16", { ...P6, K: 16 }], ["宇宙前 24", { ...P6, K: 24 }]]) { const vv = c6(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); console.log("C6", nm, elapsed()); }
  for (const [nm, p] of [["只慢模型（N≥60）", { ...P6, Ns: [60, 90, 150, 250, 360] }], ["只快模型（N≤20）", { ...P6, Ns: [5, 10, 20] }], ["BTC<EMA50 不開（套我們的濾網）", { ...P6, btcFilter: true }], ["附錄鏡像空（N 日最低收盤做空）", { ...P6, short: true }], ["成本 ×1.5", { ...P6, costK: 1.5 }], ["成本 ×2", { ...P6, costK: 2 }]]) { const rr = c6(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（損益兩平 ${breakEven(rr.raw)}）`, vv)); console.log("C6", nm, elapsed()); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 出場原因（全期）：${byW(v.ALL)}；分模型：${byNs(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  const sh = o.extra["附錄鏡像空（N 日最低收盤做空）"]; L.push(`鏡像空 分狀態：${bySt(sh.res.ALL)}；分模型：${byNs(sh.res.ALL)}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對波段B：${J(o.judgeAlt)}`, "");
  OUT.exp1 = o; console.log("C6 完成", elapsed());
}

// ===== 實驗二：C4 BTC 日內時序動能 =====
L.push("## 實驗二：C4 BTC 日內時序動能（CEO 網上研究 11/06；原本＝日內（≥1 億U））", "",
  "定義：美東 16:00–16:30 報酬 B（夏令／冬令自動換算）；B>0 → 16:30 那根 15 分K 開盤做多、B<0 做空；17:00 那根開盤平倉；只做 BTC；原文無停損，1R＝6×ATR14（15 分K）換算；成本分級（BTC 0.14%）。組合版 A＝前日 17:00 → 當日 10:00 報酬，A>0 且 B<0 做多、A<0 且 B>0 做空。審查：B 視窗 15／45 分、平倉 16:45／17:15、|B| ≥0.1%／0.2%（共 1 基準＋6 鄰近）。另列：組合版 A、只多、只空、成本 ×1.5／×2、損益兩平成本倍數。", "");
function c4(p) {
  const cn = "BTC", m = data[cn].m, ix = mIdx[cn], a = pre[cn].m.a, n = m.length, out = []; let nSig = 0;
  const win = p.win || 30, exitMin = p.exitMin || 60, thr = p.thr || 0;
  for (let d = dayStart + 1; d <= dayEnd; d++) {
    const ds = fmtD(d * D1), t16 = etToUtc(ds, "16:00"); const i0 = ix.get(t16); if (i0 == null) continue;
    const iB = i0 + win / 15 - 1; if (iB >= n) continue; const B = m[iB].c / m[i0].o - 1;
    let dir = B > 0 ? 1 : B < 0 ? -1 : 0; if (Math.abs(B) < thr) dir = 0;
    if (p.combo) { const tA0 = etToUtc(fmtD((d - 1) * D1), "17:00"), tA1 = etToUtc(ds, "10:00"); const ia = ix.get(tA0), ib = ix.get(tA1); if (ia == null || ib == null) continue; const A = m[ib].o / m[ia].o - 1; dir = (A > 0 && B < 0) ? 1 : (A < 0 && B > 0) ? -1 : 0; }
    if (p.onlyLong && dir < 0) dir = 0; if (p.onlyShort && dir > 0) dir = 0;
    if (!dir) continue;
    const ie = ix.get(t16 + win * 6e4); const ixit = ix.get(t16 + exitMin * 6e4); if (ie == null || ixit == null || ixit <= ie) continue;
    nSig++;
    const e = m[ie].o, r = 6 * a[ie - 1]; if (!(r > 0)) continue;
    const ex = m[ixit].o, gross = dir * (ex - e) / r, costR = tieredCost(cn, m[ie].t) * (p.costK || 1) * e / r;
    out.push({ cn, t: m[ie].t, tx: m[ixit].t, R: gross - costR, gross, costR, why: "時間平倉", side: dir > 0 ? "多" : "空", state: stateAt(m[ie].t) });
  }
  return { res: seg(out, 1), raw: out, nSig };
}
{
  const base = BASE.I; const P4 = { win: 30, exitMin: 60, thr: 0 };
  const r = c4(P4), v = r.res, j = judge(base, v); const be = breakEven(r.raw);
  const o = { base, res: v, judge: j, judgeAlt: judge(BASE.I2, v), nSig: r.nSig, neigh: {}, extra: {}, be }; let np = 0, nn = 0;
  L.push("### C4 基準（16:00–16:30 報酬方向、16:30 進、17:00 出）", "", `訊號 ${r.nSig} 次；損益兩平成本倍數 ${be}${be != null && be < 1.5 ? "（<1.5：含空單腿，依常設條款邊太薄）" : ""}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("參考 日內B（≥5 億U）", BASE.I2), row("C4 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["B 視窗 15 分", { ...P4, win: 15 }], ["B 視窗 45 分", { ...P4, win: 45 }], ["平倉 16:45", { ...P4, exitMin: 45 }], ["平倉 17:15", { ...P4, exitMin: 75 }], ["|B| ≥0.1%", { ...P4, thr: 0.001 }], ["|B| ≥0.2%", { ...P4, thr: 0.002 }]]) { const vv = c4(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm, p] of [["組合版 A（隔夜×開盤半小時）", { ...P4, combo: true }], ["只多", { ...P4, onlyLong: true }], ["只空", { ...P4, onlyShort: true }], ["成本 ×1.5", { ...P4, costK: 1.5 }], ["成本 ×2", { ...P4, costK: 2 }]]) { const rr = c4(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, nSig: rr.nSig, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（損益兩平 ${breakEven(rr.raw)}）`, vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  const gAvg = r.raw.length ? (r.raw.reduce((a, x) => a + x.gross, 0) / r.raw.length).toFixed(3) : "-", cAvg = r.raw.length ? (r.raw.reduce((a, x) => a + x.costR, 0) / r.raw.length).toFixed(3) : "-";
  L.push("", `基準 毛利平均 ${gAvg}R／筆、成本平均 ${cAvg}R／筆；多空腿：${bySide(v.ALL)}；分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對日內B：${J(o.judgeAlt)}`, "");
  OUT.exp2 = o; console.log("C4 完成", elapsed());
}
{
  const ok = [OUT.exp1.ok ? "C6 Donchian 多回看期" : null, OUT.exp2.ok ? "C4 BTC 日內時序動能" : null].filter(Boolean);
  L.push(`結論：${ok.length ? `合格：${ok.join("、")}（以新增一組虛擬單並列上線，不動既有組）` : `C6${OUT.exp1.note || ""}、C4${OUT.exp2.note || ""}，都不合格或判不了`}。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report24.md", L.join("\n"));
await fs.writeFile("lab/results24.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
