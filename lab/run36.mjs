// 策略實驗室 第三十六輪（11/26 會議決議）
// 名額①（CEO 網上研究 11/20，C18-B，Lee & Wang 2024 JFQA〈Variance Decomposition and Cryptocurrency Return Prediction〉）：低變異多＋空 BTC 等額（週頻橫截面、市場中性）。定義（照 queue 原文）：Binance USDT 永續 list19 15 分K；每週一 00:00 UTC 換倉；排除上市不足 60 天、前一日 30 日均成交額 <1 億U、無費率資料者；TV_i＝過去 28 天 15 分對數報酬平方和（只用週日 23:45 以前已收盤的 K）；B 版：多 TV 最低三分位等權，每一腿同時空 BTC 等額名目（配對腿）；1R＝該幣 2×日ATR14（週日值）÷ 進場價；單幣週內日線最低 ≤ 進場價 ×0.85 → 當日剔除（幣以 min(開盤,0.85×進場) 出、BTC 腿以當日收盤出）；下週一 00:00 開盤重排，留在同組者不動（不收成本）、離開者出場；成本分級（幣腿）＋BTC 腿 0.14%，進出各半；費率日合計（多付幣費率、空收 BTC 費率）。審查：窗 21／35 天、四分位（1 基準＋3 鄰近）；另列：JV+ 排序（>3σ 正報酬平方和，近似 Lee–Mykland）替代、A 版「多低 TV 空高 TV」對照（山寨空單只當對照不上線）、只多腿不對沖對照、成本 ×1.5／×2、損益兩平、分狀態、按月。原本＝波段A（持有 >48h）。3 個參數。
// 名額②（CEO 網上研究 11/25，C22，Quantpedia〈Are There Seasonal Intraday or Overnight Anomalies in Bitcoin?〉2022／〈The Seasonality of Bitcoin〉2023）：BTC 21:00–23:00 UTC 時段效應。定義（照 queue 原文）：BTCUSDT 永續 1h（由 15 分K 聚合）；每日 21:00 UTC 那根 1h K 開盤做多、23:00 UTC 收盤（＝22:00 那根 1h K 收盤）平倉；停損 1.5×ATR(24,1h)（1R）；可選濾網：30 日實現波動 > 過去一年中位數（以可用歷史的滾動中位數、至少 180 天）；成本：基準用分級成本（BTC 0.14% 來回），另跑 0／0.04／0.08% 來回成本階梯（成本關卡是第一道死線）；鄰近：進場 20／22 UTC、持有 1／3 小時、波動門檻 40／60 百分位（1 基準＋6 鄰近）；另列：ETH 與前 10 大成交額幣對照、分狀態、按月、每小時格（0–23 UTC 同持有 2 小時）看是不是只有 21–23 這格賺。原本＝日內（≥1 億U）。3 個參數。不過成本就降級為劇本型態候選。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K、已結算費率；進場用下一根開盤；成本分級、費率日合計；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告；兩題分狀態、按月列出。C18-B 的 BTC 空腿是對沖腿（非山寨空單）；C22 每小時格表是事後切片、只當探勘證據，不當作題目。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格；含空單腿者「損益兩平成本倍數 <1.5 直接淘汰」。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。

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
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I", name: "日內（≥1 億U）", kind: "intra", q: QI, x: XA, f: { liq: 100 } },
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


const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第三十六輪：C18-B 低變異多＋空 BTC 等額（週頻橫截面、市場中性）＋C22 BTC 21:00–23:00 UTC 時段效應", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月（聚合成 1h／日K 使用）；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每腿／每筆風險 1%；C18-B 最多 16 腿（原本波段A 5 張）、C22 單幣 1 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；含空單腿「損益兩平成本倍數 <1.5 直接淘汰」。「原本」會前寫死（11/26 會議）：C18-B 對波段A（持有 >48h）、C22 對日內（≥1 億U）。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差）；指標只用已收盤 K、已結算費率；進場用下一根開盤；成本分級；兩題都計入持有期間資金費率（多付空收）；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在下面。C18-B 的 BTC 空腿是對沖腿；A 版山寨空腿只當對照；C22 每小時格表是事後切片、只當探勘證據。", ""];
const isMon = d => new Date(d * D1).getUTCDay() === 1;

// ===== 名額①：C18-B 低變異多＋空 BTC 等額 =====
L.push("## 名額①：C18-B 低變異多＋空 BTC 等額（CEO 網上研究 11/20，Lee & Wang 2024 JFQA；週頻橫截面、市場中性；原本＝波段A）", "",
  "定義：每週一 00:00 UTC 換倉；候選＝list19 中上市 ≥60 天、前一日 30 日均成交額 ≥1 億U、有費率者；TV＝過去 28 天 15 分對數報酬平方和（週日 23:45 以前已收盤 K）；多 TV 最低三分位等權，每腿配對一條空 BTC 等額名目；1R＝該幣 2×日ATR14÷進場價；單幣週內日線最低 ≤ 進場 ×0.85 → 當日剔除；下週一重排，留在同組者不動（不收成本）、離開者出場；成本＝幣腿分級＋BTC 腿 0.14%，進出各半；費率日合計（付幣費率、收 BTC 費率）。審查：窗 21／35 天、四分位（1 基準＋3 鄰近）。另列：JV+ 排序替代、A 版多低空高對照、只多腿不對沖對照、成本 ×1.5／×2、損益兩平、分狀態、按月。", "");
// 15 分K 索引：每幣 Map(t→i)；週日 24:00 UTC（＝週一 00:00）之前 win 天的 15 分對數報酬
const tvCache = new Map();
function tvOf(cn, monT, win, mode) {
  const key = cn + ":" + monT + ":" + win + ":" + mode; if (tvCache.has(key)) return tvCache.get(key);
  const m = data[cn].m, idx = mIdx[cn]; let iEnd = idx.get(monT - M15); if (iEnd == null) { // 找最近的
    let lo = 0, hi = m.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (m[mid].t < monT) lo = mid; else hi = mid - 1; } iEnd = lo; if (m[iEnd].t >= monT) { tvCache.set(key, NaN); return NaN; } }
  const need = win * 96, i0 = iEnd - need + 1; if (i0 < 1) { tvCache.set(key, NaN); return NaN; }
  if (m[iEnd].t - m[i0].t < (need - 1) * M15 * 0.9) { tvCache.set(key, NaN); return NaN; }
  const rs = new Array(need); let s = 0, s2 = 0;
  for (let j = 0; j < need; j++) { const r = Math.log(m[i0 + j].c / m[i0 + j - 1].c); rs[j] = r; s += r; s2 += r * r; }
  let v;
  if (mode === "jv") { const mu = s / need, sd = Math.sqrt(Math.max(s2 / need - mu * mu, 0)); v = 0; for (const r of rs) if (r > 3 * sd) v += r * r; }
  else v = s2;
  tvCache.set(key, v); return v;
}
function c18(p) {
  const win = p.win ?? 28, q = p.q ?? 3, mode = p.mode || "tv", costK = p.costK || 1, out = [];
  let members = new Map(); // cn → {e, r, eb, i(日線 idx), t}
  const bIdx = dIdx.BTC, bd = data.BTC.d;
  for (let d = dayStart; d <= dayEnd - 8; d++) {
    const mon = d + 1; if (!isMon(mon)) continue; const monT = mon * D1;
    const bi = bIdx.get(mon); if (bi == null) continue;
    const cand = [];
    for (const cn of U19) { if (cn === "BTC" && p.pair !== "none") continue; const i = dIdx[cn].get(mon); if (i == null || i < 61) continue; const dd = data[cn].d; if (i + 7 >= dd.length) continue; const liq = LIQ[cn].get(d); if (!(liq >= 100e6)) continue; if (isNaN(frAt(cn, d))) continue; const a = pre[cn].d.a[i - 1]; if (!(a > 0)) continue; const v = tvOf(cn, monT, win, mode); if (!(v >= 0)) continue; cand.push({ cn, v, i, a }); }
    if (cand.length < (process.env.MOCK ? q : q * 2)) continue;
    cand.sort((x, y) => x.v - y.v);
    const k = Math.floor(cand.length / q);
    const longs = cand.slice(0, k), shorts = p.pair === "alts" ? cand.slice(cand.length - k) : [];
    const want = new Map(); for (const c of longs) want.set(c.cn, { c, sgn: 1 }); for (const c of shorts) want.set(c.cn, { c, sgn: -1 });
    // 進場／續抱：本週腿
    const legsW = [];
    for (const [cn, { c, sgn }] of want) {
      const dd = data[cn].d, e = dd[c.i].o, r = 2 * c.a / e; if (!(r > 0.002)) continue;
      const prev = members.get(cn);
      const cont = prev && prev.sgn === sgn;
      const eb = bd[bi].o; // BTC 腿進場（本週開盤）
      legsW.push({ cn, sgn, i: c.i, e, r, eb, cont, t: dd[c.i].t, open: true, ex: null, exb: null, tx: null, why: "" });
    }
    // 逐日模擬（0..6）：單幣 −15% 剔除
    for (let k2 = 0; k2 < 7; k2++) {
      for (const g of legsW) { if (!g.open) continue; const dd = data[g.cn].d, b = dd[g.i + k2]; const bb = bd[bi + k2]; if (!b || !bb) { g.open = false; g.ex = (b || dd.at(-1)).c; g.exb = (bb || bd.at(-1)).c; g.tx = (b || dd.at(-1)).t + D1; g.why = "資料盡頭"; continue; }
        if (g.sgn > 0 ? b.l <= g.e * 0.85 : b.h >= g.e * 1.15) { g.open = false; g.ex = g.sgn > 0 ? Math.min(b.o, g.e * 0.85) : Math.max(b.o, g.e * 1.15); g.exb = bb.c; g.tx = b.t + D1; g.why = "單幣 −15% 剔除"; } }
      if (!legsW.some(g => g.open)) break;
    }
    // 滿週：出場或續抱（下週重排時決定）；先全部以下週一開盤算本週損益
    for (const g of legsW) { if (!g.open) { continue; } const dd = data[g.cn].d, nb = dd[g.i + 7], nbb = bd[bi + 7]; if (!nb || !nbb) { g.open = false; g.ex = dd.at(-1).c; g.exb = bd.at(-1).c; g.tx = dd.at(-1).t + D1; g.why = "資料盡頭"; continue; } g.ex = nb.o; g.exb = nbb.o; g.tx = nb.t; g.why = "滿週換倉"; }
    members = new Map(); for (const g of legsW) if (g.why === "滿週換倉") members.set(g.cn, { sgn: g.sgn });
    for (const g of legsW) {
      const dd = data[g.cn].d;
      const retC = g.sgn * (g.ex / g.e - 1), retB = p.pair === "none" || p.pair === "alts" ? 0 : -(g.exb / g.eb - 1); // 配對腿：多幣空 BTC
      const legP = (retC + retB) / g.r;
      const d0 = dk(dd[g.i].t), d1 = dk(g.tx);
      const fC = -g.sgn * fundSum(g.cn, d0, d1).s / 100, fB = (p.pair === "none" || p.pair === "alts") ? 0 : fundSum("BTC", d0, d1).s / 100;
      const legF = (fC + fB) / g.r;
      const cc = tieredCost(g.cn, dd[g.i].t), cb = (p.pair === "none" || p.pair === "alts") ? 0 : 0.0014;
      const half = (cc + cb) / 2; const costR = ((g.cont ? 0 : half) + (g.why === "滿週換倉" ? 0 : half)) * costK / g.r; // 續抱不收進場成本；換倉續抱者出場成本延後到真的出場那週
      out.push({ cn: g.cn, k: g.cn, t: dd[g.i].t, tx: g.tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why: g.why + (g.cont ? "（續抱）" : ""), side: g.sgn > 0 ? "多" : "空", state: stateAt(dd[g.i].t) });
    }
  }
  // 續抱者最後一週若「滿週換倉」後下週未續抱，出場成本已在下一週以 cont=false… 簡化：下週不在名單者，本週已以「滿週換倉」出場但只收半成本 → 補收：找每個幣連續段的最後一筆加半成本
  const byCn = {}; for (const x of out) (byCn[x.cn] ||= []).push(x);
  for (const cn of Object.keys(byCn)) { const arr = byCn[cn].sort((a, b) => a.t - b.t); for (let j = 0; j < arr.length; j++) { const nx = arr[j + 1]; const contNext = nx && nx.t === arr[j].tx && /續抱/.test(nx.why); if (!contNext && arr[j].why.startsWith("滿週換倉")) { const half = (tieredCost(cn, arr[j].t) + ((p.pair === "none" || p.pair === "alts") ? 0 : 0.0014)) / 2 * costK; const add = half / (2 * pre[cn].d.a[dIdx[cn].get(dk(arr[j].t)) - 1] / data[cn].d[dIdx[cn].get(dk(arr[j].t))].o); arr[j].costR += add; arr[j].R -= add; } } }
  return { res: segK(out, 16), raw: out };
}
{
  const base = BASE.A; const P = { win: 28, q: 3, mode: "tv", pair: "btc" };
  const r = c18(P), v = r.res, j = judge(base, v); const be = breakEven(r.raw);
  const o = { base, res: v, judge: j, judgeAlt: judge(BASE.B, v), neigh: {}, extra: {}, be }; let np = 0, nn = 0;
  L.push("### C18-B 基準（窗 28 天、三分位、TV 排序、多幣＋空 BTC 等額）", "", `全期 ${v.ALL.n} 腿（每腿＝多一幣＋空 BTC 等額）；${legs(r.raw)}；損益兩平成本倍數 ${be}${be != null && be < 1.5 ? "（<1.5：含空單腿，依常設條款邊太薄）" : ""}；出場原因：${byW(v.ALL)}`, "", ...HDR, row("原本 波段A（判定用）", base), row("參考 波段B", BASE.B), row("C18-B 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["窗 21 天", { ...P, win: 21 }], ["窗 35 天", { ...P, win: 35 }], ["四分位", { ...P, q: 4 }]]) { const vv = c18(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); console.log("C18", nm, elapsed()); }
  for (const [nm, p] of [["JV+ 排序替代", { ...P, mode: "jv" }], ["A 版：多低 TV＋空高 TV（山寨空腿，對照不上線）", { ...P, pair: "alts" }], ["只多腿、不對沖（對照）", { ...P, pair: "none" }], ["成本 ×1.5", { ...P, costK: 1.5 }], ["成本 ×2", { ...P, costK: 2 }]]) { const rr = c18(p), vv = rr.res; const b2 = p.costK ? seg(runRaw(DEPTS[0], UNI19, { costMul: p.costK })) : base; const nj = judge(b2, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 腿，損益兩平 ${breakEven(rr.raw)}）`, vv)); if (p.costK) L.push(row(`　　（原本 ×${p.costK}）`, b2)); console.log("C18", nm, elapsed()); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  const alt = o.extra["A 版：多低 TV＋空高 TV（山寨空腿，對照不上線）"].res.ALL;
  L.push("", `基準 分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}；A 版 多空腿：${bySd(alt)}；A 版 分狀態：${bySt(alt)}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}；對波段B：${J(o.judgeAlt)}；A 版山寨空腿只當對照（11/13 決議），不論結果都不上線`, "");
  OUT.exp1 = o; console.log("C18 完成", elapsed());
}

// ===== 名額②：C22 BTC 21:00–23:00 UTC 時段效應 =====
L.push("## 名額②：C22 BTC 21:00–23:00 UTC 時段效應（CEO 網上研究 11/25，Quantpedia 2022／2023；原本＝日內（≥1 億U））", "",
  "定義：BTCUSDT 永續 1h（15 分K 聚合）；每日 21:00 UTC 那根 1h K 開盤做多、23:00 UTC 平倉（持有 2 小時）；停損 1.5×ATR(24,1h)（1R，以前一根 1h 已收盤值算；觸及以 min(開盤,停損) 出）；濾網版：30 日實現波動（日對數報酬標準差）> 過去 365 日滾動中位數（至少 180 天可用才啟用）；成本基準＝分級（BTC 0.14% 來回）＋持有跨 8h 結算點時的費率（21–23 UTC 不跨 00/08/16 結算，費率為 0）；另跑 0／0.04／0.08% 來回成本階梯。鄰近：進場 20／22 UTC、持有 1／3 小時、濾網 40／60 百分位（1 基準＋6 鄰近）。另列：濾網版基準、ETH、前 10 大成交額幣（等權合計）對照、成本 ×1.5／×2、損益兩平、分狀態、按月、每小時格（0–23 UTC 進場、同持有 2 小時）。", "");
const H1IDX = {}; for (const cn of coins) { const h = agg(data[cn].m, H1); const m = new Map(); h.forEach((b, i) => m.set(b.t, i)); H1IDX[cn] = { h, m, a: atr(h, 24) }; }
const VOL30 = {}; // 日報酬 30 日標準差（年化略）與滾動中位數百分位
function volPct(cn, d, pct = 50) {
  const V = VOL30[cn] ||= (() => { const dd = data[cn].d, out = new Map(), rs = []; for (let i = 1; i < dd.length; i++) { rs.push(Math.log(dd[i].c / dd[i - 1].c)); if (rs.length >= 30) { const w = rs.slice(-30), mu = w.reduce((a, x) => a + x, 0) / 30, sd = Math.sqrt(w.reduce((a, x) => a + (x - mu) ** 2, 0) / 29); out.set(dk(dd[i].t), sd); } } return out; })();
  const cur = V.get(d); if (!(cur >= 0)) return null;
  const hist = []; for (let k = 1; k <= 365; k++) { const x = V.get(d - k); if (x >= 0) hist.push(x); } if (hist.length < 180) return null;
  hist.sort((a, b) => a - b); const th = hist[Math.min(hist.length - 1, Math.floor(hist.length * pct / 100))];
  return cur > th;
}
function c22(p) {
  const cn = p.cn || "BTC", hr = p.hr ?? 21, hold = p.hold ?? 2, stopK = p.stop ?? 1.5, costK = p.costK || 1, out = [];
  const { h, a } = H1IDX[cn];
  for (let i = 30; i < h.length - hold; i++) {
    const b = h[i]; if (new Date(b.t).getUTCHours() !== hr) continue;
    if (dk(b.t) * D1 < t0) continue;
    const liq = LIQ[cn].get(dk(b.t) - 1); if (!(liq >= 100e6)) continue;
    if (p.volPct != null) { const ok = volPct(cn, dk(b.t) - 1, p.volPct); if (ok !== true) continue; }
    const e = b.o, r = stopK * a[i - 1]; if (!(r > 0) || r / e < 0.0005) continue; const st = e - r;
    let ex = null, tx = null, why = "";
    for (let k = 0; k < hold; k++) { const bb = h[i + k]; if (bb.l <= st) { ex = Math.min(bb.o, st); tx = bb.t + H1; why = "停損"; break; } }
    if (ex == null) { const bb = h[i + hold - 1]; ex = bb.c; tx = bb.t + H1; why = "時間平倉"; }
    const legP = (ex - e) / r; let legF = 0; for (let k = 0; k < hold; k++) { const hh = new Date(h[i + k].t).getUTCHours(); if (hh === 0 || hh === 8 || hh === 16) { const f = frAt(cn, dk(h[i + k].t)); if (!isNaN(f)) legF -= f / 3 / 100 * e / r; } }
    const cost = p.cost != null ? p.cost : tieredCost(cn, b.t); const costR = cost * costK * e / r;
    out.push({ cn, k: cn, t: b.t, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: "多", state: stateAt(b.t) });
  }
  return { res: segK(out, p.maxOpen || 1), raw: out };
}
{
  const base = BASE.I; const P = { cn: "BTC", hr: 21, hold: 2, stop: 1.5 };
  const r = c22(P), v = r.res, j = judge(base, v); const be = breakEven(r.raw);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, be }; let np = 0, nn = 0;
  L.push("### C22 基準（BTC、21:00 進、持有 2h、停損 1.5×ATR(24,1h)、無濾網、分級成本）", "", `全期 ${v.ALL.n} 筆；${legs(r.raw)}；損益兩平成本倍數 ${be}（毛利 ÷ 成本；<1.5＝成本 ×1.5 轉負）；出場原因：${byW(v.ALL)}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("C22 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["進場 20 UTC", { ...P, hr: 20 }], ["進場 22 UTC", { ...P, hr: 22 }], ["持有 1h", { ...P, hold: 1 }], ["持有 3h", { ...P, hold: 3 }], ["濾網 40 百分位", { ...P, volPct: 40 }], ["濾網 60 百分位", { ...P, volPct: 60 }]]) { const vv = c22(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  const top10 = U19.filter(c => c !== "BTC").map(c => [c, LIQ[c].get(dayEnd - 1) || 0]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
  const top10Raw = top10.flatMap(c => c22({ ...P, cn: c }).raw);
  for (const [nm, rr, b2] of [["濾網版（波動 > 一年中位數）", c22({ ...P, volPct: 50 }), base], ["ETH 對照", c22({ ...P, cn: "ETH" }), base], [`前 10 大成交額幣對照（${top10.join("、")}，最多 10 張）`, { res: segK(top10Raw, 10), raw: top10Raw }, base], ["成本 0（毛利）", c22({ ...P, cost: 0 }), base], ["成本 0.04% 來回", c22({ ...P, cost: 0.0004 }), base], ["成本 0.08% 來回", c22({ ...P, cost: 0.0008 }), base], ["成本 ×1.5", c22({ ...P, costK: 1.5 }), seg(runRaw(DEPTS[2], UNI19, { costMul: 1.5 }))], ["成本 ×2", c22({ ...P, costK: 2 }), seg(runRaw(DEPTS[2], UNI19, { costMul: 2 }))]]) { const vv = rr.res, nj = judge(b2, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); if (/×/.test(nm)) L.push(row(`　　（原本 ${nm}）`, b2)); }
  // 每小時格（事後切片，只當探勘證據）
  const grid = []; for (let hh = 0; hh < 24; hh++) { const vv = c22({ ...P, hr: hh }).res.ALL; grid.push(`${String(hh).padStart(2, "0")}:${vv.avgR > 0 ? "+" : ""}${vv.avgR}(${vv.win}%)`); }
  o.grid = grid;
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`, "", `每小時格（BTC、各時段進場持有 2h、分級成本、全期平均R(勝率)）：${grid.join("、")}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}；不過成本就降級為劇本型態候選（台北 05–07 BTC 多方偏向時段），不上線`, "");
  OUT.exp2 = o; console.log("C22 完成", elapsed());
}
{
  const nm = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";
  L.push(`結論：C18-B 低變異多＋空 BTC ${nm(OUT.exp1)}（全期 ${OUT.exp1.res.ALL.n} 腿、樣本外 ${OUT.exp1.res.OOS.n} 腿、損益兩平 ${OUT.exp1.be}）；C22 BTC 21–23 UTC ${nm(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆、損益兩平 ${OUT.exp2.be}）。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report36.md", L.join("\n"));
await fs.writeFile("lab/results36.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
