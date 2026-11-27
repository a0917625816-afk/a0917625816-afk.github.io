// 策略實驗室 第三十七輪（11/27 會議決議）
// 名額①（觀察員1 11/13，R21）：亞洲盤急殺→美盤順勢接力空。定義（照 queue 原文）：Binance BTCUSDT 15 分K；UTC 00:00–08:00 區間報酬（07:45 那根收盤 ÷ 00:00 那根開盤 −1）≤ −4% 且該 8 小時成交量 ≥ 同時段 20 日均量 ×2 → UTC 08:00 那根收盤做空（以 08:15 那根開盤成交）；排除進場前 2 小時內有 CPI／FOMC／非農／PPI 的日子；停損＝進場 +2%（1R）；出場＝UTC 21:00 收盤平倉（20:45 那根收盤）或先到停損；不加碼。審查：跌幅 −3.2／−4.8%、量 1.6／2.4、停損 1.6／2.4%、出場 17:00／01:00（次日）（1 基準＋8 鄰近）；同跑反向做多當對照；與 R20 的 D 日重疊率。另列（樣本不夠時的擴充、只當對照）：ETH、前 20 大成交額幣（≥5 億U）同規則；常設：順跌 Sharpe 版、R48 禁空濾網版、成本 ×1.5／×2、損益兩平成本倍數、分狀態、按月。原本＝日內（≥1 億U）。4 個參數。
// 名額②（觀察員2 11/13，R20）：恐慌日死貓反彈空。定義（照 queue 原文）：D 日（UTC 日K）收跌 ≥6%（對前日收）且日 OI ≤ −4%（日末 USDT OI 對前日）且成交量 ≥20 日均量 ×2（不含當日）且 D 日費率日合計 >0（多頭沒認輸）；D 日收盤後 48h 內，15 分K 收盤反彈到 D 日高低區間 50% 回撤位 → 下一根開盤做空；先破 D 日低點則放棄；停損＝D 日區間 75% 回撤位；出場＝D 日最低（停利）或持倉 72h；「D+1 費率轉負不做」只有日資料、含前視，主表不用、另列對照。基準標的＝BTC／ETH；擴充版＝list19 中有 OI 資料且 30 日均成交額 ≥1 億U 者（審查員 11/13 建議，樣本不夠時用）。審查：跌幅 4.8／7.2%、OI −3.2／−4.8%、量 1.6／2.4、回撤 0.4／0.6、停損 0.6／0.9、持有 58／86h（1 基準＋12 鄰近）；對照：同 D 日反向做多。常設：順跌 Sharpe 版、R48 禁空濾網版、成本 ×1.5／×2、損益兩平、分狀態、按月。原本＝日內（≥1 億U）（持有 ≤72h，會前寫死）。6 個參數（審查員：再修警告）。
// 補測（不佔名額）：R48 空單擁擠濾網統計（觀察員2 11/26）：BTC 連續 2 個 UTC 日費率日合計 ≤0（≈6 次結算）且 2 日 OI（USDT）≥ +3% 且 2 日跌幅 ≤5% → 觸發；統計觸發後 24h／72h BTC 報酬分布 vs 全部日子基準；OI 2025-05 起。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K、已結算費率（日合計）；進場用下一根開盤；成本分級（BTC 0.14% 來回）；空單費率腿＝跨 00／08／16 結算點時收（付）當日費率 ÷3；停損用 max(開盤,停損) 保守出、滑價另計；OI 只有 2025-05 起（R20 實際樣本 18 個月）；樣本內 65%／樣本外 35%，參數只在樣本內定、樣本外只看不調；各試組數寫在報告。含空單：損益兩平成本倍數 <1.5 直接淘汰。
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


// ===== 共用：日 ATR、R48 濾網、順跌 Sharpe =====
const dATR = (cn, day) => { const i = dIdx[cn].get(day); return i == null ? NaN : pre[cn].d.a[i]; };
const dClose = (cn, day) => { const i = dIdx[cn].get(day); return i == null ? NaN : data[cn].d[i].c; };
// R48（觀察員2 11/26）：BTC 連續 2 個 UTC 日費率日合計 ≤0 且 2 日 OI ≥ +3% 且 2 日跌幅 ≤5% → 當日收盤後觸發；之後 72h（3 個 UTC 日）或遇到費率日合計 >0 的日子結束後解除
const R48 = new Set(), R48trig = [];
{ const d = data.BTC.d; for (let i = 2; i < d.length; i++) { const day = dk(d[i].t); const f0 = frAt("BTC", day), f1 = frAt("BTC", day - 1), oc = oiChg("BTC", day, 2), r2 = d[i].c / d[i - 2].c - 1; if (f0 <= 0 && f1 <= 0 && oc >= 0.03 && r2 >= -0.05) { R48trig.push(day); for (let k = 1; k <= 3; k++) { R48.add(day + k); if (frAt("BTC", day + k) > 0) break; } } } }
const r48Active = day => R48.has(day);
console.log("R48 觸發", R48trig.length, "禁空日", R48.size, elapsed());
const settleBar = t => { const h = new Date(t).getUTCHours(), mi = new Date(t).getUTCMinutes(); return mi === 0 && (h === 0 || h === 8 || h === 16); };

// ===== 名額①：R21 亞洲盤急殺→美盤順勢接力空 =====
const ASIA = {};
function asiaOf(cn) {
  if (ASIA[cn]) return ASIA[cn];
  const m = data[cn].m, idx = mIdx[cn], out = new Map(), d0 = dk(m[0].t) + 1, d1 = dk(m.at(-1).t);
  for (let day = d0; day <= d1; day++) { const i0 = idx.get(day * D1), i7 = idx.get(day * D1 + 8 * H1 - M15); if (i0 == null || i7 == null || i7 - i0 !== 31) continue; let v = 0; for (let j = i0; j <= i7; j++) v += m[j].v; out.set(day, { o: m[i0].o, c: m[i7].c, v }); }
  return ASIA[cn] = out;
}
function r21(p) {
  const cn = p.cn || "BTC", thr = p.thr ?? -0.04, volK = p.vol ?? 2, stopPct = p.stop ?? 0.02, exitH = p.exit ?? 21, dir = p.dir ?? -1, costK = p.costK || 1, out = [], days = [];
  const m = data[cn].m, idx = mIdx[cn], A = asiaOf(cn);
  for (const [day, a] of A) {
    if (day * D1 < t0) continue;
    const liq = LIQ[cn].get(day - 1); if (!(liq >= (p.liq ?? 100e6))) continue;
    if (!(a.c / a.o - 1 <= thr)) continue;
    let s = 0, k = 0; for (let q = 1; q <= 20; q++) { const x = A.get(day - q); if (x) { s += x.v; k++; } } if (k < 15 || !(a.v >= volK * s / k)) continue;
    const i = idx.get(day * D1 + 8 * H1 + M15); if (i == null) continue; const tE = m[i].t;
    if (evNear(tE, 2 * H1, 0)) continue;
    if (p.ban && p.ban(cn, tE)) continue;
    if (p.sharpe != null && !(sharpe30(cn, day - 1) < p.sharpe)) continue;
    if (p.r48 && r48Active(day)) continue;
    days.push(day);
    const e = m[i].o, r = e * stopPct; let st = dir < 0 ? e + r : e - r;
    if (p.r48 && dir < 0) { const ta = dATR(cn, day - 1); if (ta > 0) st = Math.min(st, e + ta); }
    const tX = exitH > 8 ? day * D1 + exitH * H1 : (day + 1) * D1 + exitH * H1;
    let ex = null, tx = null, why = "", legF = 0;
    for (let j = i + 1; j < m.length; j++) {
      const b = m[j]; if (settleBar(b.t)) { const f = frAt(cn, dk(b.t)); if (!isNaN(f)) legF += -dir * f / 3 / 100 * e / r; }
      if (dir < 0 ? b.h >= st : b.l <= st) { ex = dir < 0 ? Math.max(b.o, st) : Math.min(b.o, st); tx = b.t + M15; why = "停損"; break; }
      if (b.t + M15 >= tX) { ex = b.c; tx = b.t + M15; why = "時間平倉"; break; }
    }
    if (ex == null) continue;
    const legP = dir * (ex - e) / r, costR = tieredCost(cn, tE) * costK * e / r;
    out.push({ cn, k: cn, t: tE, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: dir < 0 ? "空" : "多", state: stateAt(tE) });
  }
  return { res: segK(out, p.maxOpen || 1), raw: out, days };
}

// ===== 名額②：R20 恐慌日死貓反彈空 =====
function r20one(cn, p) {
  const drop = p.drop ?? -0.06, oiT = p.oi ?? -0.04, volK = p.vol ?? 2, retr = p.retr ?? 0.5, stopR = p.stopR ?? 0.75, holdH = p.hold ?? 72, dir = p.dir ?? -1, costK = p.costK || 1, out = [], days = [];
  const d = data[cn].d, m = data[cn].m, idx = mIdx[cn], V20 = pre[cn].d.v20; let noOI = 0;
  for (let i = 21; i < d.length - 1; i++) {
    const day = dk(d[i].t); if (day * D1 < t0) continue;
    if (!(d[i].c / d[i - 1].c - 1 <= drop)) continue;
    const liq = LIQ[cn].get(day - 1); if (!(liq >= (p.liq ?? 100e6))) continue;
    const oc = oiChg(cn, day, 1); if (isNaN(oc)) { noOI++; continue; } if (p.noOI !== true && !(oc <= oiT)) continue;
    if (!(d[i].v >= volK * V20[i - 1])) continue;
    const f = frAt(cn, day); if (p.noFr !== true && !(f > 0)) continue;
    if (p.fr1 && !(frAt(cn, day + 1) >= 0)) continue;
    const hi = d[i].h, lo = d[i].l, rng = hi - lo; if (!(rng > 0)) continue;
    const trig = lo + retr * rng, stP = lo + stopR * rng;
    const j0 = idx.get((day + 1) * D1); if (j0 == null) continue;
    let jE = null; for (let j = j0; j < Math.min(m.length - 1, j0 + 192); j++) { if (m[j].l < lo) break; if (m[j].c >= trig) { jE = j + 1; break; } }
    if (jE == null) continue;
    const e = m[jE].o, tE = m[jE].t;
    if (p.ban && p.ban(cn, tE)) continue;
    if (p.sharpe != null && !(sharpe30(cn, day) < p.sharpe)) continue;
    if (p.r48 && r48Active(dk(tE))) continue;
    let st, tgt, r;
    if (dir < 0) { st = stP; tgt = lo; r = st - e; } else { st = lo; tgt = hi; r = e - st; }
    if (!(r > 0) || r / e < 0.002) continue;
    if (p.r48 && dir < 0) { const ta = dATR(cn, dk(tE) - 1); if (ta > 0) st = Math.min(st, e + ta); }
    days.push(day);
    let ex = null, tx = null, why = "", legF = 0; const tX = tE + holdH * H1;
    for (let j = jE + 1; j < m.length; j++) {
      const b = m[j]; if (settleBar(b.t)) { const f2 = frAt(cn, dk(b.t)); if (!isNaN(f2)) legF += -dir * f2 / 3 / 100 * e / r; }
      if (dir < 0 ? b.h >= st : b.l <= st) { ex = dir < 0 ? Math.max(b.o, st) : Math.min(b.o, st); tx = b.t + M15; why = "停損"; break; }
      if (dir < 0 ? b.l <= tgt : b.h >= tgt) { ex = dir < 0 ? Math.min(b.o, tgt) : Math.max(b.o, tgt); tx = b.t + M15; why = "停利（D 日極值）"; break; }
      if (b.t + M15 >= tX) { ex = b.c; tx = b.t + M15; why = "時間平倉"; break; }
    }
    if (ex == null) continue;
    const legP = dir * (ex - e) / r, costR = tieredCost(cn, tE) * costK * e / r;
    out.push({ cn, k: cn, t: tE, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: dir < 0 ? "空" : "多", state: stateAt(tE), day });
  }
  return { out, days, noOI };
}
function r20(p) {
  const list = p.list || ["BTC", "ETH"]; let raw = [], days = [], noOI = 0;
  for (const cn of list) { if (!data[cn] || !Object.keys(OI(cn)).length) continue; const r = r20one(cn, p); raw = raw.concat(r.out); days = days.concat(r.days); noOI += r.noOI; }
  return { res: segK(raw, p.maxOpen || list.length), raw, days, noOI };
}

// ===== 報告 =====
const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, r48: {} };
const L = ["# 策略實驗室 第三十七輪：R21 亞洲盤急殺→美盤順勢接力空（BTC）＋R20 恐慌日死貓反彈空（BTC／ETH＋擴充版）＋補測 R48 空單擁擠濾網統計", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；R21 BTC 單張（擴充版最多 5 張）、R20 BTC／ETH 最多 2 張（擴充版最多 5 張）；原本＝日內（≥1 億U）最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；含空單「損益兩平成本倍數 <1.5 直接淘汰」（常設條款）。「原本」會前寫死（11/27 會議）：R21、R20 都對日內（≥1 億U）。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差）；指標只用已收盤 K、已結算費率（日合計）；進場用下一根開盤；成本分級；空單費率腿＝跨 00／08／16 結算點時收（付）當日費率 ÷3；停損以 max(開盤,停損) 保守出、滑價另計；R20 的 OI 只有 2025-05 起（沒有 OI 的 D 日另計筆數、不進場）；「D+1 費率轉負不做」含前視，只當對照；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在下面；R48 濾網用日費率合計近似「連續 6 次結算」。", "",
  `R48 濾網（補測用）：全期觸發 ${R48trig.length} 次、禁空日 ${R48.size} 天（OI 2025-05 起）。`, ""];
const nmOf = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";
const base = BASE.I, base15 = seg(runRaw(DEPTS[2], UNI19, { costMul: 1.5 })), base2 = seg(runRaw(DEPTS[2], UNI19, { costMul: 2 }));
const overlap = (a, b) => { const A = new Set(a), B = new Set(b); let k = 0; for (const x of A) if (B.has(x)) k++; return { k, a: A.size, b: B.size }; };
const EXT20 = U19.filter(c => c !== "BTC").map(c => [c, LIQ[c].get(dayEnd - 1) || 0]).filter(x => x[1] >= 500e6).sort((a, b) => b[1] - a[1]).slice(0, 20).map(x => x[0]);

// ----- 名額① R21 -----
{
  L.push("## 名額①：R21 亞洲盤急殺→美盤順勢接力空（觀察員1 11/13；原本＝日內（≥1 億U））", "",
    "定義：BTCUSDT 15 分K；UTC 00:00–08:00 區間報酬 ≤ −4% 且該 8 小時量 ≥ 同時段 20 日均量 ×2 → 08:15 那根開盤做空；排除進場前 2 小時內有 CPI／FOMC／非農／PPI；停損＝進場 +2%（1R）；出場＝UTC 21:00 收盤或先到停損。鄰近 8 組：跌幅 −3.2／−4.8%、量 1.6／2.4、停損 1.6／2.4%、出場 17:00／01:00。另列：反向做多對照、ETH、前 20 大（≥5 億U）擴充、順跌 Sharpe<0 版、R48 禁空版、成本 ×1.5／×2、損益兩平、分狀態、按月、與 R20 D 日重疊。", "");
  const P = { cn: "BTC", thr: -0.04, vol: 2, stop: 0.02, exit: 21 };
  const r = r21(P), v = r.res, j = judge(base, v), be = breakEven(r.raw);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, be, days: r.days.length }; let np = 0, nn = 0;
  L.push(`### R21 基準（BTC、−4%、量 ×2、停損 2%、21:00 UTC 平倉）`, "", `全期 ${v.ALL.n} 筆（觸發日 ${r.days.length}）；${legs(r.raw)}；損益兩平成本倍數 ${be}；出場原因：${byW(v.ALL)}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("R21 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["跌幅 −3.2%", { ...P, thr: -0.032 }], ["跌幅 −4.8%", { ...P, thr: -0.048 }], ["量 ×1.6", { ...P, vol: 1.6 }], ["量 ×2.4", { ...P, vol: 2.4 }], ["停損 1.6%", { ...P, stop: 0.016 }], ["停損 2.4%", { ...P, stop: 0.024 }], ["出場 17:00 UTC", { ...P, exit: 17 }], ["出場 01:00 UTC（次日）", { ...P, exit: 1 }]]) { const rr = r21(p), vv = rr.res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆）`, vv)); }
  const extRaw = EXT20.flatMap(c => r21({ ...P, cn: c, liq: 500e6 }).raw);
  const ethR = r21({ ...P, cn: "ETH" });
  for (const [nm, rr, b2] of [["反向做多對照", r21({ ...P, dir: 1 }), base], ["ETH 同規則", ethR, base], [`前 20 大（≥5 億U：${EXT20.join("、")}）擴充（最多 5 張）`, { res: segK(extRaw, 5), raw: extRaw }, base], ["BTC＋ETH＋前 20 大 合計（最多 5 張）", (() => { const a = r.raw.concat(ethR.raw, extRaw); return { res: segK(a, 5), raw: a }; })(), base], ["順跌 Sharpe<0 版", r21({ ...P, sharpe: 0 }), base], ["R48 禁空版（觸發後 72h 不開新空、停損收緊到 1×日ATR）", r21({ ...P, r48: true }), base], ["成本 ×1.5", r21({ ...P, costK: 1.5 }), base15], ["成本 ×2", r21({ ...P, costK: 2 }), base2]]) { const vv = rr.res, nj = judge(b2, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); if (/×/.test(nm)) L.push(row(`　　（原本 ${nm}）`, b2)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}；擴充版只當對照、不上線`, "");
  OUT.exp1 = o; console.log("R21 完成", v.ALL.n, elapsed());
}

// ----- 名額② R20 -----
{
  L.push("## 名額②：R20 恐慌日死貓反彈空（觀察員2 11/13；原本＝日內（≥1 億U））", "",
    "定義：D 日（UTC 日K）收跌 ≥6%（對前日收）且日 OI ≤ −4% 且量 ≥20 日均量 ×2 且 D 日費率日合計 >0；D 日收盤後 48h 內 15 分K 收盤反彈到 D 日區間 50% 回撤位 → 下一根開盤做空；先破 D 日低點放棄；停損＝區間 75% 回撤位；出場＝D 日最低（停利）或 72h。基準標的 BTC／ETH；擴充版＝list19 有 OI 且 ≥1 億U 者。鄰近 12 組：跌幅 4.8／7.2%、OI −3.2／−4.8%、量 1.6／2.4、回撤 0.4／0.6、停損 0.6／0.9、持有 58／86h。另列：反向做多對照、無 OI 條件對照、無費率條件對照、D+1 費率 ≥0（含前視）對照、順跌 Sharpe<0 版、R48 禁空版、成本 ×1.5／×2、損益兩平、分狀態、按月。", "");
  const P = { drop: -0.06, oi: -0.04, vol: 2, retr: 0.5, stopR: 0.75, hold: 72 };
  const LIST = ["BTC", "ETH"], EXT = U19.filter(c => Object.keys(OI(c)).length > 100);
  const r = r20({ ...P, list: LIST }), v = r.res, j = judge(base, v), be = breakEven(r.raw);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, ext: {}, be, days: r.days.length, noOI: r.noOI }; let np = 0, nn = 0;
  L.push(`### R20 基準（BTC／ETH、−6%、OI −4%、量 ×2、費率 >0、回撤 0.5、停損 0.75、72h）`, "", `全期 ${v.ALL.n} 筆（成交 D 日 ${r.days.length}；跌 ≥6% 但無 OI 資料的 D 日 ${r.noOI} 個不計）；${legs(r.raw)}；損益兩平成本倍數 ${be}；出場原因：${byW(v.ALL)}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("R20 基準" + (j.pass ? " ✅" : " ❌"), v));
  const NB = [["跌幅 −4.8%", { drop: -0.048 }], ["跌幅 −7.2%", { drop: -0.072 }], ["OI −3.2%", { oi: -0.032 }], ["OI −4.8%", { oi: -0.048 }], ["量 ×1.6", { vol: 1.6 }], ["量 ×2.4", { vol: 2.4 }], ["回撤 0.4", { retr: 0.4 }], ["回撤 0.6", { retr: 0.6 }], ["停損 0.6", { stopR: 0.6 }], ["停損 0.9", { stopR: 0.9 }], ["持有 58h", { hold: 58 }], ["持有 86h", { hold: 86 }]];
  for (const [nm, q] of NB) { const rr = r20({ ...P, ...q, list: LIST }), vv = rr.res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆）`, vv)); }
  for (const [nm, rr, b2] of [["反向做多對照（同觸發、停損 D 低、停利 D 高）", r20({ ...P, list: LIST, dir: 1 }), base], ["無 OI 條件對照", r20({ ...P, list: LIST, noOI: true }), base], ["無費率條件對照", r20({ ...P, list: LIST, noFr: true }), base], ["D+1 費率 ≥0 才做（含前視，只當對照）", r20({ ...P, list: LIST, fr1: true }), base], ["順跌 Sharpe<0 版", r20({ ...P, list: LIST, sharpe: 0 }), base], ["R48 禁空版", r20({ ...P, list: LIST, r48: true }), base], ["成本 ×1.5", r20({ ...P, list: LIST, costK: 1.5 }), base15], ["成本 ×2", r20({ ...P, list: LIST, costK: 2 }), base2]]) { const vv = rr.res, nj = judge(b2, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); if (/×/.test(nm)) L.push(row(`　　（原本 ${nm}）`, b2)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定（BTC／ETH 基準）：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
  // 擴充版
  const re = r20({ ...P, list: EXT, maxOpen: 5 }), ve = re.res, je = judge(base, ve), bee = breakEven(re.raw); let npe = 0, nne = 0;
  L.push(`### R20 擴充版（list19 有 OI 資料 ${EXT.length} 幣、≥1 億U、最多 5 張；審查員 11/13 建議，樣本不夠時用）`, "", `全期 ${ve.ALL.n} 筆（成交 D 日 ${re.days.length}）；${legs(re.raw)}；損益兩平 ${bee}；出場原因：${byW(ve.ALL)}；幣別：${byC(ve.ALL)}`, "", ...HDR, row("原本 日內（≥1 億U）", base), row("R20 擴充版" + (je.pass ? " ✅" : " ❌"), ve));
  const oe = { res: ve, judge: je, be: bee, neigh: {}, extra: {} };
  for (const [nm, q] of NB) { const rr = r20({ ...P, ...q, list: EXT, maxOpen: 5 }), vv = rr.res, nj = judge(base, vv); oe.neigh[nm] = { res: vv, judge: nj }; nne++; if (nj.pass) npe++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆）`, vv)); }
  for (const [nm, rr, b2] of [["反向做多對照", r20({ ...P, list: EXT, maxOpen: 5, dir: 1 }), base], ["順跌 Sharpe<0 版", r20({ ...P, list: EXT, maxOpen: 5, sharpe: 0 }), base], ["R48 禁空版", r20({ ...P, list: EXT, maxOpen: 5, r48: true }), base], ["只 ≥5 億U 幣", r20({ ...P, list: EXT, maxOpen: 5, liq: 500e6 }), base], ["成本 ×1.5", r20({ ...P, list: EXT, maxOpen: 5, costK: 1.5 }), base15], ["成本 ×2", r20({ ...P, list: EXT, maxOpen: 5, costK: 2 }), base2]]) { const vv = rr.res, nj = judge(b2, vv); oe.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}）`, vv)); if (/×/.test(nm)) L.push(row(`　　（原本 ${nm}）`, b2)); }
  oe.overfit = { n: nne, pass: npe, ok: npe * 2 > nne }; oe.beOK = !(bee != null && bee < 1.5); oe.ok = je.pass && oe.overfit.ok && oe.beOK; oe.note = verdictNote(je, ve); oe.month = monthly(ve.ALL);
  L.push("", `擴充版 分狀態：${bySt(ve.ALL)}；按月平均R：${oe.month.text}；時間穩定：${oe.month.months} 個月中 ${oe.month.pos} 個月為正${oe.month.top2 != null ? `、最好兩個月佔總R ${Math.round(oe.month.top2 * 100)}%` : ""}`);
  L.push(`判定（擴充版）：${J(je)} ${oe.note}；審查：鄰近 ${nne} 組 ${npe} 組合格 → ${oe.overfit.ok ? "通過" : "未通過"}；損益兩平 ${bee}（${oe.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${oe.ok ? "**合格**" : (ve.OOS.n < 30 || ve.IS.n < 30) ? "**判不了**" : "**不合格**"}；擴充版是山寨空單，11/13 決議程式化小幣空單停排，合格也只能先當對照、由會議決定是否上線`, "");
  const ov = overlap(OUT.exp1.days ? r21({ cn: "BTC", thr: -0.04, vol: 2, stop: 0.02, exit: 21 }).days : [], r20one("BTC", P).days);
  L.push(`R21 與 R20（BTC）D 日重疊：R21 觸發 ${ov.a} 日、R20 BTC 成交 D 日 ${ov.b} 日、重疊 ${ov.k} 日（重疊率 >50% 就併入）。`, "");
  o.ext = oe; o.overlap = ov; OUT.exp2 = o; console.log("R20 完成", v.ALL.n, ve.ALL.n, elapsed());
}

// ----- 補測：R48 統計 -----
{
  const d = data.BTC.d, fwd = (i, k) => i + k < d.length ? d[i + k].c / d[i].c - 1 : NaN;
  const stat = arr => { const a = arr.filter(x => !isNaN(x)).sort((x, y) => x - y); if (!a.length) return "無"; const mu = a.reduce((s, x) => s + x, 0) / a.length, med = a[Math.floor(a.length / 2)], pos = a.filter(x => x > 0).length / a.length; return `n=${a.length}、平均 ${(mu * 100).toFixed(2)}%、中位 ${(med * 100).toFixed(2)}%、上漲機率 ${(pos * 100).toFixed(0)}%`; };
  const trig1 = [], trig3 = [], all1 = [], all3 = []; const T = new Set(R48trig);
  for (let i = 0; i < d.length - 3; i++) { const day = dk(d[i].t); if (isNaN(oiLast("BTC", day))) continue; all1.push(fwd(i, 1)); all3.push(fwd(i, 3)); if (T.has(day)) { trig1.push(fwd(i, 1)); trig3.push(fwd(i, 3)); } }
  const isOOS = i => d[i].t >= cut; const oos1 = [], oos3 = []; for (let i = 0; i < d.length - 3; i++) if (T.has(dk(d[i].t)) && isOOS(i)) { oos1.push(fwd(i, 1)); oos3.push(fwd(i, 3)); }
  OUT.r48 = { trig: R48trig.length, t1: stat(trig1), t3: stat(trig3), a1: stat(all1), a3: stat(all3), o1: stat(oos1), o3: stat(oos3), dates: R48trig.map(x => fmtD(x * D1)) };
  L.push("## 補測（不佔名額）：R48 空單擁擠濾網統計（觀察員2 11/26）", "", `定義：BTC 連續 2 個 UTC 日費率日合計 ≤0（≈6 次結算）且 2 日 OI ≥ +3% 且 2 日跌幅 ≤5% → 當日收盤觸發。觸發 ${R48trig.length} 次（${OUT.r48.dates.join("、")}）。`, "", `觸發後 24h：${OUT.r48.t1}；全部日子 24h 基準：${OUT.r48.a1}`, `觸發後 72h：${OUT.r48.t3}；全部日子 72h 基準：${OUT.r48.a3}`, `樣本外觸發 24h：${OUT.r48.o1}；72h：${OUT.r48.o3}`, "", "解讀：若觸發後 24／72h 平均報酬與上漲機率明顯高於基準＝空單擁擠確實常被軋，禁空濾網有依據；若差不多＝濾網無用。觸發次數 <20 只能當線索。", "");
}
{
  L.push(`結論：R21 亞洲盤急殺接力空 ${nmOf(OUT.exp1)}（全期 ${OUT.exp1.res.ALL.n} 筆、樣本外 ${OUT.exp1.res.OOS.n} 筆、損益兩平 ${OUT.exp1.be}）；R20 死貓反彈空 BTC／ETH ${nmOf(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆、損益兩平 ${OUT.exp2.be}）、擴充版 ${nmOf(OUT.exp2.ext)}（全期 ${OUT.exp2.ext.res.ALL.n} 筆、樣本外 ${OUT.exp2.ext.res.OOS.n} 筆、損益兩平 ${OUT.exp2.ext.be}）。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report37.md", L.join("\n"));
await fs.writeFile("lab/results37.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
