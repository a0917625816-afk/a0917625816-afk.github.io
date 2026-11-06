// 策略實驗室 第十四輪：做空版波段（BTC 跌破 EMA50 時）。資料載入、濾網、分級成本沿用第八輪。
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

// ===================== 第十四輪：BTC 跌破 EMA50 時的做空版波段（11/03 會議裁決為下期第一優先）=====================
// 定義（做空研究員）：BTC 日線前一天收盤 < EMA50；幣種取 20 日跌幅前 10 名（報酬 < 0）；4h 收盤跌破前 55 根低點且在 4h EMA200 之下 → 次根開盤做空；
// 停損 2×ATR14；收盤站上前 27 根高點出場。B 版：跌 1R 先平 1/3、剩下停損移到成本。
// 合格（新一組並列上線的標準）：分級成本下 樣本內、樣本外平均R 都 > 0、樣本外 ≥ 30 筆；鄰近參數（N 40/70、停損 1.6/2.4 ATR、出場 22/32 根）多數也 > 0；成本 0.40% 壓力測試平均R 仍 > 0。
const okS = (cn, t) => btcUp.get(dk(t) - 1) === false && bottom(dk(t) - 1).has(cn);
const rkB = new Map();
function bottom(day) { if (rkB.has(day)) return rkB.get(day); const sc = []; for (const cn of coins) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => x[1] - y[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] < 0).map(x => x[0])); rkB.set(day, s); return s; }
function shortTrades(cn, p, costFn) {
  const P = pre[cn].h, c = P.c, a = P.a, out = []; let pos = null;
  for (let i = Math.max(p.N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.h >= pos.st) { ex = Math.max(b.o, pos.st); why = "stop"; }
      else {
        if (p.partial && !pos.took && b.l <= pos.e - pos.r) { pos.took = true; pos.real += 1 / 3; pos.st = Math.min(pos.st, pos.e - 0.05 * pos.r); }
        let hi = -Infinity; for (let j = i - p.M; j < i; j++) hi = Math.max(hi, c[j].h); if (b.c > hi) { ex = b.c; why = "exit"; }
      }
      if (ex != null) { const left = pos.took ? 2 / 3 : 1, R = pos.real + left * (pos.e - ex) / pos.r - costFn(cn, pos.t) * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + H4, R, stopPct: pos.r / pos.e }); pos = null; }
      continue;
    }
    let lo = Infinity; for (let j = i - p.N; j < i; j++) lo = Math.min(lo, c[j].l);
    if (!(b.c < lo) || !(b.c < P.e200[i])) continue;
    const t = c[i + 1].t; if (!okS(cn, t)) continue;
    const e = c[i + 1].o, r = p.k * a[i]; if (!(r > 0)) continue;
    pos = { e, r, st: e + r, t, real: 0, took: false };
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
const t0 = Math.min(...coins.map(cn => data[cn].h[0].t)) + 40 * D1, t1 = Math.max(...coins.map(cn => data[cn].h.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const bearDays = [...btcUp.entries()].filter(([d, u]) => !u && d * D1 >= t0).length, allDays = [...btcUp.keys()].filter(d => d * D1 >= t0).length;
const base = { N: 55, M: 27, k: 2 };
const VARS = [["基準 A 版（55/27/2ATR）", { ...base, partial: false }], ["基準 B 版（1R 先平 1/3＋保本）", { ...base, partial: true }],
  ["N=40", { ...base, N: 40 }], ["N=70", { ...base, N: 70 }], ["停損 1.6ATR", { ...base, k: 1.6 }], ["停損 2.4ATR", { ...base, k: 2.4 }], ["出場 22 根", { ...base, M: 22 }], ["出場 32 根", { ...base, M: 32 }]];
const flat40 = () => 0.004;
const res = VARS.map(([name, p]) => { const tr = coins.flatMap(cn => shortTrades(cn, p, tieredCost)), tr40 = coins.flatMap(cn => shortTrades(cn, p, flat40));
  return { name, p, IS: portfolio(tr, t0, cut), OOS: portfolio(tr, cut, Infinity), ALL: portfolio(tr, t0, Infinity), S40: portfolio(tr40, t0, Infinity) }; });
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const f = s => `${s.n}/${s.win}%/${s.avgR}/${s.cagr}%/${s.dd}%`;
const okv = r => r.IS.avgR > 0 && r.OOS.avgR > 0;
const L = ["# 策略實驗室 第十四輪：做空版波段（BTC 跌破 EMA50 時）", "", `產生時間：${new Date().toISOString()}；幣種 ${coins.length}；Binance 15 分K ${MONTHS} 個月合成 4h；分級成本；每筆風險 1%；最多 5 張`,
  `樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；這段期間 BTC 在 EMA50 之下的天數 ${bearDays}/${allDays}`, "",
  "欄位：筆數/勝率/平均R/年化/回撤", "", "| 版本 | 樣本內 | 樣本外 | 全期 | 成本 0.40% 壓力（全期） |", "|---|---|---|---|---|",
  ...res.map(r => `| ${r.name} | ${f(r.IS)} | ${f(r.OOS)} | ${f(r.ALL)} | ${f(r.S40)} |`), ""];
const A = res[0], Bv = res[1], neigh = res.slice(2), nOk = neigh.filter(okv).length;
const passA = okv(A) && A.OOS.n >= 30 && nOk >= 4 && A.S40.avgR > 0, passB = okv(Bv) && Bv.OOS.n >= 30 && Bv.S40.avgR > 0;
L.push("## 判定", "", `- A 版：${passA ? "**合格**" : "**不合格**"}（樣本內 ${A.IS.avgR}R、樣本外 ${A.OOS.avgR}R／${A.OOS.n} 筆、鄰近參數 ${nOk}/6 組兩段都 > 0、0.40% 成本 ${A.S40.avgR}R）`,
  `- B 版：${passB ? "**合格**" : "**不合格**"}（樣本內 ${Bv.IS.avgR}R、樣本外 ${Bv.OOS.avgR}R／${Bv.OOS.n} 筆、勝率 ${Bv.ALL.win}% vs A 版 ${A.ALL.win}%、0.40% 成本 ${Bv.S40.avgR}R）`, "",
  "合格才會以新一組虛擬單（做空波段）上線，與現有各組並列，不動既有規則。");
await fs.writeFile("lab/report14.md", L.join("\n"));
await fs.writeFile("lab/results14.json", JSON.stringify({ created: new Date().toISOString(), res, passA, passB }));
console.log(L.join("\n"));
