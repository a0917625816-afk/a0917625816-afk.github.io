// 策略實驗室 第十七輪（11/08 會議決議）
// 審查（不佔名額，過擬合審查員）：日內 D＝日內（≥1 億U）＋「趨勢上不開單」完整審查：門檻 2.1／2.4／2.7／3／3.3／3.6／3.9%、恐慌門檻 ±20%、V2 版同跑；基準 3% 兩段都過＋其餘變體過半才算合格。
// 資料（不佔名額，資料工程師）：OI 往前補 6 個月（寫回 lab/data/fo-daily.json，單檔 <2MB）；費率補最近 2 個月；PPI 公布日期（BLS 官網）加進事件日曆。
// 實驗一（CEO 網上研究 C5）：BTC／ETH 20 日時序動能多空（Coinbase Institutional 2022-09 對照組）。日線訊號、隔日開盤執行、每日檢查翻轉；變體：只多、只空、16／24 日、加 2ATR 停損。
// 實驗二（佇列 S1）：突破後回踩（4h）。多方照佇列定義；空方鏡像（覆盤員建議多空都測）。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。新策略以波段A 為「原本」比較（同第十四、十五輪）。
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
const cands = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS).map(base => ({ base })) : [{ base: "BTC" }, { base: "ETH" }, ...bx.symbols.filter(x => x.base !== "BTC" && x.base !== "ETH" && !EXCLUDE.has(x.base) && !/NCCO|USD$|^\d/.test(x.base)).sort((a, b) => b.qv - a.qv)];
for (const s of cands) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(s.base) : await binance15(s.base); console.log(s.base, m.length); if (m.length < 35000) continue; data[s.base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", s.base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"]];
// PPI 公布日（BLS 官網 schedule 逐筆核對，11/08 資料工程師；2025-10、2025-12 因聯邦撥款中斷沒有公布）
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());

// ===== 濾網（同現行機器人）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rk = new Map(), rkB = new Map();
function rank(day) { const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); return sc; }
function top(day) { if (rk.has(day)) return rk.get(day); const sc = rank(day); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rk.set(day, s); return s; }
function bottom(day) { if (rkB.has(day)) return rkB.get(day); const sc = rank(day); const s = new Set(sc.slice(-10).filter(x => x[1] < 0).map(x => x[0])); rkB.set(day, s); return s; }
const okF = (cn, t) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1).has(cn);
const okS = (cn, t) => btcUp.get(dk(t) - 1) === false && bottom(dk(t) - 1).has(cn);

// ===== 市場狀態分類（第十二輪定義；門檻與恐慌參數只為 ±20% 審查可調）=====
const STATE_DEF = "恐慌＝BTC 5 日報酬 ≤ −8% 或 ATR14/收盤 ≥ 4.5%；趨勢上＝非恐慌且收盤 > EMA50×(1+門檻)；趨勢下＝非恐慌且收盤 < EMA50×(1−門檻)；盤整＝其餘；門檻基準 3%";
const bA = atr(bD, 14);
function buildState(th, r5th = -0.08, apth = 0.045) {
  const m = new Map(), cnt = { 趨勢上: 0, 趨勢下: 0, 盤整: 0, 恐慌: 0 };
  bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= r5th || ap >= apth) s = "恐慌"; else if (b.c > bE[i] * (1 + th)) s = "趨勢上"; else if (b.c < bE[i] * (1 - th)) s = "趨勢下"; else s = "盤整"; m.set(dk(b.t), s); cnt[s]++; });
  return { at: t => m.get(dk(t) - 1) || "未知", cnt };
}
const ST3 = buildState(0.03);
const stateAt = ST3.at;

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m", "d"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }

// ===== 重大事件日曆（加 PPI）=====
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS_LIST.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const EVP = [...EVENTS_LIST, ...PPI_LIST].map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const W2 = t => EV.some(e => t >= e.t - 4 * H1 && t < e.t + 4 * H1);

// ===== 資料工程：OI 往前補 6 個月＋費率補最近 2 個月 → lab/data/fo-daily.json =====
let FO; try { FO = JSON.parse(await fs.readFile("lab/data/fo-daily.json", "utf8")); } catch { FO = { created: new Date().toISOString(), note: "", coins: {} }; }
const FO_BEFORE = {}; for (const cn of coins) { const f = FO.coins[cn] || { fr: {}, oi: {} }; FO_BEFORE[cn] = { fr: Object.keys(f.fr).length, oi: Object.keys(f.oi).length, oiMin: Math.min(...Object.keys(f.oi).map(Number), Infinity) }; }
async function extendFO() {
  if (process.env.MOCK) return;
  const now = new Date();
  for (const cn of coins) {
    const sym = cn + "USDT"; const f = FO.coins[cn] ||= { fr: {}, oi: {} };
    for (let k = 2; k >= 0; k--) {
      const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
      try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${ym}.zip`, `/tmp/fr-${sym}.zip`); if (!csv) continue; const fr = {}; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 3 || isNaN(+x[0])) continue; const d = dk(+x[0]); fr[d] = +((fr[d] || 0) + (+x[2]) * 100).toFixed(5); } Object.assign(f.fr, fr); } catch (e) { console.log("費率失敗", sym, ym, e.message); }
    }
  }
  console.log("費率補檔完成", elapsed());
  const jobs = [];
  for (const cn of coins) { const f = FO.coins[cn]; const have = new Set(Object.keys(f.oi).map(Number)); const mn = have.size ? Math.min(...have) : dk(Date.now()) - 1; for (let d = mn - 1; d >= mn - 183; d--) if (!have.has(d)) jobs.push([cn, d]); }
  let idx = 0, ok = 0, miss = 0; const budget = Date.now() + 15 * 60000;
  const worker = async () => {
    while (idx < jobs.length) {
      if (Date.now() > budget) return;
      const [cn, d] = jobs[idx++]; const sym = cn + "USDT", ds = new Date(d * D1).toISOString().slice(0, 10);
      try {
        const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/daily/metrics/${sym}/${sym}-metrics-${ds}.zip`, `/tmp/oi-${sym}-${ds}.zip`);
        await fs.unlink(`/tmp/oi-${sym}-${ds}.zip`).catch(() => {});
        if (!csv) { miss++; continue; }
        let last = NaN, mx = 0, lastT = "";
        for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 4 || x[0] === "create_time") continue; const v = +x[3]; if (!(v > 0)) continue; if (x[0] >= lastT) { lastT = x[0]; last = v; } mx = Math.max(mx, v); }
        if (last > 0) { FO.coins[cn].oi[d] = [Math.round(last), Math.round(mx)]; ok++; }
      } catch (e) { miss++; }
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  FO.oiExtend17 = { ok, miss, planned: jobs.length, done: idx };
  console.log("OI 補檔完成", FO.oiExtend17, elapsed());
}
await extendFO();
FO.updated = new Date().toISOString();
await fs.mkdir("lab/data", { recursive: true });
{ const s = JSON.stringify(FO); console.log("fo-daily.json 大小", (s.length / 1e6).toFixed(2), "MB"); if (!process.env.MOCK) await fs.writeFile("lab/data/fo-daily.json", s); }
const FO_AFTER = {}; for (const cn of coins) { const f = FO.coins[cn] || { fr: {}, oi: {} }; const ks = Object.keys(f.oi).map(Number); FO_AFTER[cn] = { fr: Object.keys(f.fr).length, oi: ks.length, oiMin: ks.length ? new Date(Math.min(...ks) * D1).toISOString().slice(0, 10) : "-" }; }

// ===== 交易引擎（日內 D 審查用，同第十六輪）=====
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
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = "停損"; }
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
        else if (b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
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
    pos = { e, r, st: e - r, t, i: i + 1, real: 0, took: false, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide) };
}
const XA = { tp: 0, f: 0, be: false };
const SA = { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {}, blk: () => false };
const SI = { key: "I", name: "日內（成交額≥1億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: XA, f: { liq: 100 }, blk: () => false };
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const seg = tr => ({ IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity) });
function run(S, o = {}) { const blk = o.block ? (t => S.blk(t) || o.block(t)) : S.blk; return seg(coins.flatMap(cn => trades(cn, S.kind, S.q, o.x || S.x, S.f, blk))); }
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
const okSeg = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
function whySeg(nm, b, x) { const why = []; if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`); if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`); if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`); if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`); return why; }
function judge(base, v) { const why = [...whySeg("樣本內", base.IS, v.IS), ...whySeg("樣本外", base.OOS, v.OOS)]; return { pass: okSeg(base.IS, v.IS) && okSeg(base.OOS, v.OOS), why }; }
const J = j => `${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`;
const bySt = p => Object.entries(p.byState).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";

const OUT = { created: new Date().toISOString(), coins: coins.length, data: {}, review: {}, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第十七輪：日內 D 完整審查＋C5 時序動能多空＋S1 突破後回踩", "", `產生時間：${OUT.created}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%、最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。新策略以波段A 當「原本」比較。沒過就是沒過，不放寬。", ""];

// ===== 資料工程報告 =====
L.push("## 資料工程：OI 往前補 6 個月＋費率補檔＋PPI 日期（lab/data/fo-daily.json）", "", `OI 補檔：${JSON.stringify(FO.oiExtend17 || "MOCK 略過")}；PPI 公布日 ${PPI_LIST.length} 筆已加入事件日曆（來源 BLS 官網；2025-10、2025-12 因撥款中斷停發）。`, "", "| 幣 | 費率天數 | OI 天數（前→後） | OI 最早日 |", "|---|---|---|---|");
for (const cn of coins.slice(0, 12)) L.push(`| ${cn} | ${FO_AFTER[cn].fr} | ${FO_BEFORE[cn].oi}→${FO_AFTER[cn].oi} | ${FO_AFTER[cn].oiMin} |`);
if (coins.length > 12) L.push(`| …（共 ${coins.length} 幣）| | | |`);
OUT.data = { before: FO_BEFORE, after: FO_AFTER, oiExtend: FO.oiExtend17 || null, ppi: PPI_LIST.length };
L.push("");

// ===== 審查：日內 D（日內 ≥1 億U ＋ 趨勢上不開單）=====
const baseA = run(SA), baseI = run(SI);
L.push("## 審查：日內 D＝日內（≥1 億U）＋趨勢上不開單（過擬合審查員，完整版）", "", `定義：${STATE_DEF}。狀態以前一天收盤判定。V1＝趨勢上不開新單；V2＝只在盤整開單。第十六輪基準 3% 兩段都過但 ±20% 只過 1/2，本輪補齊：門檻 2.1／2.4／2.7／3.3／3.6／3.9% ＋ 恐慌門檻 ±20%（5 日報酬 −6.4%／−9.6%、ATR 比 3.6%／5.4%）。合格＝基準 3% 兩段都過，且其餘 8 個變體過半。`, "",
  `日內基準各狀態（全期）：${bySt(baseI.ALL)}`, "", ...HDR, row("基準 日內（≥1 億U）", baseI));
const THS = [0.021, 0.024, 0.027, 0.03, 0.033, 0.036, 0.039];
const PANIC = [["恐慌 5日 −6.4%／ATR 3.6%", -0.064, 0.036], ["恐慌 5日 −9.6%／ATR 5.4%", -0.096, 0.054]];
const VDEF = { V1: { name: "V1 趨勢上不開單", mk: S => t => S.at(t) === "趨勢上" }, V2: { name: "V2 只在盤整開單", mk: S => t => S.at(t) !== "盤整" } };
for (const vk of ["V1", "V2"]) {
  const o = { base: null, neigh: {} }; let np = 0, nn = 0;
  for (const th of THS) { const S = buildState(th); const v = run(SI, { block: VDEF[vk].mk(S) }); const j = judge(baseI, v); const lbl = `門檻 ${(th * 100).toFixed(1)}%`; if (th === 0.03) o.base = { res: v, judge: j }; else { o.neigh[lbl] = { res: v, judge: j }; nn++; if (j.pass) np++; } L.push(row((th === 0.03 ? `${VDEF[vk].name} 基準 3%` : "　" + lbl) + (j.pass ? " ✅" : " ❌"), v)); }
  for (const [lbl, r5, ap] of PANIC) { const S = buildState(0.03, r5, ap); const v = run(SI, { block: VDEF[vk].mk(S) }); const j = judge(baseI, v); o.neigh[lbl] = { res: v, judge: j }; nn++; if (j.pass) np++; L.push(row("　" + lbl + (j.pass ? " ✅" : " ❌"), v)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = o.base.judge.pass && o.overfit.ok;
  OUT.review[vk] = o;
  L.push("", `審查判定「${VDEF[vk].name}」：基準 3% ${J(o.base.judge)}；變體 ${np}/${nn} 合格 → ${o.overfit.ok ? "審查通過" : "審查未通過"} → ${o.ok ? "**合格，可新增「日內 D」虛擬單並列**" : "**不合格，不上線**"}`, "");
}
L.push(`日內 D 結論：${OUT.review.V1.ok || OUT.review.V2.ok ? `合格版本：${["V1", "V2"].filter(k => OUT.review[k].ok).join("、")}。依規定以新增一組虛擬單並列上線，不動現有日內組。` : "V1、V2 都沒通過完整審查，不上線；日內組維持原樣。"}`, "");
console.log("審查完成", elapsed());

// ===== 實驗一：C5 BTC／ETH 20 日時序動能多空 =====
L.push("## 實驗一：C5 BTC／ETH 20 日時序動能多空（CEO 網上研究，Coinbase Institutional 2022-09 對照組）", "",
  "定義：各自看過去 20 日收盤報酬，為正做多、為負做空（變體：只多＝為負時空手；只空＝為正時空手）；日線訊號（UTC 收盤）、隔日開盤執行、每日檢查翻轉；原版無停損，變體加 2ATR(14 日) 停損。R 的單位＝進場時 2×日 ATR14（與波段A 一致，方便並列）；成本分級（BTC／ETH 多為 0.14%）。判定以波段A 為「原本」。", "");
function tsmom(cn, look, mode, stopK) {
  const P = pre[cn].d, c = P.c, a = P.a, out = [];
  let pos = null;
  for (let i = Math.max(look, 220); i < c.length - 1; i++) {
    const b = c[i], ret = c[i].c / c[i - look].c - 1; let want = ret > 0 ? 1 : ret < 0 ? -1 : 0;
    if (mode === "L" && want < 0) want = 0; if (mode === "S" && want > 0) want = 0;
    const nx = c[i + 1];
    if (pos) {
      let ex = null, why = "";
      if (stopK) { const st = pos.side > 0 ? pos.e - stopK * pos.a0 : pos.e + stopK * pos.a0; if (pos.side > 0 ? b.l <= st : b.h >= st) { ex = pos.side > 0 ? Math.min(b.o, st) : Math.max(b.o, st); why = "停損"; } }
      if (ex == null && want !== pos.side) { ex = nx.o; why = want === 0 ? "轉空手" : "翻轉"; }
      if (ex != null) { const R = pos.side * (ex - pos.e) / pos.r - pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: why === "停損" ? b.t + D1 : nx.t, R, state: pos.state, why, side: pos.side > 0 ? "多" : "空" }); pos = null; if (why === "停損") continue; }
      else continue;
    }
    if (want !== 0) { const e = nx.o, a0 = a[i], r = 2 * a0; if (!(r > 0)) continue; pos = { side: want, e, r, a0, t: nx.t, cost: tieredCost(cn, nx.t), state: btcUp.get(dk(nx.t) - 1) ? "BTC>EMA50" : "BTC<EMA50" }; }
  }
  return out;
}
const C5C = ["BTC", "ETH"].filter(cn => data[cn]);
const c5 = (look, mode, stopK) => seg(C5C.flatMap(cn => tsmom(cn, look, mode, stopK)));
const C5V = [["多空 20 日（原版）", 20, "LS", 0], ["　只多 20 日", 20, "L", 0], ["　只空 20 日", 20, "S", 0], ["　多空 16 日", 16, "LS", 0], ["　多空 24 日", 24, "LS", 0], ["　多空 20 日＋2ATR 停損", 20, "LS", 2], ["　只空 20 日＋2ATR 停損", 20, "S", 2]];
L.push(...HDR, row("原本 波段A", baseA));
const c5res = {};
for (const [nm, look, mode, sk] of C5V) { const v = c5(look, mode, sk); const j = judge(baseA, v); c5res[nm.trim()] = { res: v, judge: j }; L.push(row(nm + (j.pass ? " ✅" : " ❌"), v)); }
const c5b = c5res["多空 20 日（原版）"].res;
L.push("", `原版多空 全期分腿：${Object.entries(c5b.ALL.bySide).map(([k, v]) => `${k}單 ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；")}；分市場狀態：${bySt(c5b.ALL)}；出場原因：${Object.entries(c5b.ALL.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、")}`);
const c5s = c5res["只空 20 日"].res;
L.push(`只空版 樣本內／樣本外：${c5s.IS.n} 筆 ${c5s.IS.win}%／${c5s.IS.avgR}R，${c5s.OOS.n} 筆 ${c5s.OOS.win}%／${c5s.OOS.avgR}R；在 BTC<EMA50 狀態：${bySt(c5s.ALL)}`);
{ const main = c5res["多空 20 日（原版）"], ns = Object.entries(c5res).filter(([k]) => k !== "多空 20 日（原版）"), np = ns.filter(([, v]) => v.judge.pass).length;
  main.overfit = { n: ns.length, pass: np, ok: np * 2 > ns.length };
  L.push("", `判定「C5 多空 20 日」：${J(main.judge)}；審查：變體 ${np}/${ns.length} 合格 → ${main.overfit.ok ? "通過" : "未通過"}`);
  const anyPass = Object.entries(c5res).filter(([, v]) => v.judge.pass).map(([k]) => k);
  L.push(`C5 結論：${anyPass.length ? `合格版本：${anyPass.join("、")}（需同時通過審查才上線）` : "所有版本都不合格。慢訊號做空大幣在扣成本後沒有正期望值，或贏不過波段A；「BTC<EMA50 時空手」仍是目前最好的程式化答案。"}`, ""); OUT.exp1 = { base: baseA, res: c5res }; }
console.log("實驗一完成", elapsed());

// ===== 實驗二：S1 突破後回踩（4h；多方照佇列定義、空方鏡像）=====
L.push("## 實驗二：S1 突破後回踩（佇列定義，4h；多空都測）", "",
  "多方定義（照佇列，不改寫）：4h 收盤突破 55 根高點後，於 10 根內回到突破K高點 ±0.3ATR，且回踩K收在本身區間上半部才進場（次根開盤）；停損＝回踩低點 −0.2ATR；失效＝收盤跌破突破價（已進場則平倉）；出場沿用波段A（收盤跌破前 27 根低點）；濾網同波段A（4h EMA200 之上、BTC 日線 > EMA50、20 日漲幅前 10）。空方鏡像：跌破 55 根低點、回抽到突破K低點 ±0.3ATR、回抽K收在下半部、停損＝回抽高點 +0.2ATR、失效＝收盤站回突破價、出場＝收盤站上前 27 根高點、濾網＝EMA200 之下、BTC<EMA50、20 日跌幅後 10。審查：回踩窗口 8／12 根、容差 0.24／0.36ATR、停損緩衝 0.16／0.24ATR。", "");
// 失效價 lvl＝被突破的 55 根極值
function s1fix(cn, dir, p) {
  const P = pre[cn].h, c = P.c, a = P.a, out = []; const N = 55, M = 27;
  let pos = null, pend = null;
  for (let i = 210; i < c.length - 1; i++) {
    const b = c[i], nx = c[i + 1];
    if (pos) {
      let ex = null, why = "";
      if (dir > 0 ? b.l <= pos.st : b.h >= pos.st) { ex = dir > 0 ? Math.min(b.o, pos.st) : Math.max(b.o, pos.st); why = "停損"; }
      else if (dir > 0 ? b.c < pos.lvl : b.c > pos.lvl) { ex = b.c; why = "失效（收回突破價）"; }
      else { let ext = dir > 0 ? Infinity : -Infinity; for (let j = i - M; j < i; j++) ext = dir > 0 ? Math.min(ext, c[j].l) : Math.max(ext, c[j].h); if (dir > 0 ? b.c < ext : b.c > ext) { ex = b.c; why = dir > 0 ? "跌破27根低" : "站上27根高"; } }
      if (ex != null) { const R = dir * (ex - pos.e) / pos.r - pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + H4, R, state: pos.state, why, side: dir > 0 ? "多" : "空" }); pos = null; }
      continue;
    }
    if (pend) {
      if (i - pend.i > p.win || (dir > 0 ? b.c < pend.lvl : b.c > pend.lvl)) { pend = null; }
      else {
        const tol = p.tol * a[pend.i], rng = b.h - b.l, ref = pend.ref;
        const touched = dir > 0 ? (b.l <= ref + tol && b.l >= ref - tol) : (b.h >= ref - tol && b.h <= ref + tol);
        const strong = rng > 0 && (dir > 0 ? (b.c - b.l) / rng >= 0.5 : (b.h - b.c) / rng >= 0.5);
        if (touched && strong) {
          const t = nx.t, ok = dir > 0 ? okF(cn, t) : okS(cn, t), lvl = pend.lvl; pend = null;
          if (ok) { const e = nx.o, st = dir > 0 ? b.l - p.pad * a[i] : b.h + p.pad * a[i], r = dir * (e - st); if (r > 0 && r / e >= 0.002) pos = { e, r, st, lvl, t, cost: tieredCost(cn, t), state: stateAt(t) }; }
          continue;
        }
      }
    }
    if (!pend) {
      let ext = dir > 0 ? -Infinity : Infinity; for (let j = i - N; j < i; j++) ext = dir > 0 ? Math.max(ext, c[j].h) : Math.min(ext, c[j].l);
      const brk = dir > 0 ? (b.c > ext && b.c > P.e200[i]) : (b.c < ext && b.c < P.e200[i]);
      if (brk) pend = { i, lvl: ext, ref: dir > 0 ? b.h : b.l };
    }
  }
  return out;
}
const S1P = { win: 10, tol: 0.3, pad: 0.2 };
const S1N = [["回踩窗口 8 根", { ...S1P, win: 8 }], ["回踩窗口 12 根", { ...S1P, win: 12 }], ["容差 0.24ATR", { ...S1P, tol: 0.24 }], ["容差 0.36ATR", { ...S1P, tol: 0.36 }], ["停損緩衝 0.16ATR", { ...S1P, pad: 0.16 }], ["停損緩衝 0.24ATR", { ...S1P, pad: 0.24 }]];
const s1run = (dir, p) => seg(coins.flatMap(cn => s1fix(cn, dir, p)));
OUT.exp2 = {};
for (const [dir, nm] of [[1, "多方（照佇列定義）"], [-1, "空方（鏡像）"]]) {
  L.push(`### S1 ${nm}`, "", ...HDR, row("原本 波段A", baseA));
  const base = s1run(dir, S1P), j = judge(baseA, base); const o = { res: base, judge: j, neigh: {} }; let np = 0;
  L.push(row(`S1 ${nm}` + (j.pass ? " ✅" : " ❌"), base));
  for (const [nn, p] of S1N) { const v = s1run(dir, p), nj = judge(baseA, v); o.neigh[nn] = { res: v, judge: nj }; if (nj.pass) np++; L.push(row("　" + nn + (nj.pass ? " ✅" : " ❌"), v)); }
  o.overfit = { n: S1N.length, pass: np, ok: np * 2 > S1N.length }; o.ok = j.pass && o.overfit.ok;
  L.push("", `出場原因（全期）：${Object.entries(base.ALL.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、") || "無"}；分狀態：${bySt(base.ALL)}`);
  L.push(`判定「S1 ${nm}」：${J(j)}；審查：鄰近 ${S1N.length} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : "**不合格**"}`, "");
  OUT.exp2[dir > 0 ? "long" : "short"] = o;
}
L.push("合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；不合格就是不合格，不放寬標準。");
console.log("實驗二完成", elapsed());

await fs.writeFile("lab/report17.md", L.join("\n"));
await fs.writeFile("lab/results17.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
