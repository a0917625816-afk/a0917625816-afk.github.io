// 策略實驗室 第八輪（10/31 會議決議）：
// 實驗一：成本模型修正——依「近 30 天日均成交額」分級的滑價假設（取代固定 0.14%），重跑現行三組；並附日內「成交額門檻 ≥5 億U」變體。
// 實驗二：重大總經事件（FOMC／CPI／非農）前後暫停新開倉（事件日曆來自 Fed 與 BLS 官方封存頁，共 79 筆）。
// 鐵律：通過＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格。沒過就是沒過。
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ema, sma, atr } from "../scripts/ta-core.mjs";

let SPLIT = 0.65, N_COINS = +(process.env.N_COINS || 40), MONTHS = +(process.env.MONTHS || 30);
const M15 = 9e5, H4 = 144e5, D1 = 864e5, H1 = 36e5;
const EXCLUDE = new Set("MU MUU SKHYNIX TSM SOXL SNDK SNXX QQQ SPY NVDA TSLA AAPL AMZN META GOOGL MSFT COIN MSTR HOOD XAU XAG WDC AMD INTC CRCL PAXG XAUT USDC FDUSD USDE".split(" "));

async function binance15(base) {
  const sym = base + "USDT", out = [], now = new Date();
  for (let k = MONTHS; k >= 1; k--) {
    const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
    const r = await fetch(`https://data.binance.vision/data/futures/um/monthly/klines/${sym}/15m/${sym}-15m-${ym}.zip`);
    if (r.status === 404) continue; if (!r.ok) throw new Error("HTTP " + r.status);
    const f = `/tmp/k-${sym}.zip`; await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
    const csv = execFileSync("unzip", ["-p", f], { maxBuffer: 1 << 28 }).toString();
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
const coins = Object.keys(data); console.log("幣種", coins.length);

// 濾網
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bE = ema(bD.map(x => x.c), 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rk = new Map();
function top(day) { if (rk.has(day)) return rk.get(day); const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rk.set(day, s); return s; }
const okF = (cn, t) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1).has(cn);

// 指標預先算好
const pre = {};
for (const cn of coins) for (const tf of ["h", "m"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }

// 近30天日均成交額（USDT，用日K 收盤×量估算），以前一天為準
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }

// ---- 實驗一：分級成本模型（來回總成本＝手續費＋滑價，依成交額分級）----
// ≥20 億U：0.14%（現行假設，大幣）；5～20 億：0.25%；1～5 億：0.40%；<1 億：0.70%；沒有成交額資料：0.40%
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const flatCost = () => 0.0014;
const COSTMODELS = { flat: { name: "固定 0.14%（現行）", fn: flatCost }, tier: { name: "分級成本（依成交額）", fn: tieredCost } };

// ---- 實驗二：重大總經事件日曆（美東時間；來源：federalreserve.gov FOMC calendars、bls.gov news.release/archives）----
const EVENTS = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"]];
// 美東→UTC：夏令時間（3 月第二個週日～11 月第一個週日）+4h，其餘 +5h
function nthSunday(y, mo, n) { const d = new Date(Date.UTC(y, mo, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return Date.UTC(y, mo, first + 7 * (n - 1)); }
function etToUtc(dateStr, hm) { const [y, mo, d] = dateStr.split("-").map(Number); const [hh, mm] = hm.split(":").map(Number); const local = Date.UTC(y, mo - 1, d, hh, mm); const dstStart = nthSunday(y, 2, 2) + 2 * H1, dstEnd = nthSunday(y, 10, 1) + 2 * H1; const off = (local >= dstStart && local < dstEnd) ? 4 : 5; return local + off * H1; }
const EV = EVENTS.map(([d, t, k]) => ({ t: etToUtc(d, t), k })).sort((a, b) => a.t - b.t);
console.log("事件數", EV.length, "首筆", new Date(EV[0].t).toISOString(), "末筆", new Date(EV.at(-1).t).toISOString());
// BTC 15m 振幅表（事件後 1 小時內任一根 (高-低)/開 > 1.5% → 視為「大波動事件」）
const b15 = data.BTC.m;
function btcShock(t0, t1) { let lo = 0, hi = b15.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (b15[m].t < t0) lo = m + 1; else hi = m; } for (let i = lo; i < b15.length && b15[i].t < t1; i++) { const b = b15[i]; if ((b.h - b.l) / b.o > 0.015) return true; } return false; }
// 事件窗口：W1 = 前 2h～後 1h，若事件後 1h 內 BTC 15m 振幅 >1.5% 則延長到後 4h（觀察員1 規則）；W2 = 前 4h～後 4h（簡化版）
const EVW = {
  none: { name: "不暫停", block: () => false },
  W1: { name: "前2h～後1h（BTC 劇震延長到後4h）", block: t => EV.some(e => t >= e.t - 2 * H1 && (t < e.t + H1 || (t < e.t + 4 * H1 && btcShock(e.t, e.t + H1)))) },
  W2: { name: "前4h～後4h", block: t => EV.some(e => t >= e.t - 4 * H1 && t < e.t + 4 * H1) },
};

function passF(cn, t, f) {
  if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; }
  return true;
}
function quality(P, i, q) {
  const b = P.c[i], rng = b.h - b.l;
  if (q.vol && !(b.v > q.vol * P.v20[i])) return false;
  if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false;
  return true;
}
function trades(cn, kind, q, x, f, costFn, blockFn) {
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = kind === "swing" ? 2 : 6;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null;
      const stop = pos.st;
      if (b.l <= stop) ex = Math.min(b.o, stop);
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing") { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) ex = b.c; }
        else if (b.t + M15 >= pos.dayEnd) ex = b.c;
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const R = pos.real + left * (ex - pos.e) / pos.r - pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R }); pos = null; }
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
    pos = { e, r, st: e - r, t, real: 0, took: false, dayEnd: (dk(b.t) + 1) * D1, cost: costFn(cn, t) };
  }
  return out;
}
function portfolio(ts0, from, to) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0;
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  for (const x of ts) { settle(x.t); if (open.length >= 5 || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1) };
}
const STRATS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: { tp: 0, f: 0, be: false }, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: { tp: 1, f: 0.33, be: true }, f: {} },
  { key: "I", name: "日內（量能＋收盤強度＋成交額≥1億U）", kind: "intra", q: { vol: 1.5, cs: 0.6 }, x: { tp: 0, f: 0, be: false }, f: { liq: 100 } },
];
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
function run(S, cm, ev, fOverride) {
  const tr = coins.flatMap(cn => trades(cn, S.kind, S.q, S.x, fOverride || S.f, COSTMODELS[cm].fn, EVW[ev].block));
  return { IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity) };
}
const row = (label, r) => `| ${label} | ${r.IS.win}%/${r.IS.avgR}/${r.IS.dd}%（${r.IS.n}）| ${r.OOS.win}%/${r.OOS.avgR}/${r.OOS.dd}%（${r.OOS.n}）| ${r.ALL.win}%/${r.ALL.avgR}/${r.ALL.dd}%/${r.ALL.n} |`;
const HDR = ["| 版本 | 樣本內 勝率/平均R/回撤（筆數） | 樣本外 勝率/平均R/回撤（筆數） | 全期 勝率/平均R/回撤/筆數 |", "|---|---|---|---|"];
// 鐵律判定：變體 vs 基準，樣本內、樣本外都要：勝率提高、平均R ≥ 90%、回撤 ≤ 1.2 倍；樣本外筆數 ≥ 30
function judge(base, v) {
  const ok = (b, x) => x.n >= 30 && x.win > b.win && x.avgR >= 0.9 * b.avgR && x.avgR > 0 && x.dd <= 1.2 * b.dd + 1e-9;
  const is = ok(base.IS, v.IS), oos = ok(base.OOS, v.OOS);
  const why = [];
  for (const [nm, b, x] of [["樣本內", base.IS, v.IS], ["樣本外", base.OOS, v.OOS]]) {
    if (x.n < 30) why.push(`${nm}筆數 ${x.n} < 30`);
    if (!(x.win > b.win)) why.push(`${nm}勝率沒提高（${b.win}→${x.win}）`);
    if (!(x.avgR >= 0.9 * b.avgR && x.avgR > 0)) why.push(`${nm}平均R 低於 90%（${b.avgR}→${x.avgR}）`);
    if (!(x.dd <= 1.2 * b.dd + 1e-9)) why.push(`${nm}回撤超過 1.2 倍（${b.dd}%→${x.dd}%）`);
  }
  return { pass: is && oos, why };
}

const OUT = { created: new Date().toISOString(), tiers: TIERS, events: EV.length, exp1: {}, exp2: {} };
const L = ["# 策略實驗室 第八輪：成本模型修正＋重大事件暫停開倉", "", `產生時間：${OUT.created}；幣種 ${coins.length}；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}`, ""];

// ===== 實驗一 =====
L.push("## 實驗一：分級成本模型（依近 30 天日均成交額）", "", "假設（來回總成本＝手續費＋滑價）：≥20 億U 0.14%；5～20 億 0.25%；1～5 億 0.40%；<1 億 0.70%。", "判定：分級成本下樣本內、樣本外平均R都 > 0，且全期平均R ≥ 固定 0.14% 下的 50%（同第七輪標準）。", "");
for (const S of STRATS) {
  const flat = run(S, "flat", "none"), tier = run(S, "tier", "none");
  const pass = tier.IS.avgR > 0 && tier.OOS.avgR > 0 && tier.ALL.avgR >= 0.5 * flat.ALL.avgR;
  OUT.exp1[S.key] = { name: S.name, flat, tier, pass };
  L.push(`### ${S.name}`, "", ...HDR, row("固定 0.14%（現行）", flat), row("分級成本", tier), "", `判定：${pass ? "**通過**（分級成本下仍有正期望值）" : "**不通過**（換成分級成本後優勢消失或大幅縮水）"}`, "");
  if (S.key === "I") {
    // 變體：日內成交額門檻拉到 ≥5 億U（成本自動落到 0.25% 級），用鐵律跟「日內（分級成本）」比
    const v = run(S, "tier", "none", { liq: 500 });
    const j = judge(tier, v);
    OUT.exp1.I500 = { name: "日內 成交額≥5億U（分級成本）", res: v, judge: j };
    L.push("#### 變體：日內成交額門檻 ≥5 億U（分級成本下，與上列「分級成本」日內比）", "", ...HDR, row("日內 ≥1億U（基準）", tier), row("日內 ≥5億U", v), "", `鐵律判定：${j.pass ? "**合格**" : "**不合格**"}${j.why.length ? "；原因：" + j.why.join("；") : ""}`, "");
  }
}

// ===== 實驗二 =====
L.push("## 實驗二：重大總經事件前後暫停新開倉", "", `事件：FOMC 決議、CPI、非農，2024-05～2026-10 共 ${EV.length} 筆（日期取自 Fed／BLS 官方封存頁）。已持倉不受影響，只擋新開倉。`, "基準與變體都用「分級成本」計算；固定 0.14% 另列參考。鐵律：樣本內、樣本外都要勝率提高、平均R ≥ 基準 90%、回撤 ≤ 1.2 倍，樣本外 ≥30 筆。", "");
for (const S of STRATS) {
  const base = run(S, "tier", "none"), baseFlat = run(S, "flat", "none");
  const rows = { base, baseFlat }; const js = {};
  L.push(`### ${S.name}`, "", ...HDR, row("基準（分級成本，不暫停）", base));
  for (const w of ["W1", "W2"]) { const v = run(S, "tier", w); rows[w] = v; js[w] = judge(base, v); L.push(row(`${EVW[w].name}`, v)); }
  L.push(row("參考：基準（固定 0.14%）", baseFlat));
  for (const w of ["W1", "W2"]) { const v = run(S, "flat", w); rows[w + "flat"] = v; L.push(row(`參考：${EVW[w].name}（固定 0.14%）`, v)); }
  L.push("");
  for (const w of ["W1", "W2"]) L.push(`鐵律判定 ${EVW[w].name}：${js[w].pass ? "**合格**" : "**不合格**"}${js[w].why.length ? "；原因：" + js[w].why.join("；") : ""}`);
  L.push("");
  OUT.exp2[S.key] = { name: S.name, rows, judge: js };
}
await fs.writeFile("lab/report8.md", L.join("\n"));
await fs.writeFile("lab/results8.json", JSON.stringify(OUT));
console.log(L.join("\n"));
