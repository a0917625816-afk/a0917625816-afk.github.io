// 策略實驗室 第十二輪（11/03 會議決議）
// 實驗一（市場狀態分類員）：用 BTC 日線把每天分成 趨勢上／趨勢下／盤整／恐慌（定義先寫死，見 STATE），
//   報告四組在各狀態的勝率與平均R，並以鐵律測「不在恐慌開單」「不在盤整開單」「只在趨勢上開單」三個過濾變體。
// 實驗二（上期決議）：重大總經事件前後暫停新開倉，套用於「日內 B（成交額≥5 億U）」：W1、W2 與觀察員1 新提的 W3。
// 不佔名額：
//   過擬合審查員：日內 B 參數敏感度（成交額門檻 3/4/5/6/7 億U、量能倍數 1.2/1.8、收盤強度 0.48/0.72、停損倍數 4.8/7.2）。
//   資料工程師：下載 Binance 公開資金費率（月檔）與未平倉量 metrics（日檔，近 12 個月），精簡成日資料 lab/data/fo-daily.json（<2MB）。
// 鐵律：通過＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格。沒過就是沒過。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30), OI_MONTHS = +(process.env.OI_MONTHS || 12);
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
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());

// ===== 資料工程師：資金費率＋未平倉量 → 精簡日資料 =====
// 來源：data.binance.vision 公開檔。fundingRate 月檔（欄位 calc_time, funding_interval_hours, last_funding_rate）；
// metrics 日檔（欄位 create_time, symbol, sum_open_interest, sum_open_interest_value, ...，每 5 分鐘一筆）。
// 輸出 lab/data/fo-daily.json：{ created, coins: { BASE: { fr: {day: 當日費率合計(%)}, oi: {day: [當日最後OI(USDT), 當日最高OI]} } } }
const FO = { created: new Date().toISOString(), note: "資金費率＝當日各次結算合計(%)；OI＝當日最後一筆 sum_open_interest_value 與當日最高（USDT）；day＝UTC 日序號 floor(t/86400000)", coins: {} };
async function loadFO() {
  if (process.env.MOCK) { for (const cn of coins) FO.coins[cn] = { fr: {}, oi: {} }; return; }
  const now = new Date(); const dk = t => Math.floor(t / D1);
  // 資金費率：月檔
  for (const cn of coins) {
    const sym = cn + "USDT", fr = {};
    for (let k = MONTHS; k >= 0; k--) {
      const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
      try { const csv = await fetchZipCsv(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${ym}.zip`, `/tmp/fr-${sym}.zip`); if (!csv) continue; for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 3 || isNaN(+x[0])) continue; const d = dk(+x[0]); fr[d] = +((fr[d] || 0) + (+x[2]) * 100).toFixed(5); } } catch (e) { console.log("費率失敗", sym, ym, e.message); }
    }
    FO.coins[cn] = { fr, oi: {} };
  }
  console.log("資金費率完成", elapsed());
  // 未平倉量：日檔（近 OI_MONTHS 個月），並行下載，時間預算 18 分鐘
  const days = []; const d0 = dk(Date.now()) - 1; for (let i = OI_MONTHS * 30; i >= 1; i--) days.push(d0 - i);
  const jobs = []; for (const cn of coins) for (const d of days) jobs.push([cn, d]);
  let idx = 0, ok = 0, miss = 0; const budget = T_START + 18 * 60000 + (Date.now() - T_START);
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
  FO.oiDays = { ok, miss, planned: jobs.length, done: idx };
  console.log("未平倉量完成", FO.oiDays, elapsed());
}
await loadFO();
await fs.mkdir("lab/data", { recursive: true });
{ const s = JSON.stringify(FO); console.log("fo-daily.json 大小", (s.length / 1e6).toFixed(2), "MB"); await fs.writeFile("lab/data/fo-daily.json", s); }
const foCov = coins.map(cn => { const f = FO.coins[cn] || { fr: {}, oi: {} }; return { cn, frDays: Object.keys(f.fr).length, oiDays: Object.keys(f.oi).length }; });

// ===== 濾網（同現行機器人）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rk = new Map();
function top(day) { if (rk.has(day)) return rk.get(day); const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rk.set(day, s); return s; }
const okF = (cn, t) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1).has(cn);

// ===== 實驗一：市場狀態分類（定義寫死，回測前不調）=====
// 以 BTC 日線、第 d 天收盤計算，套用於第 d+1 天的進場（跟濾網一樣用前一天）：
//   恐慌：5 日報酬 ≤ −8%，或 ATR14／收盤 ≥ 4.5%
//   趨勢上：非恐慌，且收盤高於 EMA50 達 3% 以上；趨勢下：非恐慌，且收盤低於 EMA50 達 3% 以上
//   盤整：其餘（收盤在 EMA50 ±3% 內）
const STATE_DEF = "恐慌＝BTC 5 日報酬 ≤ −8% 或 ATR14/收盤 ≥ 4.5%；趨勢上＝非恐慌且收盤 > EMA50×1.03；趨勢下＝非恐慌且收盤 < EMA50×0.97；盤整＝其餘";
const bA = atr(bD, 14), stateOf = new Map(), stateCount = { 趨勢上: 0, 趨勢下: 0, 盤整: 0, 恐慌: 0 };
bD.forEach((b, i) => {
  if (i < 50) return;
  const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c;
  let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * 1.03) s = "趨勢上"; else if (b.c < bE[i] * 0.97) s = "趨勢下"; else s = "盤整";
  stateOf.set(dk(b.t), s); stateCount[s]++;
});
const stateAt = t => stateOf.get(dk(t) - 1) || "未知";
const STATEF = {
  none: { name: "基準（不分狀態）", block: () => false },
  noPanic: { name: "恐慌不開單", block: t => stateAt(t) === "恐慌" },
  noRange: { name: "盤整不開單", block: t => stateAt(t) === "盤整" },
  trendOnly: { name: "只在趨勢上開單", block: t => stateAt(t) !== "趨勢上" },
};

// 指標預先算好
const pre = {};
for (const cn of coins) for (const tf of ["h", "m"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }

// ===== 實驗二：重大總經事件日曆（同第八輪；美東時間；來源：federalreserve.gov、bls.gov）=====
const EVENTS = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"]];
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
const b15 = data.BTC.m, b1h = agg(b15, H1);
function idxAt(arr, t0) { let lo = 0, hi = arr.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < t0) lo = m + 1; else hi = m; } return lo; }
function btcShock(t0, t1) { for (let i = idxAt(b15, t0); i < b15.length && b15[i].t < t1; i++) { const b = b15[i]; if ((b.h - b.l) / b.o > 0.015) return true; } return false; }
// 觀察員1（11/03）：事件後 4h 內任一根 1h 收盤較事件前最後一根 1h 收盤跌 ≥2% → 該 UTC 日結束前不再進場
const shockDrop = new Map(); for (const e of EV) { const i0 = idxAt(b1h, e.t) - 1; if (i0 < 0) continue; const ref = b1h[i0].c; let drop = false; for (let i = i0 + 1; i < b1h.length && b1h[i].t < e.t + 4 * H1; i++) if (b1h[i].c / ref - 1 <= -0.02) { drop = true; break; } shockDrop.set(e.t, drop); }
const EVW = {
  none: { name: "不暫停", block: () => false },
  W1: { name: "前2h～後1h（BTC 劇震延長到後4h）", block: t => EV.some(e => t >= e.t - 2 * H1 && (t < e.t + H1 || (t < e.t + 4 * H1 && btcShock(e.t, e.t + H1)))) },
  W2: { name: "前4h～後4h", block: t => EV.some(e => t >= e.t - 4 * H1 && t < e.t + 4 * H1) },
  W3: { name: "前2h～後4h，BTC 1h 收跌≥2% 則當日不再進場（觀察員1）", block: t => EV.some(e => (t >= e.t - 2 * H1 && t < e.t + 4 * H1) || (shockDrop.get(e.t) && t >= e.t && t < (dk(e.t) + 1) * D1)) },
};

function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function trades(cn, kind, q, x, f, blockFn, p = {}) {
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = p.stopK || (kind === "swing" ? 2 : 6);
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null; const stop = pos.st;
      if (b.l <= stop) ex = Math.min(b.o, stop);
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) ex = b.c; }
        else if (b.t + M15 >= pos.dayEnd) ex = b.c;
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const R = pos.real + left * (ex - pos.e) / pos.r - pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R, state: pos.state }); pos = null; }
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
    pos = { e, r, st: e - r, t, real: 0, took: false, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; const bs = byState[x.state] ||= { n: 0, w: 0, s: 0 }; bs.n++; if (x.R > 0) bs.w++; bs.s += x.R; }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const st = {}; for (const [k, v] of Object.entries(byState)) st[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: st };
}
const STRATS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: { tp: 0, f: 0, be: false }, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: { tp: 1, f: 0.33, be: true }, f: {} },
  { key: "I", name: "日內（成交額≥1億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: { tp: 0, f: 0, be: false }, f: { liq: 100 } },
  { key: "I2", name: "日內B（成交額≥5億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: { tp: 0, f: 0, be: false }, f: { liq: 500 } },
];
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
function run(S, blockFn = () => false, o = {}) {
  const tr = coins.flatMap(cn => trades(cn, S.kind, o.q || S.q, S.x, o.f || S.f, blockFn, o.p || {}));
  return { IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity) };
}
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
function judge(base, v) {
  const ok = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
  const is = ok(base.IS, v.IS), oos = ok(base.OOS, v.OOS); const why = [];
  for (const [nm, b, x] of [["樣本內", base.IS, v.IS], ["樣本外", base.OOS, v.OOS]]) {
    if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`);
    if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`);
    if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`);
    if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`);
  }
  return { pass: is && oos, why };
}
const J = j => `${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`;

const OUT = { created: new Date().toISOString(), coins: coins.length, stateDef: STATE_DEF, stateCount, exp1: {}, exp2: {}, overfit: {}, fo: { coverage: foCov, oiDays: FO.oiDays || null } };
const L = ["# 策略實驗室 第十二輪：市場狀態分類＋事件暫停（日內B）＋日內B 過擬合審查＋資金費率/OI 資料", "", `產生時間：${OUT.created}；幣種 ${coins.length}；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）`, ""];

// ===== 實驗一 =====
L.push("## 實驗一：市場狀態分類（BTC 日線，定義寫死）", "", `定義：${STATE_DEF}。狀態以前一天收盤判定，套用於當天進場。`, `日數分布：${Object.entries(stateCount).map(([k, v]) => `${k} ${v} 天`).join("、")}。注意：四組都要求 BTC > 日線 EMA50，所以「趨勢下」天數本來就不會有單。`, "");
const base1 = {};
for (const S of STRATS) {
  const base = run(S); base1[S.key] = base;
  L.push(`### ${S.name}`, "", "各狀態成績（全期）：", "", "| 狀態 | 筆數 | 勝率 | 平均R |", "|---|---|---|---|");
  for (const k of ["趨勢上", "盤整", "恐慌", "趨勢下", "未知"]) { const v = base.ALL.byState[k]; if (v) L.push(`| ${k} | ${v.n} | ${v.win}% | ${v.avgR} |`); }
  L.push("", "過濾變體（鐵律判定，與基準比）：", "", ...HDR, row("基準", base));
  const vs = {};
  for (const k of ["noPanic", "noRange", "trendOnly"]) { const v = run(S, STATEF[k].block); vs[k] = { res: v, judge: judge(base, v) }; L.push(row(STATEF[k].name, v)); }
  L.push("");
  for (const k of ["noPanic", "noRange", "trendOnly"]) L.push(`鐵律判定「${STATEF[k].name}」：${J(vs[k].judge)}`);
  L.push("");
  OUT.exp1[S.key] = { name: S.name, base, variants: vs };
}
console.log("實驗一完成", elapsed());

// ===== 實驗二 =====
const I2 = STRATS.find(s => s.key === "I2");
L.push("## 實驗二：重大總經事件前後暫停新開倉，套用於日內B", "", `事件：FOMC、CPI、非農 2024-05～2026-10 共 ${EV.length} 筆。已持倉不受影響，只擋新開倉。W3 為觀察員1（11/03）提的版本。`, "", ...HDR, row("日內B 基準（不暫停）", base1.I2));
{
  const js = {}, rows = {};
  for (const w of ["W1", "W2", "W3"]) { const v = run(I2, EVW[w].block); rows[w] = v; js[w] = judge(base1.I2, v); L.push(row(EVW[w].name, v)); }
  L.push("");
  for (const w of ["W1", "W2", "W3"]) L.push(`鐵律判定 ${EVW[w].name}：${J(js[w])}`);
  L.push("");
  OUT.exp2 = { base: base1.I2, rows, judge: js };
}
console.log("實驗二完成", elapsed());

// ===== 過擬合審查：日內B =====
L.push("## 過擬合審查：日內B 參數敏感度", "", "基準＝日內（成交額≥1 億U，分級成本）。日內B 上線時的判定是「≥5 億U 相對 ≥1 億U 合格」；這裡把主要參數各上下調 20%，看大部分變體是否仍合格。", "", ...HDR, row("日內 ≥1億U（基準）", base1.I));
{
  const vars = [
    ["門檻 3 億U", { f: { liq: 300 } }], ["門檻 4 億U", { f: { liq: 400 } }], ["門檻 5 億U（日內B 現行）", { f: { liq: 500 } }], ["門檻 6 億U", { f: { liq: 600 } }], ["門檻 7 億U", { f: { liq: 700 } }],
    ["5 億U＋量能 1.2 倍", { f: { liq: 500 }, q: { vol: 1.2, cs: 0.6 } }], ["5 億U＋量能 1.8 倍", { f: { liq: 500 }, q: { vol: 1.8, cs: 0.6 } }],
    ["5 億U＋收盤強度 0.48", { f: { liq: 500 }, q: { vol: 1.5, cs: 0.48 } }], ["5 億U＋收盤強度 0.72", { f: { liq: 500 }, q: { vol: 1.5, cs: 0.72 } }],
    ["5 億U＋停損 4.8×ATR", { f: { liq: 500 }, p: { stopK: 4.8 } }], ["5 億U＋停損 7.2×ATR", { f: { liq: 500 }, p: { stopK: 7.2 } }],
  ];
  let pass = 0; const res = {};
  for (const [nm, o] of vars) { const v = run(I2, () => false, o); const j = judge(base1.I, v); if (j.pass) pass++; res[nm] = { res: v, judge: j }; L.push(row(nm + (j.pass ? " ✅" : " ❌"), v)); }
  L.push("");
  for (const [nm] of vars) L.push(`「${nm}」：${J(res[nm].judge)}`);
  const verdict = pass >= Math.ceil(vars.length / 2);
  L.push("", `審查結論：${vars.length} 個變體中 ${pass} 個合格 → ${verdict ? "**通過審查**（大部分變體仍合格，日內B 維持上線）" : "**未通過審查**（合格變體不到一半，建議日內B 停止新開單、保留紀錄）"}`, "");
  OUT.overfit = { n: vars.length, pass, verdict, res };
}
console.log("過擬合審查完成", elapsed());

// ===== 資料工程 =====
L.push("## 資料工程：資金費率＋未平倉量（lab/data/fo-daily.json）", "", `來源 data.binance.vision 公開檔；費率月檔（全期）、OI 日檔（近 ${OI_MONTHS} 個月）。OI 下載：${JSON.stringify(FO.oiDays || "MOCK")}。`, "", "| 幣 | 費率天數 | OI 天數 |", "|---|---|---|");
for (const c of foCov) L.push(`| ${c.cn} | ${c.frDays} | ${c.oiDays} |`);
L.push("");
await fs.writeFile("lab/report12.md", L.join("\n"));
await fs.writeFile("lab/results12.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
