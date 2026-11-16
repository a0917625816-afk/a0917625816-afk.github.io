// 策略實驗室 第二十六輪（11/16 會議決議）
// 實驗一（CEO 網上研究 11/13，C13）：恐慌期負費率擁擠做多 BTC（快速否證）。定義（照 queue 原文）：每日 00:00 UTC，BTC 費率日合計 30 日 z ≤ −1 且 7 日實現波動 ≥ 過去 365 日第 75 百分位 → 當日開盤做多，隔日 00:00 平倉（續成立則續抱、只算一筆）；停損 2×日ATR14。審查：z −0.8／−1.2、波動分位 60／90%、視窗 24／36 日（1 基準＋6 鄰近）。另列：ETH、BTC／ETH／SOL 三幣、無停損、只持 1 日、成本 ×1.5／×2、費率腿、按月、分狀態。原本＝日內（≥1 億U）。
// 實驗二（觀察員1 11/15，R24）：週末跳空回補多，依 11/15 資料工程師建議擴到 BTC／ETH／SOL 三幣各算一筆。定義（照 queue 原文）：Binance 15 分K，週末報酬＝週日 23:45 UTC 收盤 ÷ 週五 CME 收盤（美東 17:00，冬令 22:00 UTC／夏令 21:00 UTC）−1；≤ −4% 且週五日費率 ≤0 → 週一 00:00 UTC 開盤做多；目標＝回補缺口 50%（週五收盤與週日收盤中點）、停損＝週末最低 −1%、都沒到週一 23:45 UTC 收盤出；進場後 24h 內有 CPI／PPI／FOMC／非農不交易；另列不加／加過濾 B（週二～五 OI 降 ≥8%，OI 只有 2025-05 起）。審查：跌幅 −3.2／−4.8%、目標 40／60%、停損緩衝 0.8／1.2%（1 基準＋6 鄰近）。另列：BTC 只做、成交額 ≥5 億U 全幣池、不看費率、成本 ×1.5／×2。原本＝日內（≥1 億U）（持有 ≤24h）。
// 補測（不佔名額，CEO 網上研究 11/16 Concretum「週一亞洲開盤效應」第一步）：把波段A／波段B／日內的回測成交依「進場星期 × UTC 時段」分桶，看勝率與平均R 有沒有時段差異；有差異才值得寫成濾網回測，沒差異就刪題。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K／已結算費率、進場用下一根（日）開盤；成本分級；兩個實驗都計入持有期間資金費率日合計（多付）；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告。C13 的 365 日波動分位在資料前 12 個月只能用「到目前為止」的分位（註明）。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。樣本外 <30 筆＝判不了（不能上線、也不能說它差）。沒過就是沒過，不放寬。

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
const L = ["# 策略實驗室 第二十六輪：C13 恐慌期負費率擁擠做多 BTC（快速否證）＋R24 週末跳空回補多（BTC／ETH／SOL）＋補測 進場時段分桶", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；兩個實驗都最多 5 張、同幣同時只持 1 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死（11/16 會議）：C13 持有 1 日起、R24 持有 ≤24h → 原本都＝日內（≥1 億U）。樣本外 <30 筆＝判不了（不能上線、也不能說它差）。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、已結算費率；進場用下一根（日）開盤；成本分級；兩個實驗都計入持有期間資金費率日合計（多方付正費率）；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；兩個實驗各試的組數都寫在下面。C13 的「過去 365 日波動分位」在資料前 12 個月只能用「到目前為止（≥120 日）」的分位，已註明。", ""];

// ===== 實驗一：C13 恐慌期負費率擁擠做多 =====
L.push("## 實驗一：C13 恐慌期負費率擁擠做多 BTC（CEO 網上研究 11/13，askrubyai 2026-02-26；原本＝日內（≥1 億U））", "",
  "定義：每日 00:00 UTC，該幣費率日合計的 30 日 z 分數（最新一日 vs 前 30 日均值／標準差）≤ −1，且 7 日實現波動（日對數報酬標準差）≥ 過去 365 日第 75 百分位 → 當日開盤做多；每日收盤重新評估，條件仍成立就續抱（只算一筆），不成立隔日 00:00 開盤平倉；停損＝進場價 − 2×日ATR14（盤中觸及以停損價或開盤價較差者出）。費率日合計計入（多付）。審查：z −0.8／−1.2、波動分位 60／90%、視窗 24／36 日（1 基準＋6 鄰近）。另列：ETH、BTC／ETH／SOL 三幣、無停損、只持 1 日、成本 ×1.5／×2。", "");
function c13(p) {
  const out = []; const Z = p.z ?? -1, PCT = p.pct ?? 0.75, W = p.win ?? 30, U = p.coins || ["BTC"];
  for (const cn of U) {
    if (!data[cn]) continue;
    const d = data[cn].d, A = pre[cn].d.a, n = d.length;
    const vol7 = new Array(n).fill(NaN);
    for (let i = 7; i < n; i++) { const rs = []; for (let j = i - 6; j <= i; j++) rs.push(Math.log(d[j].c / d[j - 1].c)); const mu = rs.reduce((a, x) => a + x, 0) / 7; vol7[i] = Math.sqrt(rs.reduce((a, x) => a + (x - mu) ** 2, 0) / 6); }
    const sig = i => { // 用第 i 日（已收盤）的資料判斷
      const dd = dk(d[i].t), f = frAt(cn, dd); if (isNaN(f)) return false;
      const hist = []; for (let k = 1; k <= W; k++) { const x = frAt(cn, dd - k); if (!isNaN(x)) hist.push(x); } if (hist.length < W * 0.8) return false;
      const mu = hist.reduce((a, x) => a + x, 0) / hist.length, sd = Math.sqrt(hist.reduce((a, x) => a + (x - mu) ** 2, 0) / (hist.length - 1)); if (!(sd > 0)) return false;
      const z = (f - mu) / sd; if (!(z <= Z)) return false;
      const v = vol7[i]; if (isNaN(v)) return false; const past = []; for (let j = Math.max(7, i - 365); j < i; j++) if (!isNaN(vol7[j])) past.push(vol7[j]); if (past.length < 120) return false;
      const rank = past.filter(x => x <= v).length / past.length; return rank >= PCT;
    };
    let pos = null;
    for (let i = 31; i < n - 1; i++) {
      if (pos) {
        const b = d[i]; let ex = null, why = "";
        if (!p.noStop && b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = "停損"; }
        else if (p.oneDay || !sig(i)) { ex = d[i + 1].o; why = p.oneDay ? "持有 1 日" : "訊號消失"; }
        if (ex != null) { const endD = why === "停損" ? dk(b.t) + 1 : dk(d[i + 1].t); const fs_ = fundSum(cn, dk(pos.t), endD); const legP = (ex - pos.e) / pos.r, legF = -fs_.s / 100 * pos.e / pos.r, costR = pos.cost * (p.costK || 1) * pos.e / pos.r; out.push({ cn, t: pos.t, tx: why === "停損" ? b.t + D1 : d[i + 1].t, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: "多", state: pos.state, days: i + 1 - pos.i }); pos = null; }
        continue;
      }
      if (!sig(i)) continue;
      const e = d[i + 1].o, r = 2 * A[i]; if (!(r > 0) || r / e < 0.002) continue;
      pos = { e, r, st: e - r, t: d[i + 1].t, i: i + 1, cost: tieredCost(cn, d[i + 1].t), state: stateAt(d[i + 1].t) };
    }
  }
  return { res: seg(out, 5), raw: out };
}
{
  const base = BASE.I; const P = { z: -1, pct: 0.75, win: 30, coins: ["BTC"] };
  const r = c13(P), v = r.res, j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, be: breakEven(r.raw) }; let np = 0, nn = 0;
  const avgDays = tr => tr.length ? (tr.reduce((a, x) => a + x.days, 0) / tr.length).toFixed(1) : "-";
  L.push("### C13 基準（BTC、z ≤ −1、波動 ≥ 75 分位、視窗 30 日、停損 2×日ATR）", "", `全期 ${v.ALL.n} 筆；平均持有 ${avgDays(r.raw)} 日；${legs(r.raw)}；損益兩平成本倍數 ${o.be}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("參考 波段A", BASE.A), row("C13 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["z ≤ −0.8", { ...P, z: -0.8 }], ["z ≤ −1.2", { ...P, z: -1.2 }], ["波動 ≥ 60 分位", { ...P, pct: 0.6 }], ["波動 ≥ 90 分位", { ...P, pct: 0.9 }], ["視窗 24 日", { ...P, win: 24 }], ["視窗 36 日", { ...P, win: 36 }]]) { const vv = c13(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm, p] of [["ETH 只做", { ...P, coins: ["ETH"] }], ["BTC／ETH／SOL 三幣", { ...P, coins: ["BTC", "ETH", "SOL"] }], ["無停損", { ...P, noStop: true }], ["只持 1 日", { ...P, oneDay: true }], ["成本 ×1.5", { ...P, costK: 1.5 }], ["成本 ×2", { ...P, costK: 2 }]]) { const rr = c13(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); console.log("C13", nm, elapsed()); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
  OUT.exp1 = o; console.log("C13 完成", elapsed());
}

// ===== 實驗二：R24 週末跳空回補多 =====
L.push("## 實驗二：R24 週末跳空回補多（觀察員1 11/15；BTC／ETH／SOL 三幣各算一筆；原本＝日內（≥1 億U））", "",
  "定義：Binance 15 分K。週末報酬＝週日 23:45 UTC 那根收盤 ÷ 週五 CME 收盤（美東 17:00；冬令 22:00 UTC／夏令 21:00 UTC，以 15 分K 收盤價）−1；≤ −4% 且週五費率日合計 ≤0 → 週一 00:00 UTC 開盤做多；目標＝週五收盤與週日收盤的中點（回補缺口 50%）、停損＝週末（週五 CME 收盤起～週一 00:00）最低 −1%；都沒到就在週一 23:45 UTC 那根收盤出；進場後 24h 內有 CPI／PPI／FOMC／非農 → 不交易。費率計週一日合計（多付）。審查：跌幅 −3.2／−4.8%、目標 40／60%、停損緩衝 0.8／1.2%（1 基準＋6 鄰近）。另列：BTC 只做、成交額 ≥5 億U 全幣池、不看費率、加過濾 B（週二～五 OI 降 ≥8%，OI 只有 2025-05 起）、成本 ×1.5／×2。", "");
function r24(p) {
  const out = []; const TH = p.th ?? -0.04, TGT = p.tgt ?? 0.5, BUF = p.buf ?? 0.01;
  const U = p.all ? U19 : [...BIG3].filter(cn => data[cn]); if (p.btcOnly) U.length = 0, U.push("BTC");
  const uniq = [...new Set(U)].filter(cn => data[cn]);
  for (const cn of uniq) {
    const m = data[cn].m, idx = mIdx[cn];
    // 走每個週一 00:00 UTC
    const first = m[0].t, last = m.at(-1).t;
    let mon = Math.ceil(first / D1) * D1; while (new Date(mon).getUTCDay() !== 1) mon += D1;
    for (; mon + D1 <= last; mon += 7 * D1) {
      const fri = mon - 3 * D1; const friStr = new Date(fri).toISOString().slice(0, 10);
      const tCme = etToUtc(friStr, "17:00"); // 週五 CME 收盤（UTC）
      const iF = idx.get(tCme - M15), iS = idx.get(mon - M15), iM = idx.get(mon); if (iF == null || iS == null || iM == null) continue;
      const cF = m[iF].c, cS = m[iS].c, ret = cS / cF - 1; if (!(ret <= TH)) continue;
      if (p.all) { const v = LIQ[cn].get(dk(fri)); if (!(v >= 500e6)) continue; }
      if (!p.noFund) { const f = frAt(cn, dk(fri)); if (isNaN(f) || f > 0) continue; }
      if (p.filterB) { const ch = oiChg(cn, dk(fri), 3); if (isNaN(ch) || ch > -0.08) continue; }
      if (evNear(mon, 0, 24 * H1)) continue;
      let wkLo = Infinity; for (let i = iF + 1; i < iM; i++) wkLo = Math.min(wkLo, m[i].l);
      const e = m[iM].o, st = wkLo * (1 - BUF), tg = cF + (cS - cF) * (1 - TGT), r = e - st; if (!(r > 0) || r / e < 0.002 || tg <= e) continue;
      let ex = null, why = "", tx = 0; const endI = Math.min(idx.get(mon + D1 - M15) ?? (iM + 95), m.length - 1);
      for (let i = iM; i <= endI; i++) { const b = m[i]; if (b.l <= st) { ex = Math.min(b.o, st); why = "停損"; tx = b.t + M15; break; } if (b.h >= tg) { ex = Math.max(b.o, tg); why = "回補 50% 停利"; tx = b.t + M15; break; } }
      if (ex == null) { ex = m[endI].c; why = "週一收盤出"; tx = m[endI].t + M15; }
      const f = frAt(cn, dk(mon)), legP = (ex - e) / r, legF = -(isNaN(f) ? 0 : f) / 100 * e / r, costR = tieredCost(cn, mon) * (p.costK || 1) * e / r;
      out.push({ cn, t: mon, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: "多", state: stateAt(mon), ret: +(ret * 100).toFixed(2) });
    }
  }
  return { res: seg(out, 5), raw: out };
}
{
  const base = BASE.I; const P = { th: -0.04, tgt: 0.5, buf: 0.01 };
  const r = r24(P), v = r.res, j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, be: breakEven(r.raw) }; let np = 0, nn = 0;
  L.push("### R24 基準（BTC／ETH／SOL、週末 ≤ −4%、週五費率 ≤0、目標回補 50%、停損週末低 −1%）", "", `全期 ${v.ALL.n} 筆（三幣各算一筆、最多 5 張）；${legs(r.raw)}；損益兩平成本倍數 ${o.be}；每筆週末跌幅：${r.raw.map(x => `${x.cn} ${fmtD(x.t)} ${x.ret}%→${x.R > 0 ? "+" : ""}${x.R.toFixed(2)}R（${x.why}）`).join("、") || "無"}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("R24 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["跌幅 ≤ −3.2%", { ...P, th: -0.032 }], ["跌幅 ≤ −4.8%", { ...P, th: -0.048 }], ["目標回補 40%", { ...P, tgt: 0.4 }], ["目標回補 60%", { ...P, tgt: 0.6 }], ["停損緩衝 0.8%", { ...P, buf: 0.008 }], ["停損緩衝 1.2%", { ...P, buf: 0.012 }]]) { const vv = r24(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆）`, vv)); }
  for (const [nm, p] of [["BTC 只做（原定義）", { ...P, btcOnly: true }], ["全幣池（週五成交額 ≥5 億U）", { ...P, all: true }], ["不看費率", { ...P, noFund: true }], ["加過濾 B（週二～五 OI 降 ≥8%）", { ...P, filterB: true }], ["成本 ×1.5", { ...P, costK: 1.5 }], ["成本 ×2", { ...P, costK: 2 }]]) { const rr = r24(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); console.log("R24", nm, elapsed()); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 出場原因：${byW(v.ALL)}；分幣：${byC(v.ALL)}；分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
  OUT.exp2 = o; console.log("R24 完成", elapsed());
}

// ===== 補測（不佔名額）：進場時段分桶（CEO 網上研究 11/16，Concretum 週一亞洲開盤效應 第一步）=====
L.push("## 補測（不佔名額）：波段A／波段B／日內 回測成交依「進場星期 × UTC 時段」分桶", "", "用全部原始訊號（不套 5 張上限、不去重，所以筆數比上表多）；看的是「週一 00:00 UTC 起 24h」（Concretum 說集合趨勢模型最賺的窗）vs 其他時段、以及「週日 10–16 UTC」（說最差的窗）vs 其他。只有勝率與平均R 同向、而且差距在樣本內外都出現，才值得寫成濾網回測；否則刪題。", "");
{
  const WD = ["日", "一", "二", "三", "四", "五", "六"];
  const fin = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }]));
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  const fmt = m => Object.entries(m).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；");
  OUT.extra.timeBuckets = {};
  for (const S of DEPTS) {
    const tr = RAW[S.key]; const byWd = {}, byH = {}, win = {}, bad = {}, winIS = {}, winOOS = {};
    for (const x of tr) { const d = new Date(x.t), wd = d.getUTCDay(), h = d.getUTCHours(); acc(byWd, "週" + WD[wd], x.R); acc(byH, `${String(Math.floor(h / 4) * 4).padStart(2, "0")}–${String(Math.floor(h / 4) * 4 + 4).padStart(2, "0")}`, x.R); const inWin = wd === 1; acc(win, inWin ? "週一全日（00:00 UTC 起 24h）" : "其他六天", x.R); acc(x.t < cut ? winIS : winOOS, inWin ? "週一" : "其他", x.R); acc(bad, (wd === 0 && h >= 10 && h < 16) ? "週日 10–16 UTC" : "其他", x.R); }
    const o = { byWd: fin(byWd), byH: fin(byH), win: fin(win), winIS: fin(winIS), winOOS: fin(winOOS), bad: fin(bad) }; OUT.extra.timeBuckets[S.key] = o;
    L.push(`### ${S.name}（原始訊號 ${tr.length} 筆）`, "", `按星期：${fmt(o.byWd)}`, "", `按 UTC 時段：${fmt(o.byH)}`, "", `週一窗 vs 其他：${fmt(o.win)}；樣本內：${fmt(o.winIS)}；樣本外：${fmt(o.winOOS)}`, "", `週日 10–16 UTC vs 其他：${fmt(o.bad)}`, "");
  }
  L.push("補測結論：由 CEO 在會議判讀——「週一窗」勝率與平均R 是否同時高於其他六天、且樣本內外同向；不同向或差距小於 2 個百分點＝刪題，不寫濾網。", "");
}
{
  const nm = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";
  L.push(`結論：C13 ${nm(OUT.exp1)}（全期 ${OUT.exp1.res.ALL.n} 筆、樣本外 ${OUT.exp1.res.OOS.n} 筆）；R24 ${nm(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆）。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差，等樣本；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report26.md", L.join("\n"));
await fs.writeFile("lab/results26.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
