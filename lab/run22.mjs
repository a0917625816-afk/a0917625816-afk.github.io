// 策略實驗室 第二十二輪（11/12 會議決議）
// 實驗一：S3 攻擊K 過濾器（SK 課程；佇列定義：突破K實體 ≥0.7×ATR14 且收盤位於該根區間上方 25% 才算攻擊K，否則略過）。只作為現行進場的過濾器，不改出場；套用於波段A、波段B（原本＝各自）；另列套用於日內B／日內D（只參考）。審查：實體 0.56／0.84×ATR、收盤位置上方 20%／30%。另列：成本 ×1.5／×2、按月、分狀態、損益兩平成本倍數。
// 實驗二：R14 暴漲後失守 24h VWAP 確認空（觀察員2 11/11；原本＝日內（≥1 億U），會前寫死；參考 日內B）。定義：40 幣（排除 BTC／ETH）15 分K；任一 15 分K 收盤較 96 根（24h）前漲 ≥25%，記 H＝這 96 根的最高價（之後觀察期內持續更新為最高）；之後 96 根內第一次「1h 收盤（整點那根 15 分K）< 滾動 24h VWAP」且收盤 ≤ H×0.92 → 下一根 15 分K 開盤做空。過濾：觸發時近 24h 成交額 ≥5,000 萬U；前一日費率日合計 ≥ −0.3%（＝8h 均值 ≥ −0.1%，排除空單極端擁擠）；同幣 7 天只進一次。停損＝min(H, 進場 ×1.12)，風險 >12% 跳過；出場＝48h 到期、進場 ×0.80 停利、或 1h 收盤重新站回 VWAP。審查：漲幅 20／30%、失守 6.4／9.6%、停損 9.6／14.4%、持有 38／58h、成交額 4,000／6,000 萬。另列：對照組（同樣暴漲但 96 根內沒失守，觀察期結束直接做空、同停損停利）、成本 ×1.5／×2、停利 0.84／0.76、分狀態、按月、損益兩平成本倍數。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 的幣）；指標只用已收盤 K；進場用下一根開盤；成本分級，資金費率未計入（短線 ≤48h，另記）；停損滑價另計（實際空單停損常 −1.4R）；樣本內 65%／樣本外 35%，參數只在樣本內定。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。沒過就是沒過，不放寬。
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
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
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

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第二十二輪：S3 攻擊K 過濾器（波段A／B）＋R14 暴漲後失守 24h VWAP 確認空", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%、最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死（11/12 會議）：S3 是進場過濾器 → 原本＝套用的那個部門自己（波段A／波段B 各自判；日內B／日內D 只另列參考）；R14 持有 ≤48h → 原本＝日內（≥1 億U），參考 日內B（≥5 億U）。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、進場用下一根開盤；成本分級、資金費率未計入；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；兩個實驗各試的組數都寫在下面。", ""];

// ===== 實驗一：S3 攻擊K 過濾器 =====
L.push("## 實驗一：S3 攻擊K 過濾器（套用於波段A、波段B；另列日內B、日內D）", "",
  "定義：突破那根 K（4h；日內為 15 分K）的實體（收−開）≥ 0.7×ATR14，且收盤位於該根高低區間的上方 25%（(收−低)/(高−低) ≥ 0.75）才算攻擊K、才進場；不符就略過這次突破（波段：等下一次創 55 根新高；日內：當天不再進場）。出場、停損、濾網全部不動。審查：實體 0.56／0.84×ATR、收盤位置上方 20%（≥0.80）／30%（≥0.70）。共試 1 基準＋4 鄰近＝5 組／部門。", "");
const PK = { body: 0.7, cs: 0.75 };
const VK = [["實體 0.56×ATR", { ...PK, body: 0.56 }], ["實體 0.84×ATR", { ...PK, body: 0.84 }], ["收盤上方 20%", { ...PK, cs: 0.80 }], ["收盤上方 30%", { ...PK, cs: 0.70 }]];
for (const S of DEPTS) {
  const judged = S.key === "A" || S.key === "B";
  const base = BASE[S.key]; const raw = runRaw(S, UNI19, { ak: PK }); const v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, judged, filtered: base.ALL.n - v.ALL.n, neigh: {}, extra: {}, be: { base: breakEven(RAW[S.key]), ak: breakEven(raw) } }; let np = 0, nn = 0;
  L.push(`### 套用於 ${S.name}（${judged ? "原本＝" + S.name + "，正式判定" : "只另列參考，不判定"}）`, "", `原本 ${base.ALL.n} 筆 → 攻擊K 過濾後 ${v.ALL.n} 筆（濾掉 ${o.filtered} 筆）；損益兩平成本倍數：原本 ${o.be.base}、過濾後 ${o.be.ak}`, "", ...HDR, row("原本（判定用）", base), row("S3 攻擊K 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of VK) { const vv = seg(runRaw(S, UNI19, { ak: p })), nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const k of [1.5, 2]) { const vv = seg(costMul(raw, k)); o.extra["成本×" + k] = { res: vv }; L.push(row(`　另列：基準 成本 ×${k}`, vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = judged && j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL); o.monthBase = monthly(base.ALL);
  L.push("", `基準 出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}（原本：${bySt(base.ALL)}）；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}（原本 ${o.monthBase.pos}／${o.monthBase.months}${o.monthBase.top2 != null ? `、${Math.round(o.monthBase.top2 * 100)}%` : ""}）`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${judged ? (o.ok ? "**合格**" : "**不合格**") : "（參考）"}`, "");
  OUT.exp1[S.key] = o; console.log("S3", S.key, elapsed());
}

// ===== 實驗二：R14 暴漲後失守 24h VWAP 確認空 =====
L.push("## 實驗二：R14 暴漲後失守 24h VWAP 確認空（觀察員2 11/11；原本＝日內（≥1 億U））", "",
  "定義：list19 排除 BTC／ETH，15 分K。觸發＝某根 15 分K 收盤較 96 根前漲 ≥25%（T0），H＝T0 往前 96 根的最高價（觀察期內若再創高就更新）；觀察期＝T0 後 96 根內，第一次「整點收盤的 15 分K 收盤 < 滾動 24h VWAP（近 96 根 Σ收×量／Σ量）」且收盤 ≤ H×(1−8%) → 下一根開盤做空。過濾：T0 近 24h 成交額 ≥5,000 萬U；T0 前一日費率日合計 ≥ −0.3%；同幣 7 天一次。停損＝min(H, 進場×1.12)；出場＝進場×0.80 停利、1h 收盤站回 VWAP、或 48h 到期。審查：漲幅 20／30%、失守 6.4／9.6%、停損 9.6／14.4%、持有 38／58h、成交額 4,000／6,000 萬（共 1 基準＋10 鄰近）。另列：對照組（暴漲但 96 根內沒失守 → 觀察期結束那根開盤直接做空，同停損停利）、成本 ×1.5／×2、停利 0.84／0.76、損益兩平成本倍數。", "");
const UP0 = process.env.MOCK ? 0.02 : 0.25, FAIL0 = process.env.MOCK ? 0.004 : 0.08; // MOCK 只為了跑通程式路徑
function r14(p) {
  const out = []; let nTrig = 0, nFail = 0;
  for (const cn of U19) {
    if (cn === "BTC" || cn === "ETH") continue;
    const m = data[cn].m, n = m.length; if (n < 400) continue;
    const vw = new Float64Array(n), to = new Float64Array(n); let sPV = 0, sV = 0;
    for (let i = 0; i < n; i++) { sPV += m[i].c * m[i].v; sV += m[i].v; if (i >= 96) { sPV -= m[i - 96].c * m[i - 96].v; sV -= m[i - 96].v; } vw[i] = sV > 0 ? sPV / sV : m[i].c; to[i] = sPV; }
    const isHour = i => ((m[i].t + M15) % H1) === 0;
    let lastE = -Infinity, i = 200;
    while (i < n - 2) {
      const b = m[i];
      if (b.t < lastE + 7 * D1 || !(b.c / m[i - 96].c - 1 >= p.up)) { i++; continue; }
      if (!(to[i] >= p.liq) ) { i++; continue; }
      const fr = frAt(cn, dk(b.t) - 1); if (!(isNaN(fr) || fr >= -0.3)) { i++; continue; }
      nTrig++;
      let H = -Infinity; for (let j = i - 96; j <= i; j++) H = Math.max(H, m[j].h);
      let k = -1, jEnd = Math.min(i + 96, n - 2);
      for (let j = i + 1; j <= jEnd; j++) { H = Math.max(H, m[j].h); if (isHour(j) && m[j].c < vw[j] && m[j].c <= H * (1 - p.fail)) { k = j; break; } }
      if (k >= 0) nFail++;
      if (p.ctrl) { if (k >= 0) { i = jEnd + 1; continue; } k = jEnd; } // 對照組只取「沒失守」的觸發
      else if (k < 0) { i = jEnd + 1; continue; }
      const e = m[k + 1].o, st = Math.min(H, e * (1 + p.stop)), r = st - e;
      if (!(r > 0) || r / e < 0.002 || r / e > 0.12) { i = k + 1; continue; }
      const tp = e * (1 - p.tp), te = m[k + 1].t, cost = tieredCost(cn, te) * (p.costK || 1); let ex = null, why = "", tx = te;
      for (let q = k + 1; q < n; q++) {
        const c = m[q];
        if (c.h >= st) { ex = Math.max(c.o, st); why = "停損"; tx = c.t + M15; break; }
        if (c.l <= tp) { ex = tp; why = "停利"; tx = c.t + M15; break; }
        if (q > k + 1 && isHour(q) && c.c > vw[q]) { ex = c.c; why = "站回VWAP"; tx = c.t + M15; break; }
        if (c.t + M15 >= te + p.hold * H1) { ex = c.c; why = "到期"; tx = c.t + M15; break; }
      }
      if (ex == null) { ex = m[n - 1].c; why = "到期"; tx = m[n - 1].t + M15; }
      const gross = (e - ex) / r, costR = cost * e / r;
      out.push({ cn, t: te, tx, R: gross - costR, gross, costR, why, side: "空", state: stateAt(te) });
      lastE = te; i = k + 1;
    }
  }
  return { res: seg(out), raw: out, nTrig, nFail };
}
{
  const base = BASE.I; const P14 = { up: UP0, fail: FAIL0, stop: 0.12, hold: 48, liq: 50e6, tp: 0.20 };
  const r = r14(P14), v = r.res, j = judge(base, v); const o = { base, res: v, judge: j, judgeAlt: judge(BASE.I2, v), nTrig: r.nTrig, nFail: r.nFail, neigh: {}, extra: {}, be: breakEven(r.raw) }; let np = 0, nn = 0;
  L.push("### R14 暴漲後失守 24h VWAP 確認空（≤48h）", "", `觸發（暴漲且過濾）${r.nTrig} 次，其中 96 根內失守 VWAP ${r.nFail} 次；損益兩平成本倍數 ${o.be}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("參考 日內B（≥5 億U）", BASE.I2), row("R14 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["漲幅 20%", { ...P14, up: UP0 * 0.8 }], ["漲幅 30%", { ...P14, up: UP0 * 1.2 }], ["失守 6.4%", { ...P14, fail: FAIL0 * 0.8 }], ["失守 9.6%", { ...P14, fail: FAIL0 * 1.2 }], ["停損 9.6%", { ...P14, stop: 0.096 }], ["停損 14.4%", { ...P14, stop: 0.144 }], ["持有 38h", { ...P14, hold: 38 }], ["持有 58h", { ...P14, hold: 58 }], ["成交額 4,000 萬", { ...P14, liq: 40e6 }], ["成交額 6,000 萬", { ...P14, liq: 60e6 }]]) { const vv = r14(p).res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm, p] of [["對照組：只取沒失守的暴漲，觀察期結束直接空", { ...P14, ctrl: true }], ["停利 0.84（−16%）", { ...P14, tp: 0.16 }], ["停利 0.76（−24%）", { ...P14, tp: 0.24 }], ["成本 ×1.5", { ...P14, costK: 1.5 }], ["成本 ×2", { ...P14, costK: 2 }]]) { const rr = r14(p), vv = rr.res, nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj, nTrig: rr.nTrig, nFail: rr.nFail }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 出場原因（全期）：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對日內B：${J(o.judgeAlt)}`, "");
  OUT.exp2 = o; console.log("R14 完成", elapsed());
}
{
  const ok = [...DEPTS.filter(S => OUT.exp1[S.key].ok).map(S => "S3 攻擊K（" + S.name + "）"), OUT.exp2.ok ? "R14 暴漲後失守 VWAP 空" : null].filter(Boolean);
  L.push(`結論：${ok.length ? `合格：${ok.join("、")}（以新增一組虛擬單並列上線，不動既有組）` : `S3 攻擊K（波段A${OUT.exp1.A.note}、波段B${OUT.exp1.B.note}）、R14${OUT.exp2.note || "（真的差）"}，都不合格或判不了`}。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report22.md", L.join("\n"));
await fs.writeFile("lab/results22.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
