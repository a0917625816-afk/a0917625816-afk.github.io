// 策略實驗室 第十六輪（11/07 會議決議）
// 實驗一（出場研究員）：波段A 出場改良，進場完全不動：(a) 時間停損（第 20 根 4h 未達 +1R 平倉）、(b) +2R 後停損移到 +1R、之後 3×ATR 吊燈跟隨；(a)+(b) 合併。鐵律＝勝率提高、平均R ≥90%、回撤 ≤1.2 倍、樣本內外各 ≥30 筆；審查＝主要參數各上下 20%。
// 實驗二（市場狀態分類員）：趨勢上不開單（BTC 高於日線 EMA50 達 3% 時五組不開新單）與「只在盤整開單」。此假設是第十二輪事後看出來的，所以只用樣本外段判定，樣本內只列參考；審查＝門檻 2.4%／3.6%。
// 資料載入、濾網、分級成本沿用第八／十二／十五輪；過擬合審查放同一支腳本，不佔名額。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5, H1 = 36e5;
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));
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
function mock(base) { let s = [...base].reduce((x, c) => x + c.charCodeAt(0), 7) * 13; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const n = MONTHS * 30 * 96, out = []; let p = 100; const t0 = Math.floor(Date.now() / D1) * D1 - n * M15; for (let i = 0; i < n; i++) { const sg = 0.004, o = p, c = o * (1 + (rnd() - 0.5) * 2 * sg + Math.sin(i / 900 + s % 7) * sg * 0.15); out.push({ t: t0 + i * M15, o, h: Math.max(o, c) * (1 + rnd() * sg * 0.5), l: Math.min(o, c) * (1 - rnd() * sg * 0.5), c, v: 1000 * (1 + rnd()) }); p = c; } return out; }

const data = {};
const bx = JSON.parse(await fs.readFile("bingx.json", "utf8"));
const cands = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS).map(base => ({ base })) : [{ base: "BTC" }, ...bx.symbols.filter(x => x.base !== "BTC" && !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv)];
for (const s of cands) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(s.base) : await binance15(s.base); console.log(s.base, m.length); if (m.length < 35000) continue; data[s.base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", s.base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"]];
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());

// ===== 濾網（同現行機器人）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rk = new Map();
function top(day) { if (rk.has(day)) return rk.get(day); const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rk.set(day, s); return s; }
const okF = (cn, t) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1).has(cn);

// ===== 市場狀態分類（第十二輪定義，原封不動；門檻 3% 可調只為 ±20% 審查）=====
const STATE_DEF = "恐慌＝BTC 5 日報酬 ≤ −8% 或 ATR14/收盤 ≥ 4.5%；趨勢上＝非恐慌且收盤 > EMA50×(1+門檻)；趨勢下＝非恐慌且收盤 < EMA50×(1−門檻)；盤整＝其餘；門檻基準 3%";
const bA = atr(bD, 14);
function buildState(th) {
  const m = new Map(), cnt = { 趨勢上: 0, 趨勢下: 0, 盤整: 0, 恐慌: 0 };
  bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * (1 + th)) s = "趨勢上"; else if (b.c < bE[i] * (1 - th)) s = "趨勢下"; else s = "盤整"; m.set(dk(b.t), s); cnt[s]++; });
  return { at: t => m.get(dk(t) - 1) || "未知", cnt };
}
const ST3 = buildState(0.03), ST24 = buildState(0.024), ST36 = buildState(0.036);
const stateAt = ST3.at;

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }

// ===== 重大事件日曆（同第十二輪；日內 C 用）=====
const EVENTS = EVENTS_LIST;
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const W2 = t => EV.some(e => t >= e.t - 4 * H1 && t < e.t + 4 * H1);

// ===== 交易引擎（進場同現行四組；出場參數 x 可加時間停損／吊燈）=====
// x: { tp, f, be }（波段B 分批）；x.T＋x.minR：第 T 根 4h 若從未到過 +minR 就收盤平倉；x.lock/x.lockTo/x.ch：到 +lock R 後停損移到 +lockTo R，之後用 ch×ATR 吊燈（最高價−ch×ATR）跟隨
function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function trades(cn, kind, q, x, f, blockFn) {
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = kind === "swing" ? 2 : 6;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = pos.locked ? "吊燈" : "停損"; }
      else {
        pos.mfe = Math.max(pos.mfe, b.h);
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (x.lock && !pos.locked && b.h >= pos.e + x.lock * pos.r) { pos.locked = true; pos.hh = b.h; pos.st = Math.max(pos.st, pos.e + x.lockTo * pos.r); }
        if (pos.locked) { pos.hh = Math.max(pos.hh, b.h); pos.st = Math.max(pos.st, pos.hh - x.ch * a[i]); }
        if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
        else if (b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
        if (ex == null && x.T && i - pos.i >= x.T && pos.mfe < pos.e + x.minR * pos.r) { ex = b.c; why = "時間停損"; }
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const R = pos.real + left * (ex - pos.e) / pos.r - pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R, state: pos.state, why }); pos = null; }
      continue;
    }
    if (kind === "intra") { const day = dk(b.t); if (day === doneDay || b.t >= day * D1 + 20 * 36e5) continue; }
    let hi = -Infinity; for (let j = i - N; j < i; j++) hi = Math.max(hi, c[j].h);
    if (!(b.c > hi)) continue;
    if (kind === "swing" && !(b.c > P.e200[i])) continue;
    const t = c[i + 1].t; if (!okF(cn, t)) continue;
    if (kind === "intra") doneDay = dk(b.t);
    if (!quality(P, i, q)) continue;
    if (!passF(cn, t, f)) continue;
    if (blockFn(t)) continue;
    const e = c[i + 1].o, r = stopK * a[i]; if (!(r > 0) || r / e < 0.002) continue;
    pos = { e, r, st: e - r, t, i: i + 1, real: 0, took: false, locked: false, hh: 0, mfe: e, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; const bs = byState[x.state] ||= { n: 0, w: 0, s: 0 }; bs.n++; if (x.R > 0) bs.w++; bs.s += x.R; const bw = byWhy[x.why] ||= { n: 0, s: 0 }; bw.n++; bw.s += x.R; }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const st = {}; for (const [k, v] of Object.entries(byState)) st[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) };
  const wh = {}; for (const [k, v] of Object.entries(byWhy)) wh[k] = { n: v.n, avgR: +(v.s / v.n).toFixed(3) };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: st, byWhy: wh };
}
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true };
const STRATS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {}, blk: () => false },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {}, blk: () => false },
  { key: "I", name: "日內（成交額≥1億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: XA, f: { liq: 100 }, blk: () => false },
  { key: "I2", name: "日內B（成交額≥5億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: XA, f: { liq: 500 }, blk: () => false },
  { key: "I3", name: "日內C（日內B＋事件前後4h不開單）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: XA, f: { liq: 500 }, blk: W2 },
];
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
function run(S, o = {}) {
  const blk = o.block ? (t => S.blk(t) || o.block(t)) : S.blk;
  const tr = coins.flatMap(cn => trades(cn, S.kind, S.q, o.x || S.x, S.f, blk));
  return { IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity) };
}
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
const okSeg = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
function whySeg(nm, b, x) { const why = []; if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`); if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`); if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`); if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`); return why; }
// 鐵律：樣本內、樣本外都要過
function judge(base, v) { const why = [...whySeg("樣本內", base.IS, v.IS), ...whySeg("樣本外", base.OOS, v.OOS)]; return { pass: okSeg(base.IS, v.IS) && okSeg(base.OOS, v.OOS), why }; }
// 樣本外判定（事後看出來的假設只能用樣本外段）
function judgeOOS(base, v) { const why = whySeg("樣本外", base.OOS, v.OOS); const isOk = okSeg(base.IS, v.IS); return { pass: okSeg(base.OOS, v.OOS), why, isRef: isOk ? "樣本內也合格（參考）" : "樣本內不合格（參考）" }; }
const J = j => `${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`;

const OUT = { created: new Date().toISOString(), coins: coins.length, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第十六輪：出場改良（波段A）＋趨勢上不開單（樣本外驗證）", "", `產生時間：${OUT.created}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%、最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。沒過就是沒過，不放寬。", ""];

// ===== 實驗一：出場改良（波段A，進場不動）=====
const SA = STRATS[0], baseA = run(SA);
L.push("## 實驗一：波段A 出場改良（進場完全不動）", "", "候選 (a) 時間停損：進場後第 20 根 4h 若從未到過 +1R，收盤平倉。候選 (b) 到 +2R 後停損移到 +1R，之後用 3×ATR 吊燈（最高價 −3×ATR）跟隨；原本的「收盤跌破前 27 根低點」與 2ATR 初始停損都保留。(a)+(b) 合併版也列。", "",
  `基準 波段A 出場原因分布（全期）：${Object.entries(baseA.ALL.byWhy).map(([k, v]) => `${k} ${v.n} 筆（平均 ${v.avgR}R）`).join("、")}`, "", ...HDR, row("基準 波段A", baseA));
const EXA = { a: { ...XA, T: 20, minR: 1 }, b: { ...XA, lock: 2, lockTo: 1, ch: 3 }, ab: { ...XA, T: 20, minR: 1, lock: 2, lockTo: 1, ch: 3 } };
const NEIGH = {
  a: [["(a) 16 根", { ...XA, T: 16, minR: 1 }], ["(a) 24 根", { ...XA, T: 24, minR: 1 }], ["(a) +0.8R", { ...XA, T: 20, minR: 0.8 }], ["(a) +1.2R", { ...XA, T: 20, minR: 1.2 }]],
  b: [["(b) 觸發 +1.6R", { ...XA, lock: 1.6, lockTo: 1, ch: 3 }], ["(b) 觸發 +2.4R", { ...XA, lock: 2.4, lockTo: 1, ch: 3 }], ["(b) 鎖 +0.8R", { ...XA, lock: 2, lockTo: 0.8, ch: 3 }], ["(b) 鎖 +1.2R", { ...XA, lock: 2, lockTo: 1.2, ch: 3 }], ["(b) 吊燈 2.4×ATR", { ...XA, lock: 2, lockTo: 1, ch: 2.4 }], ["(b) 吊燈 3.6×ATR", { ...XA, lock: 2, lockTo: 1, ch: 3.6 }]],
};
const resA = {};
for (const [k, nm] of [["a", "(a) 時間停損 20 根未達 +1R"], ["b", "(b) +2R 鎖 +1R＋3×ATR 吊燈"], ["ab", "(a)+(b) 合併"]]) {
  const v = run(SA, { x: EXA[k] }); const j = judge(baseA, v); resA[k] = { res: v, judge: j, neigh: {} };
  L.push(row(nm + (j.pass ? " ✅" : " ❌"), v));
  for (const [nn, x] of (NEIGH[k] || [])) { const nv = run(SA, { x }); const nj = judge(baseA, nv); resA[k].neigh[nn] = { res: nv, judge: nj }; L.push(row("　" + nn + (nj.pass ? " ✅" : " ❌"), nv)); }
}
L.push("");
for (const [k, nm] of [["a", "(a) 時間停損"], ["b", "(b) 鎖利＋吊燈"], ["ab", "(a)+(b)"]]) {
  const r = resA[k]; const ns = Object.values(r.neigh), np = ns.filter(x => x.judge.pass).length;
  const review = ns.length ? `；審查：鄰近 ${ns.length} 組 ${np} 組合格 → ${np * 2 > ns.length ? "通過" : "未通過"}` : "";
  r.overfit = ns.length ? { n: ns.length, pass: np, ok: np * 2 > ns.length } : null;
  L.push(`鐵律判定「${nm}」：${J(r.judge)}${review}`);
  L.push(`　出場原因分布（全期）：${Object.entries(r.res.ALL.byWhy).map(([a, v]) => `${a} ${v.n} 筆（平均 ${v.avgR}R）`).join("、")}`);
}
L.push("", "說明：(a) 要過必須同時勝率提高且平均R 不掉超過 10%；時間停損把「橫著磨到停損」的單提早結束，勝率通常不升反降（提早認輸變成小虧），所以主要看它能否把回撤壓低又不傷平均R。(b) 吊燈會砍掉部分大趨勢單的尾巴，平均R 可能掉，勝率應提高。", "");
OUT.exp1 = { base: baseA, res: resA };
console.log("實驗一完成", elapsed());

// ===== 實驗二：趨勢上不開單（樣本外驗證）=====
L.push("## 實驗二：趨勢上不開單（市場狀態分類員，樣本外驗證）", "", `定義：${STATE_DEF}。狀態以前一天收盤判定，套用於當天進場。候選規則 V1＝四組在「趨勢上」不開新單；V2＝只在「盤整」開單（趨勢上與恐慌都不開）。`,
  "這條假設是第十二輪用同一份資料事後看出來的，所以**只用 2025-12-29 之後的樣本外段判定**（勝率提高、平均R ≥90%、回撤 ≤1.2 倍、≥30 筆），樣本內段只列參考不算分。審查：門檻 2.4%／3.6% 兩個變體在樣本外也要過半。", "",
  `日數分布（門檻 3%）：${Object.entries(ST3.cnt).map(([k, v]) => `${k} ${v} 天`).join("、")}；（2.4%）${Object.entries(ST24.cnt).map(([k, v]) => `${k} ${v}`).join("、")}；（3.6%）${Object.entries(ST36.cnt).map(([k, v]) => `${k} ${v}`).join("、")}`, "");
const V = {
  V1: { name: "V1 趨勢上不開單", mk: S => t => S.at(t) === "趨勢上" },
  V2: { name: "V2 只在盤整開單", mk: S => t => S.at(t) !== "盤整" },
};
let passCount = 0;
for (const S of STRATS) {
  const base = S.key === "A" ? baseA : run(S);
  L.push(`### ${S.name}`, "", `各狀態成績（樣本外）：${["趨勢上", "盤整", "恐慌", "未知"].map(k => { const v = base.OOS.byState[k]; return v ? `${k} ${v.n} 筆／${v.win}%／${v.avgR}R` : null; }).filter(Boolean).join("；") || "無"}`, "", ...HDR, row("基準", base));
  const out = { base, variants: {} };
  for (const vk of ["V1", "V2"]) {
    const v = run(S, { block: V[vk].mk(ST3) }); const j = judgeOOS(base, v);
    const n24 = run(S, { block: V[vk].mk(ST24) }), n36 = run(S, { block: V[vk].mk(ST36) }); const j24 = judgeOOS(base, n24), j36 = judgeOOS(base, n36);
    const np = [j24, j36].filter(x => x.pass).length; const ok = j.pass && np >= 1;
    if (ok) passCount++;
    out.variants[vk] = { res: v, judge: j, neigh: { "2.4%": { res: n24, judge: j24 }, "3.6%": { res: n36, judge: j36 } }, overfit: { pass: np, n: 2 }, ok };
    L.push(row(V[vk].name + (ok ? " ✅" : " ❌"), v), row("　門檻 2.4%" + (j24.pass ? " ✅" : " ❌"), n24), row("　門檻 3.6%" + (j36.pass ? " ✅" : " ❌"), n36));
  }
  L.push("");
  for (const vk of ["V1", "V2"]) { const o = out.variants[vk]; L.push(`樣本外判定「${V[vk].name}」：${J(o.judge)}（${o.judge.isRef}；審查 ${o.overfit.pass}/2 過）→ ${o.ok ? "**合格**" : "**不合格**"}`); }
  L.push("");
  OUT.exp2[S.key] = out;
}
L.push(`實驗二總結：五組 × 兩個候選共 10 個判定，合格 ${passCount} 個。合格的組才會以「新增一組虛擬單並列比較」上線，不動現有組；沒過就是沒過。`, "");
console.log("實驗二完成", elapsed());

await fs.writeFile("lab/report16.md", L.join("\n"));
await fs.writeFile("lab/results16.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
