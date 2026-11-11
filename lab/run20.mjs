// 策略實驗室 第二十輪（11/11 會議決議）
// 資料整理（不佔名額）：固定幣清單 lab/data/coins.json（list19＝第十九輪 40 幣，之後所有輪次都用這份）；把波段A／B／日內 原本在「list19」「list18」兩份清單下重算，量化「換幾檔幣就差很多」的清單敏感度（第十九輪審查員發現 +0.37R vs +0.86R）。
// 審查表補測（lab-audit A 表第 4、7、8 關，不佔名額）：六個上線部門（波段A、波段B、日內、日內B、日內C、日內D）在 list19 下：成本 ×1／×1.5／×2；停損 ×0.5／0.75／1.25／1.5（參數高原）；按月拆開平均R（時間穩定）。
// 實驗一：R2 精修版（觀察員2 11/03，禁多濾網）：24h 漲幅 ≥15% 且 24h OI 增 ≥25% 且費率偏高 → 72 小時不做多該幣，次日回吐 ≥50% 延長到 5 天；套用於波段A、波段B、日內（原本＝各自的原規則）。
// 實驗二：R9 週末量縮壓縮 → 週一突破跟單（觀察員2 11/08；原本＝日內（≥1 億U），會前寫死）。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。
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
const LIST18 = process.env.MOCK ? ["BTC", "ETH", "SOL"] : CL.list18;
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

// ===== 六個部門 =====
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I", name: "日內（≥1 億U）", kind: "intra", q: QI, x: XA, f: { liq: 100 } },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
  { key: "I3", name: "日內C（日內B＋事件前後 4h 不開單）", kind: "intra", q: QI, x: XA, f: { liq: 500, ev: true } },
  { key: "I4", name: "日內D（日內＋BTC 趨勢上不開單）", kind: "intra", q: QI, x: XA, f: { liq: 100, trend: true } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, list18: U18, sens: {}, audit: {}, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第二十輪：固定幣清單＋審查表補測（六部門）＋R2 精修版禁多濾網＋R9 週末壓縮突破", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣、對照 list18 ${U18.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%、最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死（11/11 會議）：R2 精修版是濾網 → 原本＝套用的那個部門自己（波段A／波段B／日內各自判）；R9 週末壓縮持有 ≤24h → 原本＝日內（≥1 億U）。沒過就是沒過，不放寬。", "",
  "從本輪起所有回測固定用 lab/data/coins.json 的 list19（第十九輪的 40 幣）；list18 只用來量清單敏感度。", ""];

// ===== 資料整理：清單敏感度 =====
L.push("## 資料整理：幣清單敏感度（波段A／波段B／日內 原本，list19 vs list18）", "", "list18 有、list19 沒有：" + LIST18.filter(c => !LIST19.includes(c)).join("、") + "；list19 有、list18 沒有：" + LIST19.filter(c => !LIST18.includes(c)).join("、"), "", ...HDR);
for (const S of DEPTS.slice(0, 3)) {
  const r18 = seg(runRaw(S, UNI18)); const r19 = BASE[S.key];
  OUT.sens[S.key] = { list19: r19, list18: r18 };
  L.push(row(`${S.name}｜list19（固定清單）`, r19), row(`${S.name}｜list18`, r18));
  const only18 = U18.filter(c => !U19.includes(c)), only19 = U19.filter(c => !U18.includes(c));
  const pick = (p, cs) => cs.map(c => p.ALL.byCoin[c] ? `${c} ${p.ALL.byCoin[c].n} 筆／${p.ALL.byCoin[c].avgR}R` : `${c} 0 筆`).join("；");
  L.push(`| 　差異幣在各自清單的貢獻 | list18 獨有：${pick(r18, only18)} | list19 獨有：${pick(r19, only19)} | |`);
}
L.push("", "說明：兩份清單只差 6 檔幣，但排行前 10 名是在清單內互相比較，所以換幣會連帶改變其他幣能不能進前 10。差距越大，代表「40 檔怎麼選」本身就是一個沒寫死的參數——這就是為什麼之後固定用 list19。", "");

// ===== 審查表補測：六部門 成本 ×1.5／×2、停損高原、按月 =====
L.push("## 審查表補測（lab-audit A 表第 4、7、8 關）：六個上線部門，list19", "");
for (const S of DEPTS) {
  const base = BASE[S.key]; const o = { base, cost: {}, stop: {}, month: monthly(base.ALL), monthIS: monthly(base.IS), monthOOS: monthly(base.OOS) };
  L.push(`### ${S.name}`, "", ...HDR, row("原本（成本 ×1）", base));
  for (const k of [1.5, 2]) { const v = seg(costMul(RAW[S.key], k)); o.cost[k] = v; L.push(row(`　成本 ×${k}`, v)); }
  for (const k of [0.5, 0.75, 1.25, 1.5]) { const v = seg(runRaw(S, UNI19, { stopMul: k })); o.stop[k] = v; L.push(row(`　停損 ×${k}（${S.kind === "swing" ? 2 * k : 6 * k}×ATR）`, v)); }
  const c15 = o.cost[1.5], c2 = o.cost[2];
  const fric = (c15.IS.avgR > 0 && c15.OOS.avgR > 0) ? "×1.5 仍正 → 通過" : "×1.5 轉負 → **邊太薄（視同淘汰）**";
  const stops = Object.values(o.stop).filter(v => v.IS.avgR > 0 && v.OOS.avgR > 0).length;
  const plateau = stops >= 3 ? `停損 4 組中 ${stops} 組兩段皆正 → 高原` : `停損 4 組只 ${stops} 組兩段皆正 → **尖峰嫌疑**`;
  const m = o.month;
  L.push("", `摩擦壓力：${fric}（×2：樣本內 ${c2.IS.avgR}R／樣本外 ${c2.OOS.avgR}R）；參數高原：${plateau}；時間穩定：全期 ${m.months} 個月中 ${m.pos} 個月為正${m.top2 != null ? `，最好兩個月合計佔總R ${Math.round(m.top2 * 100)}%` : ""}（樣本外 ${o.monthOOS.months} 個月中 ${o.monthOOS.pos} 個月為正）`, "", `按月平均R（筆數）：${m.text}`, "");
  o.fric = fric; o.plateau = plateau; OUT.audit[S.key] = o;
  console.log("補測", S.key, elapsed());
}

// ===== 實驗一：R2 精修版（禁多濾網）=====
L.push("## 實驗一：R2 精修版 禁多濾網（觀察員2 11/03；套用於波段A、波段B、日內）", "",
  "定義（日線 UTC 收盤評估，隔日起算）：某幣當日漲幅 ≥15% 且 OI 日末較前日增 ≥25% 且費率日合計 ≥0.15%（＝8 小時平均 0.05%；我們只有日合計，用這個代替「最新 8h 費率 ≥0.05%」）→ 之後 72 小時該幣不做多；若次日收盤回吐當日漲幅 ≥50%，延長到 5 天（120 小時）。OI 只從 2025-05 起有資料，之前此濾網不會觸發（＝與原本相同），所以樣本內前 11 個月沒差別。審查：漲幅 12／18%、OI 20／30%、費率 0.12／0.18%、窗口 58／86 小時。另列：不看 OI（只漲幅＋費率，2024-05 起就能觸發）、成本 ×1.5／×2。", "");
const dayRet = (cn, d) => { const a = dc[cn].get(d), b = dc[cn].get(d - 1); return a && b ? a / b - 1 : NaN; };
function banMap(p) { // 回傳 cn → [[from,to],...]
  const m = {}; let nTrig = 0;
  for (const cn of coins) { const D = data[cn].d, arr = [];
    for (let i = 1; i < D.length; i++) { const d = dk(D[i].t), ret = dayRet(cn, d); if (!(ret >= p.up)) continue; const fr = frAt(cn, d); if (!(fr >= p.fr)) continue; if (!p.noOI) { const oc = oiChg(cn, d); if (!(oc >= p.oi)) continue; } nTrig++; let to = (d + 1) * D1 + p.win * H1; const r1 = dayRet(cn, d + 1); if (r1 <= -0.5 * ret) to = (d + 1) * D1 + 120 * H1; arr.push([(d + 1) * D1, to]); }
    m[cn] = arr; }
  return { m, nTrig };
}
const banFn = bm => (cn, t) => (bm.m[cn] || []).some(([a, b]) => t >= a && t < b);
const P2 = { up: 0.15, oi: 0.25, fr: 0.15, win: 72 };
const V2 = [["漲幅 12%", { ...P2, up: 0.12 }], ["漲幅 18%", { ...P2, up: 0.18 }], ["OI 20%", { ...P2, oi: 0.20 }], ["OI 30%", { ...P2, oi: 0.30 }], ["費率 0.12%", { ...P2, fr: 0.12 }], ["費率 0.18%", { ...P2, fr: 0.18 }], ["窗口 58h", { ...P2, win: 58 }], ["窗口 86h", { ...P2, win: 86 }]];
for (const S of DEPTS.slice(0, 3)) {
  const base = BASE[S.key]; const bm = banMap(P2); const raw = runRaw(S, UNI19, { ban: banFn(bm) }); const v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, nTrig: bm.nTrig, blocked: BASE[S.key].ALL.n - v.ALL.n, neigh: {}, extra: {} }; let np = 0, nn = 0;
  L.push(`### 套用於 ${S.name}（原本＝${S.name}）`, "", `濾網觸發 ${bm.nTrig} 次（幣×日）；原本 ${base.ALL.n} 筆 → 套用後 ${v.ALL.n} 筆`, "", ...HDR, row("原本（判定用）", base), row("R2 精修版 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of V2) { const vv = seg(runRaw(S, UNI19, { ban: banFn(banMap(p)) })), nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  { const vv = seg(runRaw(S, UNI19, { ban: banFn(banMap({ ...P2, noOI: true })) })), nj = judge(base, vv); o.extra["不看 OI"] = { res: vv, judge: nj }; L.push(row("　另列：不看 OI（只漲幅＋費率）" + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const k of [1.5, 2]) { const vv = seg(costMul(raw, k)); o.extra["成本×" + k] = { res: vv }; L.push(row(`　另列：基準 成本 ×${k}`, vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `被濾掉的單：${o.blocked} 筆；基準 分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}`, "");
  OUT.exp1[S.key] = o; console.log("R2", S.key, elapsed());
}

// ===== 實驗二：R9 週末量縮壓縮 → 週一突破跟單 =====
L.push("## 實驗二：R9 週末量縮壓縮 → 週一突破跟單（觀察員2 11/08；原本＝日內（≥1 億U））", "",
  "定義：週六至週日（UTC）48 小時成交量 < 前五個交易日（週一～週五）日均量，且週末高低振幅 < 前五日日均振幅 ×0.6，且週六、週日費率日合計絕對值皆 < 0.03% → 週一 00:00–12:00 UTC，15 分K 收盤突破週末高點 ×1.003 做多、跌破低點 ×0.997 做空（下一根開盤進場，每幣每週一次）；停損＝週末區間中點；+1.5R 停利或進場後 24 小時到期平倉；進場後 24 小時內有 CPI／FOMC／非農／PPI 不開單；先測近 30 日日均成交額 ≥5 億U 的幣；成本分級。審查：振幅 0.48／0.72、突破 0.24／0.36%。另列：成交額 ≥1 億U、停損 ×0.75／×1.25（中點往進場價／往另一端移）、停利 1.2／1.8R、成本 ×1.5／×2、量能寬鬆版（原定義「48 小時量 < 平日日均量」等於要求週末量砍半，可能幾乎不觸發；寬鬆版改成週末日均量 < 平日日均量，只另列、不作判定）、只多／只空分腿。", "");
function sim15(cn, side, i0, e, st, tp, maxT, costK = 1) {
  const m = data[cn].m, r = side * (e - st); if (!(r > 0) || r / e < 0.002) return null;
  const cost = tieredCost(cn, m[i0].t) * costK; let ex = null, why = "", tx = 0;
  for (let i = i0; i < m.length; i++) {
    const b = m[i]; if (b.t >= maxT) { ex = m[i - 1].c; why = "到期"; tx = b.t; break; }
    if (side > 0 ? b.l <= st : b.h >= st) { ex = side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; tx = b.t + M15; break; }
    if (tp != null && (side > 0 ? b.h >= tp : b.l <= tp)) { ex = tp; why = "停利"; tx = b.t + M15; break; }
  }
  if (ex == null) { const last = m[m.length - 1]; ex = last.c; why = "到期"; tx = last.t + M15; }
  return { cn, t: m[i0].t, tx, R: side * (ex - e) / r - cost * e / r, why, side: side > 0 ? "多" : "空", state: stateAt(m[i0].t) };
}
function r9(p) {
  const out = [];
  for (const cn of U19) { const D = data[cn].d, m = data[cn].m;
    for (let i = 7; i < D.length - 2; i++) {
      const dow = new Date(D[i].t).getUTCDay(); if (dow !== 6) continue; // 週六
      const sat = D[i], sun = D[i + 1]; if (!sun || new Date(sun.t).getUTCDay() !== 0) continue;
      const mon = (dk(sun.t) + 1) * D1; if (!m.length || m.at(-1).t < mon + 12 * H1) continue;
      // 前五個交易日（週一～週五）
      const wk = []; for (let j = i - 1; j >= 0 && wk.length < 5; j--) { const w = new Date(D[j].t).getUTCDay(); if (w >= 1 && w <= 5) wk.push(D[j]); }
      if (wk.length < 5) continue;
      const avgV = wk.reduce((a, b) => a + b.v, 0) / 5, avgRng = wk.reduce((a, b) => a + (b.h - b.l) / b.c, 0) / 5;
      const wH = Math.max(sat.h, sun.h), wL = Math.min(sat.l, sun.l), wRng = (wH - wL) / sun.c, wV = sat.v + sun.v;
      if (!(p.loose ? wV / 2 < avgV : wV < avgV)) continue; if (!(wRng < avgRng * p.k)) continue;
      const f1 = Math.abs(frAt(cn, dk(sat.t))), f2 = Math.abs(frAt(cn, dk(sun.t))); if (!(f1 < 0.03 && f2 < 0.03)) continue;
      const liq = LIQ[cn].get(dk(mon) - 1); if (!(liq >= p.liq * 1e6)) continue;
      const i0 = mIdx[cn].get(mon); if (i0 == null) continue;
      const mid = (wH + wL) / 2; let done = false;
      for (let k = i0; k < i0 + 48 && k + 1 < m.length && !done; k++) {
        const b = m[k]; let side = 0;
        if (b.c > wH * (1 + p.brk) && p.side !== "short") side = 1; else if (b.c < wL * (1 - p.brk) && p.side !== "long") side = -1;
        if (!side) continue; done = true;
        const te = m[k + 1].t; if (evNear(te, 0, 24 * H1)) break;
        const e = m[k + 1].o; let st = mid; const r0 = side * (e - mid); if (!(r0 > 0)) break; st = e - side * r0 * p.stopMul;
        const r = side * (e - st); const tr = sim15(cn, side, k + 1, e, st, e + side * p.tp * r, te + 24 * H1, p.costK || 1); if (tr) out.push(tr);
      }
    } }
  return seg(out);
}
{
  const base = BASE.I; const P9 = { k: 0.6, brk: 0.003, liq: 500, tp: 1.5, stopMul: 1 };
  const v = r9(P9), j = judge(base, v); const o = { base, res: v, judge: j, judgeAlt: judge(BASE.I2, v), neigh: {}, extra: {} }; let np = 0, nn = 0;
  L.push("### R9 週末壓縮突破（多空，≤24h）", "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("參考 日內B（≥5 億U）", BASE.I2), row("R9 基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, p] of [["振幅 0.48", { ...P9, k: 0.48 }], ["振幅 0.72", { ...P9, k: 0.72 }], ["突破 0.24%", { ...P9, brk: 0.0024 }], ["突破 0.36%", { ...P9, brk: 0.0036 }]]) { const vv = r9(p), nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm, p] of [["成交額 ≥1 億U", { ...P9, liq: 100 }], ["停損 ×0.75", { ...P9, stopMul: 0.75 }], ["停損 ×1.25", { ...P9, stopMul: 1.25 }], ["停利 1.2R", { ...P9, tp: 1.2 }], ["停利 1.8R", { ...P9, tp: 1.8 }], ["成本 ×1.5", { ...P9, costK: 1.5 }], ["成本 ×2", { ...P9, costK: 2 }], ["量能寬鬆版（週末日均量 < 平日日均量）", { ...P9, loose: true }], ["只多", { ...P9, side: "long" }], ["只空", { ...P9, side: "short" }]]) { const vv = r9(p), nj = judge(base, vv); o.extra[nm] = { res: vv, judge: nj }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌"), vv)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 出場原因（全期）：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分腿：${Object.entries(v.ALL.bySide).map(([k, x]) => `${k} ${x.n} 筆／${x.win}%／${x.avgR}R`).join("；")}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}；對日內B：${J(o.judgeAlt)}`, "");
  OUT.exp2 = o; console.log("R9 完成", elapsed());
}
{
  const ok = [...DEPTS.slice(0, 3).filter(S => OUT.exp1[S.key].ok).map(S => "R2 精修版（" + S.name + "）"), OUT.exp2.ok ? "R9 週末壓縮" : null].filter(Boolean);
  const weak = DEPTS.filter(S => /淘汰/.test(OUT.audit[S.key].fric) || /尖峰/.test(OUT.audit[S.key].plateau)).map(S => S.name);
  L.push(`結論：${ok.length ? `合格：${ok.join("、")}（以新增一組虛擬單並列上線，不動既有組）` : `R2 精修版（波段A${OUT.exp1.A.note}、波段B${OUT.exp1.B.note}、日內${OUT.exp1.I.note}）、R9${OUT.exp2.note || "（真的差）"}，都不合格或判不了`}。審查表補測：${weak.length ? `需要會議再審的部門：${weak.join("、")}` : "六個部門摩擦壓力與停損高原都過"}。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。`);
}
await fs.writeFile("lab/report20.md", L.join("\n"));
await fs.writeFile("lab/results20.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
