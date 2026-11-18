// 策略實驗室 第二十八輪（11/18 會議決議）
// 實驗一（多方辯手 11/12，R19）：OI 去槓桿後站回 3 日高做多。定義（照 queue 原文）：日線 OI 較 20 日高點降 ≥15% 且收盤在（該幣日線）EMA50 下 → 日線收盤站回前 3 日最高價，次日開盤做多；停損＝該根日K 低點；目標＝觸及日線 EMA50 或持有 7 天出場；FOMC／CPI／非農／PPI／季度到期當日不進。標的 BTC、ETH＋list19 當日成交額前 10。原本＝波段A。審查：OI 降 12／18%、回看 2／4 日、持有 6／8 日（1 基準＋6 鄰近）；另列：拿掉 OI 條件的 30 個月對照版、只 BTC／ETH、計入持有期間費率、成本 ×1.5／×2。OI 只有 2025-05 起 18 個月 → 事先聲明很可能「判不了」。
// 實驗二（觀察員1 11/16，R26）：週線投降量＋週一守低多。定義（照 queue 原文）：標的 BTC、ETH 及 list19（近 30 天日均成交額 ≥1 億U）；上週（週一 00:00～週日 23:45 UTC）收跌 ≥10% 且上週成交額 ≥1.5× 前 12 週中位數、且週日費率日合計 ≤0；週一 04:00 UTC 若 00:00–04:00 未跌破週六～週日最低，以 04:00 收盤那根 15 分K 的下一根開盤做多；停損＝週末最低 −1%；出場＝+2R 或週四 00:00 UTC 時間停損。原本＝日內（≥1 億U）（持有 ≤72h）。審查：跌幅 8／12%、量倍 1.2／1.8、停損緩衝 0.8／1.2%、時間停損週三／週五（1 基準＋8 鄰近）；另列：只 BTC／ETH／SOL、拿掉費率條件、成本 ×1.5／×2。
// 補測（不佔名額，11/17 登記）：日內B／日內C／日內D 各套 C14b「週一（UTC）不開新單」，週一桶穩健檢查寫進腳本自動判：被拿掉的週一桶「每月為負比例 ≥70%」且「去掉最差兩個月後合計仍為負」才算穩健；鄰近 4 組、成本 ×1.5／×2 照 run27。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K／已結算費率、OI 用日末值；進場用下一根開盤；成本分級；R19 主表與波段A 同口徑（未計費率）、另列計費率版；R26 持有 ≤72h 費率影響小、另列拿掉費率條件版；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告；兩題各 ≤6 個參數（快篩過）。
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
// ===== 五個部門（原本）=====
const XA = { tp: 0, f: 0, be: false }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "I", name: "日內（≥1 億U）", kind: "intra", q: QI, x: XA, f: { liq: 100 } },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
  { key: "I3", name: "日內C（日內B＋事件前後 4h 不開單）", kind: "intra", q: QI, x: XA, f: { liq: 500, ev: true } },
  { key: "I4", name: "日內D（日內＋BTC 趨勢上不開單）", kind: "intra", q: QI, x: XA, f: { liq: 100, trend: true } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const nm = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";
const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, extra: {} };
const L = ["# 策略實驗室 第二十八輪：R19 OI 去槓桿後站回 3 日高多＋R26 週線投降量＋週一守低多＋補測 日內B／C／D 套 C14b", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；OI 日資料 2025-05-08 起、費率 2024-05 起；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死（11/18 會議）：R19 持有可達 7 天 → 原本＝波段A；R26 持有 ≤72h → 原本＝日內（≥1 億U）；補測各部門對自己。樣本外 <30 筆＝判不了（不能上線、也不能說它差）。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、已結算費率、OI 日末值；進場用下一根開盤；成本分級；R19 主表與波段A 同口徑（未計費率），另列計費率版；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；OI 只有 2025-05 起 18 個月，R19 事先聲明很可能判不了；各試組數寫在下面。", ""];

// ===== 實驗一：R19 OI 去槓桿後站回 3 日高做多 =====
L.push("## 實驗一：R19 OI 去槓桿後站回 3 日高做多（多方辯手 11/12；原本＝波段A）", "",
  "定義：日 d 收盤時，該幣日末 OI ≤（過去 20 日 OI 最高）×(1−15%)、收盤 < 該幣日線 EMA50、且收盤 > 前 3 日最高價 → d+1 開盤做多；停損＝d 日低點；出場＝盤中觸及日線 EMA50（以 EMA50 價出）或持有 7 天收盤出；d+1 若是 FOMC／CPI／非農／PPI 或季度到期（3／6／9／12 月最後週五）不進。標的＝BTC、ETH＋list19 中 d−1 日 30 日成交額前 10。審查：OI 降 12／18%、回看 2／4 日、持有 6／8 日（1 基準＋6 鄰近）。另列：拿掉 OI 條件（30 個月對照）、只 BTC／ETH、計入持有費率、成本 ×1.5／×2。", "");
const liqRank = new Map();
function top10Liq(d) { if (liqRank.has(d)) return liqRank.get(d); const arr = U19.map(cn => [cn, LIQ[cn].get(d) || 0]).sort((a, b) => b[1] - a[1]); const s = new Set(arr.slice(0, 10).map(x => x[0])); s.add("BTC"); s.add("ETH"); liqRank.set(d, s); return s; }
const lastFri = (y, mo) => { let d = new Date(Date.UTC(y, mo + 1, 0)); while (d.getUTCDay() !== 5) d = new Date(d.getTime() - D1); return dk(d.getTime()); };
const QEXP = new Set(); for (let y = 2024; y <= 2026; y++) for (const mo of [2, 5, 8, 11]) QEXP.add(lastFri(y, mo));
const evDay = new Set(EVP.map(e => dk(e.t)));
const dEma50 = {}; for (const cn of coins) dEma50[cn] = ema(data[cn].d.map(x => x.c), 50);
function r19(p) {
  const drop = p.drop ?? 0.15, look = p.look ?? 3, hold = p.hold ?? 7, out = [];
  for (const cn of (p.btcOnly ? ["BTC"] : U19)) {
    const d = data[cn].d, E = dEma50[cn], A = pre[cn].d.a;
    for (let i = 60; i < d.length - hold - 2; i++) {
      const day = dk(d[i].t);
      if (!(cn === "BTC" || cn === "ETH" || top10Liq(day - 1).has(cn))) continue;
      if (!p.noOI) { const o = oiLast(cn, day); if (!(o > 0)) continue; let mx = 0; for (let k = 1; k <= 20; k++) { const v = oiLast(cn, day - k); if (v > mx) mx = v; } if (!(mx > 0) || !(o <= mx * (1 - drop))) continue; }
      const b = d[i]; if (!(b.c < E[i])) continue;
      let hi = -Infinity; for (let j = i - look; j < i; j++) hi = Math.max(hi, d[j].h); if (!(b.c > hi)) continue;
      if (evDay.has(day + 1) || QEXP.has(day + 1)) continue;
      const e = d[i + 1].o, st = b.l, r = e - st; if (!(r > 0) || r / e < 0.002) continue;
      let ex = null, why = "", j = i + 1;
      for (; j <= i + hold && j < d.length; j++) { const x = d[j]; if (x.l <= st) { ex = Math.min(x.o, st); why = "停損"; break; } if (x.h >= E[j]) { ex = Math.max(x.o, E[j]); why = "觸及EMA50"; break; } if (j === i + hold) { ex = x.c; why = "時間停損"; break; } }
      if (ex == null) continue;
      const legP = (ex - e) / r, legF = -fundSum(cn, day + 1, dk(d[j].t) + 1).s / 100 * e / r, costR = tieredCost(cn, d[i + 1].t) * e / r;
      out.push({ cn, t: d[i + 1].t, tx: d[j].t + D1, R: legP - (p.costK || 1) * costR + (p.fund ? legF : 0), gross: legP + (p.fund ? legF : 0), costR, legP, legF, why, state: stateAt(d[i + 1].t), days: j - i });
    }
  }
  return out;
}
{
  const base = BASE.A; const P = {}; const raw = r19(P), v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, raw: raw.length }; let np = 0, nn = 0;
  L.push(...HDR, row("原本 波段A（判定用）", base), row("R19 基準（OI 降 15%、回看 3 日、持有 7 日）" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm2, p] of [["OI 降 12%", { drop: 0.12 }], ["OI 降 18%", { drop: 0.18 }], ["回看 2 日", { look: 2 }], ["回看 4 日", { look: 4 }], ["持有 6 日", { hold: 6 }], ["持有 8 日", { hold: 8 }]]) { const vv = seg(r19(p)), nj = judge(base, vv); o.neigh[nm2] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm2, p, bb] of [["拿掉 OI 條件（30 個月對照，EMA50 下站回 3 日高）", { noOI: true }], ["R31 變體（觀察員2 11/18：OI 降 10%、回看 1 日、持有 10 日）", { drop: 0.10, look: 1, hold: 10 }], ["R30 變體（觀察員1 11/18：只 BTC，OI 降 15%、回看 1 日、持有 5 日）", { look: 1, hold: 5, btcOnly: true }], ["計入持有期間費率", { fund: true }], ["成本 ×1.5（原本也 ×1.5）", { costK: 1.5 }, seg(costMul(RAW.A, 1.5))], ["成本 ×2（原本也 ×2）", { costK: 2 }, seg(costMul(RAW.A, 2))]]) { const rr = r19(p), vv = seg(rr), b2 = bb || base, nj = judge(b2, vv); o.extra[nm2] = { res: vv, judge: nj, be: breakEven(rr) }; L.push(row("　另列：" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); if (bb) L.push(row("　　（原本）", bb)); }
  // 只 BTC／ETH
  { const rr = r19(P).filter(x => x.cn === "BTC" || x.cn === "ETH"), vv = seg(rr), nj = judge(base, vv); o.extra["只 BTC／ETH"] = { res: vv, judge: nj }; L.push(row("　另列：只 BTC／ETH" + (nj.pass ? " ✅" : " ❌"), vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL); o.be = breakEven(raw);
  const avgDays = raw.length ? (raw.reduce((a, x) => a + x.days, 0) / raw.length).toFixed(1) : "—";
  L.push("", `R19 基準：原始訊號 ${raw.length} 筆、平均持有 ${avgDays} 天、損益兩平成本倍數 ${o.be}；出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
  OUT.exp1 = o; console.log("R19 完成", elapsed());
}

// ===== 實驗二：R26 週線投降量＋週一守低多 =====
L.push("## 實驗二：R26 週線投降量＋週一守低多（觀察員1 11/16；原本＝日內（≥1 億U））", "",
  "定義：週（週一 00:00～週日 23:45 UTC）收跌 ≥10%（週日最後一根收盤／前週收盤 −1）、該週成交額 ≥1.5× 前 12 週中位數、週日費率日合計 ≤0、且該幣前一日 30 日成交額 ≥1 億U；下週一 00:00–04:00 UTC 最低價未跌破週六～週日最低 → 04:00 那根（03:45–04:00）收盤後下一根開盤做多；停損＝週末最低 ×(1−1%)；出場＝觸及 +2R（以 e+2r 出）或週四 00:00 UTC 收盤時間停損。審查：跌幅 8／12%、量倍 1.2／1.8、停損緩衝 0.8／1.2%、時間停損週三／週五（1 基準＋8 鄰近）。另列：只 BTC／ETH／SOL、拿掉費率條件、成本 ×1.5／×2。", "");
const MON0 = Date.UTC(2024, 0, 1); // 週一 00:00 UTC
const wkStart = t => MON0 + Math.floor((t - MON0) / (7 * D1)) * 7 * D1;
function r26(p) {
  const drop = p.drop ?? 0.10, volK = p.volK ?? 1.5, buf = p.buf ?? 0.01, exitDow = p.exitDow ?? 4, out = [];
  const list = p.big3 ? ["BTC", "ETH", "SOL"].filter(c => data[c]) : U19;
  for (const cn of list) {
    const m = data[cn].m, mi = mIdx[cn]; if (m.length < 96 * 7 * 14) continue;
    // 週統計
    const W = new Map(); for (const b of m) { const w = wkStart(b.t); let x = W.get(w); if (!x) { x = { t: w, o: b.o, c: b.c, qv: 0, wkndLo: Infinity }; W.set(w, x); } x.c = b.c; x.qv += b.v * b.c; if (b.t >= w + 5 * D1) x.wkndLo = Math.min(x.wkndLo, b.l); }
    const weeks = [...W.values()].sort((a, b) => a.t - b.t);
    for (let k = 13; k < weeks.length - 1; k++) {
      const w = weeks[k], prev = weeks[k - 1]; if (!(prev.c > 0) || !(w.wkndLo < Infinity)) continue;
      const ret = w.c / prev.c - 1; if (!(ret <= -drop)) continue;
      const med = weeks.slice(k - 12, k).map(x => x.qv).sort((a, b) => a - b)[6]; if (!(w.qv >= volK * med)) continue;
      const sunDay = dk(w.t + 6 * D1); if (!p.noFund) { const f = frAt(cn, sunDay); if (isNaN(f) || !(f <= 0)) continue; }
      const monT = w.t + 7 * D1; const liq = LIQ[cn].get(dk(monT) - 1); if (!(liq >= 100e6)) continue;
      const i0 = mi.get(monT); if (i0 == null) continue; let lo = Infinity; for (let i = i0; i < i0 + 16 && i < m.length; i++) lo = Math.min(lo, m[i].l); if (!(lo > w.wkndLo)) continue;
      const iE = i0 + 16; if (iE + 1 >= m.length || m[iE].t !== monT + 4 * H1) continue;
      const e = m[iE].o, st = w.wkndLo * (1 - buf), r = e - st; if (!(r > 0) || r / e < 0.002) continue;
      const tEnd = monT + (exitDow - 1) * D1; let ex = null, why = "", j = iE;
      for (; j < m.length; j++) { const x = m[j]; if (x.l <= st) { ex = Math.min(x.o, st); why = "停損"; break; } if (x.h >= e + 2 * r) { ex = Math.max(x.o, e + 2 * r); why = "+2R"; break; } if (x.t + M15 >= tEnd) { ex = x.c; why = "時間停損"; break; } }
      if (ex == null) continue;
      const legP = (ex - e) / r, costR = tieredCost(cn, monT) * e / r;
      out.push({ cn, t: m[iE].t, tx: m[j].t + M15, R: legP - (p.costK || 1) * costR, gross: legP, costR, why, state: stateAt(monT), ret: +(ret * 100).toFixed(1) });
    }
  }
  return out;
}
{
  const base = BASE.I; const P = {}; const raw = r26(P), v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, raw: raw.length }; let np = 0, nn = 0;
  L.push(...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("參考 波段A", BASE.A), row("R26 基準（跌 10%、量 1.5×、緩衝 1%、週四出）" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm2, p] of [["跌幅 8%", { drop: 0.08 }], ["跌幅 12%", { drop: 0.12 }], ["量倍 1.2", { volK: 1.2 }], ["量倍 1.8", { volK: 1.8 }], ["停損緩衝 0.8%", { buf: 0.008 }], ["停損緩衝 1.2%", { buf: 0.012 }], ["時間停損 週三", { exitDow: 3 }], ["時間停損 週五", { exitDow: 5 }]]) { const vv = seg(r26(p)), nj = judge(base, vv); o.neigh[nm2] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm2, p, bb] of [["只 BTC／ETH／SOL", { big3: true }], ["拿掉週日費率 ≤0 條件", { noFund: true }], ["成本 ×1.5（原本也 ×1.5）", { costK: 1.5 }, seg(costMul(RAW.I, 1.5))], ["成本 ×2（原本也 ×2）", { costK: 2 }, seg(costMul(RAW.I, 2))]]) { const rr = r26(p), vv = seg(rr), b2 = bb || base, nj = judge(b2, vv); o.extra[nm2] = { res: vv, judge: nj, be: breakEven(rr) }; L.push(row("　另列：" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); if (bb) L.push(row("　　（原本）", bb)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL); o.be = breakEven(raw);
  L.push("", `R26 基準：原始訊號 ${raw.length} 筆、損益兩平成本倍數 ${o.be}；出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
  OUT.exp2 = o; console.log("R26 完成", elapsed());
}

// ===== 補測：日內B／C／D 套 C14b 週一不開單＋週一桶穩健檢查（自動判）=====
L.push("## 補測（不佔名額）：日內B／日內C／日內D 套 C14b 週一（UTC）不開新單＋週一桶穩健檢查", "",
  "穩健檢查（自動判）：被拿掉的週一桶要同時滿足「每月為負比例 ≥70%」與「去掉最差兩個月後合計仍為負」才算穩健；鐵律＋鄰近 4 組過半＋穩健 三者都過才合格。", "");
const wk = t => (((t - MON0) % (7 * D1)) + 7 * D1) % (7 * D1);
const banWin = (startH, lenH) => (cn, t) => { const w = wk(t); const s = ((startH * H1) % (7 * D1) + 7 * D1) % (7 * D1), e = s + lenH * H1; return e <= 7 * D1 ? (w >= s && w < e) : (w >= s || w < e - 7 * D1); };
{
  const VARS = [["基準：週一 00:00 起 24h", { ban: banWin(0, 24) }], ["窗起點 −4h", { ban: banWin(-4, 24) }], ["窗起點 +4h", { ban: banWin(4, 24) }], ["窗長 20h", { ban: banWin(0, 20) }], ["窗長 29h", { ban: banWin(-2, 29) }]];
  OUT.extra.c14b = {}; const summary = [];
  for (const S of DEPTS.filter(s => ["I2", "I3", "I4"].includes(s.key))) {
    const base = BASE[S.key]; const o = { base, neigh: {}, extra: {} }; let np = 0, nn = 0;
    L.push(`### ${S.name}`, "", ...HDR, row(`原本 ${S.name}（判定用）`, base));
    for (let k = 0; k < VARS.length; k++) { const [nm2, opt] = VARS[k]; const v = seg(runRaw(S, UNI19, opt)), j = judge(base, v); if (k === 0) { o.res = v; o.judge = j; } else { o.neigh[nm2] = { res: v, judge: j }; nn++; if (j.pass) np++; } L.push(row((k === 0 ? "C14b " : "　") + nm2 + (j.pass ? " ✅" : " ❌"), v)); }
    for (const kk of [1.5, 2]) { const v = seg(runRaw(S, UNI19, { ban: banWin(0, 24), costMul: kk })), b2 = seg(costMul(RAW[S.key], kk)), j = judge(b2, v); o.extra["成本 ×" + kk] = { res: v, base: b2, judge: j }; L.push(row(`　另列：成本 ×${kk}（原本也 ×${kk}）` + (j.pass ? " ✅" : " ❌"), v), row(`　　（原本 ×${kk}）`, b2)); }
    const monTr = RAW[S.key].filter(x => banWin(0, 24)(x.cn, x.t)); const bm = {}; for (const x of monTr) { const k = new Date(x.t).toISOString().slice(0, 7); const v = bm[k] ||= { n: 0, s: 0 }; v.n++; v.s += x.R; }
    const ms = Object.entries(bm).sort(); const neg = ms.filter(([, v]) => v.s < 0).length; const sums = ms.map(([, v]) => v.s); const tot = sums.reduce((a, x) => a + x, 0); const worst2 = [...sums].sort((a, b) => a - b).slice(0, 2).reduce((a, b) => a + b, 0);
    const robust = ms.length >= 6 && neg / ms.length >= 0.7 && (tot - worst2) < 0;
    o.monBucket = { n: monTr.length, avgR: monTr.length ? +(monTr.reduce((a, x) => a + x.R, 0) / monTr.length).toFixed(3) : null, months: ms.length, neg, totR: +tot.toFixed(2), exWorst2: +(tot - worst2).toFixed(2), robust, text: ms.map(([k, v]) => `${k.slice(2)} ${v.s > 0 ? "+" : ""}${v.s.toFixed(2)}(${v.n})`).join("、") };
    o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = o.judge.pass && o.overfit.ok && robust; o.note = verdictNote(o.judge, o.res);
    L.push("", `週一桶：${o.monBucket.n} 筆、平均 ${o.monBucket.avgR}R、合計 ${o.monBucket.totR}R、去最差兩個月後 ${o.monBucket.exWorst2}R；${ms.length} 個月中 ${neg} 個月為負（${ms.length ? Math.round(neg / ms.length * 100) : 0}%）→ 穩健檢查 ${robust ? "過" : "不過"}；按月：${o.monBucket.text}`);
    L.push(`判定：${J(o.judge)} ${o.note}；鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；穩健 ${robust ? "過" : "不過"} → ${o.ok ? "**合格（事後假設，上線只能標註並列）**" : (o.res.OOS.n < 30 || o.res.IS.n < 30) ? "**判不了**" : o.judge.pass && o.overfit.ok ? "**再修（週一桶不穩健）**" : "**不合格**"}`, "");
    OUT.extra.c14b[S.key] = o; summary.push(`${S.name} ${o.ok ? "合格" : (o.res.OOS.n < 30 || o.res.IS.n < 30) ? "判不了" : o.judge.pass && o.overfit.ok ? "再修" : "不合格"}`); console.log("C14b 補測", S.key, elapsed());
  }
  OUT.extra.c14b.summary = summary; L.push(`補測小結：${summary.join("；")}。`, "");
}
L.push(`結論：R19 ${nm(OUT.exp1)}（全期 ${OUT.exp1.res.ALL.n} 筆、樣本外 ${OUT.exp1.res.OOS.n} 筆；OI 資料只有 18 個月，判不了＝等資料，不能上線也不能說它差）；R26 ${nm(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆）；補測 ${OUT.extra.c14b.summary.join("；")}。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
await fs.writeFile("lab/report28.md", L.join("\n"));
await fs.writeFile("lab/results28.json", JSON.stringify(OUT));
console.log(L.join("\n"));
