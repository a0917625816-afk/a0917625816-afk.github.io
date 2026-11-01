// 策略實驗室 第九輪：斐波那契「延伸反轉」（使用者 11/01 提供的影片招數：黃金、納斯達克特別有效）
// 影片內容（MNQ1! 3 分K）：在一段整理區間畫斐波（1＝區間高點、0＝區間低點），價格跌破低點後，
// 打到 -0.5～-0.618 延伸區立刻強力反彈回 0 附近。
// 機械化規則（做多；做空完全對稱）：
//   1. 取前 N 根 K 的最高 H、最低 L 當區間，R = H − L，要求 R ≥ 2×ATR14（區間夠大才算）
//   2. 某根 K 跌破 L → 啟動設定；接下來 N/2 根內，若價格碰到進場價 E = L − e×R（e＝0.5 或 0.618）就進場做多
//      （限價單；若先碰到停損價或先回到 H，設定取消）
//      confirm 模式：碰到 E 之後，要等某根 K 收盤站回 E 之上才用收盤價進場
//   3. 停損 = L − s×R（s＝0.886 或 1.0）；目標 = L − 0.277R、L（0 線）或 L + 0.5R（區間中線）
//   4. 最多持有 N 根，到時收盤出場
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { atr } from "../scripts/ta-core.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "application/json" };
const SPLIT = 0.65;

async function yahoo(sym, interval, range) {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}&includePrePost=true`, { headers: UA });
      if (!r.ok) { console.log("yahoo", sym, interval, host, r.status); continue; }
      const j = await r.json(), res = j.chart?.result?.[0]; if (!res) continue;
      const q = res.indicators.quote[0], out = [];
      res.timestamp.forEach((t, i) => { if (q.open[i] != null && q.high[i] != null && q.low[i] != null && q.close[i] != null) out.push({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }); });
      return out;
    } catch (e) { console.log("yahoo 失敗", sym, e.message); }
  }
  return [];
}
async function binance(sym, iv, months) {
  const out = [], now = new Date();
  for (let k = months; k >= 1; k--) {
    const ym = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1)).toISOString().slice(0, 7);
    try {
      const r = await fetch(`https://data.binance.vision/data/futures/um/monthly/klines/${sym}/${iv}/${sym}-${iv}-${ym}.zip`);
      if (!r.ok) continue;
      const f = `/tmp/k9-${sym}.zip`; await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
      const csv = execFileSync("unzip", ["-p", f], { maxBuffer: 1 << 28 }).toString();
      for (const line of csv.split("\n")) { const x = line.split(","); if (x.length < 6 || isNaN(+x[0])) continue; out.push({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] }); }
    } catch (e) { console.log("binance 失敗", sym, ym, e.message); }
  }
  return out;
}
async function bingx(sym, iv) {
  const map = new Map(); let end = Date.now();
  for (let k = 0; k < 40; k++) {
    try {
      const r = await fetch(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${sym}&interval=${iv}&limit=1440&endTime=${end}`, { headers: UA });
      const j = await r.json(); if (j.code !== 0 || !Array.isArray(j.data) || !j.data.length) break;
      let oldest = Infinity; for (const x of j.data) { const t = +x.time; oldest = Math.min(oldest, t); map.set(t, { t, o: +x.open, h: +x.high, l: +x.low, c: +x.close }); }
      if (j.data.length < 50) break; end = oldest - 1; await sleep(120);
    } catch (e) { console.log("bingx 失敗", sym, e.message); break; }
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}
function mock(n, seed) { let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const out = []; let p = 100; for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (rnd() - 0.5) * 0.004); out.push({ t: 1.7e12 + i * 3e5, o, h: Math.max(o, c) * (1 + rnd() * 0.001), l: Math.min(o, c) * (1 - rnd() * 0.001), c }); p = c; } return out; }

// ===== 資料集：黃金、納斯達克是主角，BTC/ETH 當對照 =====
// cost＝來回成本（手續費＋滑價）占價格比例
const SETS = process.env.MOCK ? [
  { name: "模擬A", tf: "5m", cost: 0.0006, c: mock(20000, 7) }, { name: "模擬B", tf: "5m", cost: 0.0006, c: mock(20000, 11) },
] : [
  { name: "黃金期貨 GC 5分", tf: "5m", cost: 0.0004, c: await yahoo("GC=F", "5m", "60d") },
  { name: "黃金期貨 GC 15分", tf: "15m", cost: 0.0004, c: await yahoo("GC=F", "15m", "60d") },
  { name: "黃金期貨 GC 1小時", tf: "1h", cost: 0.0004, c: await yahoo("GC=F", "60m", "730d") },
  { name: "納指期貨 NQ 5分", tf: "5m", cost: 0.0004, c: await yahoo("NQ=F", "5m", "60d") },
  { name: "納指期貨 NQ 15分", tf: "15m", cost: 0.0004, c: await yahoo("NQ=F", "15m", "60d") },
  { name: "納指期貨 NQ 1小時", tf: "1h", cost: 0.0004, c: await yahoo("NQ=F", "60m", "730d") },
  { name: "黃金 BingX 15分", tf: "15m", cost: 0.0010, c: await bingx("NCCOGOLD2USD-USDT", "15m") },
  { name: "納指 BingX 15分", tf: "15m", cost: 0.0010, c: await bingx("NCSINASDAQ1002USD-USDT", "15m") },
  { name: "黃金 Binance XAU 5分", tf: "5m", cost: 0.0010, c: await binance("XAUUSDT", "5m", 12) },
  { name: "BTC 5分（對照）", tf: "5m", cost: 0.0014, c: await binance("BTCUSDT", "5m", 18) },
  { name: "ETH 5分（對照）", tf: "5m", cost: 0.0014, c: await binance("ETHUSDT", "5m", 18) },
  { name: "BTC 15分（對照）", tf: "15m", cost: 0.0014, c: await binance("BTCUSDT", "15m", 24) },
];
for (const s of SETS) console.log(s.name, "K 棒數", s.c.length, s.c[0] ? new Date(s.c[0].t).toISOString() : "", s.c.at(-1) ? new Date(s.c.at(-1).t).toISOString() : "");

function sim(c, cost, p) {
  const a = atr(c, 14), out = [], N = p.N, W = Math.max(4, N >> 1);
  let i = N + 15;
  while (i < c.length - 1) {
    let H = -Infinity, L = Infinity; for (let j = i - N; j < i; j++) { H = Math.max(H, c[j].h); L = Math.min(L, c[j].l); }
    const R = H - L, b = c[i];
    if (!(R >= 2 * a[i - 1]) || !(R > 0)) { i++; continue; }
    let dir = 0; if (b.l < L && !(b.h > H)) dir = 1; else if (b.h > H && !(b.l < L)) dir = -1;
    if (!dir || (p.side === "long" && dir < 0)) { i++; continue; }
    const base = dir > 0 ? L : H, top = dir > 0 ? H : L;
    const lvl = x => base - dir * x * R; // x>0 延伸方向；x<0 回到區間內
    const E = lvl(p.e), S = lvl(p.s), T = lvl(p.t), risk = Math.abs(E - S);
    let k = i, entered = null, touched = false;
    for (; k < Math.min(c.length - 1, i + W); k++) {
      const x = c[k];
      const hitE = dir > 0 ? x.l <= E : x.h >= E, hitS = dir > 0 ? x.l <= S : x.h >= S, backTop = dir > 0 ? x.h >= top : x.l <= top;
      if (k > i && backTop && !touched) break;
      if (p.mode === "limit") {
        if (hitE) { const fill = dir > 0 ? Math.min(x.o, E) : Math.max(x.o, E); if (k > i && (dir > 0 ? x.o <= S : x.o >= S)) break; entered = { k, e: k > i ? fill : E, sameBarStop: hitS }; break; }
      } else {
        if (hitS) break;
        if (hitE) touched = true;
        if (touched && (dir > 0 ? x.c > E : x.c < E)) { entered = { k: k + 1, e: c[k + 1].o, sameBarStop: false }; break; }
      }
    }
    if (!entered) { i = Math.max(i + 1, k); continue; }
    const e = entered.e, r = Math.abs(e - S); if (!(r > 0) || (dir > 0 ? e <= S : e >= S)) { i = entered.k + 1; continue; }
    let x = null, m = entered.k;
    if (entered.sameBarStop) x = S; // 同一根 K 同時碰到進場和停損，保守算停損
    else for (; m < Math.min(c.length, entered.k + N); m++) {
      const y = c[m];
      if (dir > 0 ? y.l <= S : y.h >= S) { x = m === entered.k ? S : (dir > 0 ? Math.min(y.o, S) : Math.max(y.o, S)); break; }
      if (p.mode === "limit" && m === entered.k) continue; // 進場那根 K 的高低點先後不明，不算目標
      if (dir > 0 ? y.h >= T : y.l <= T) { x = T; break; }
    }
    if (x == null) { m = Math.min(c.length - 1, entered.k + N - 1); x = c[m].c; }
    const Rm = dir * (x - e) / r - cost * e / r;
    const hr = new Date(c[entered.k].t).getUTCHours();
    out.push({ t: c[entered.k].t, R: Rm, dir, sess: hr < 7 ? "亞洲" : hr < 13 ? "歐洲" : "美國", riskPct: r / e });
    i = m + 1;
  }
  return out;
}
const stat = ts => { const n = ts.length, w = ts.filter(x => x.R > 0).length, s = ts.reduce((a, x) => a + x.R, 0), gp = ts.filter(x => x.R > 0).reduce((a, x) => a + x.R, 0), gl = -ts.filter(x => x.R < 0).reduce((a, x) => a + x.R, 0);
  let eq = 0, pk = 0, dd = 0; for (const x of ts) { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, pf: gl > 0 ? +(gp / gl).toFixed(2) : null, ddR: +dd.toFixed(1) }; };
const grid = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(z => vs.map(v => ({ ...z, [k]: v }))), [{}]);
const P = grid({ N: [24, 48, 96], e: [0.5, 0.618], s: [0.886, 1.0], t: [0.277, 0, -0.5], mode: ["limit", "confirm"], side: ["both"] }).filter(p => p.s > p.e);
const pn = p => `區間${p.N}根｜進場${p.e === 0.5 ? "-0.5" : "-0.618"}｜停損${p.s === 1 ? "-1.0" : "-0.886"}｜目標${p.t === 0.277 ? "-0.277" : p.t === 0 ? "0 線" : "區間中線"}｜${p.mode === "limit" ? "掛單" : "收回確認"}`;

const L = ["# 策略實驗室 第九輪：斐波那契延伸反轉（影片招數）", "", `產生時間：${new Date().toISOString()}`, "",
  "規則：前 N 根 K 畫區間（高＝1、低＝0），跌破低點（或突破高點）後，在 -0.5 或 -0.618 延伸位反向進場，停損 -0.886 或 -1.0，目標 -0.277／0 線／區間中線，最多持有 N 根。每個資料集前 65% 當樣本內、後 35% 當樣本外。成本：期貨 0.04%、BingX／Binance 0.10～0.14%（來回）。", "",
  "欄位：筆數/勝率/平均R/獲利因子PF/最大連續回落(R)", ""];
const all = [];
for (const S of SETS) {
  if (S.c.length < 1500) { L.push(`## ${S.name}`, "", `資料不足（${S.c.length} 根），略過`, ""); continue; }
  const cut = S.c[Math.floor(S.c.length * SPLIT)].t;
  const rows = P.map(p => { const tr = sim(S.c, S.cost, p); return { p, IS: stat(tr.filter(x => x.t < cut)), OOS: stat(tr.filter(x => x.t >= cut)), ALL: stat(tr), tr }; });
  all.push({ set: S.name, rows });
  const pos = rows.filter(r => r.ALL.n >= 20 && r.ALL.avgR > 0).length, both = rows.filter(r => r.IS.n >= 15 && r.OOS.n >= 10 && r.IS.avgR > 0.05 && r.OOS.avgR > 0.05);
  const avg = rows.reduce((a, r) => a + r.ALL.avgR, 0) / rows.length;
  L.push(`## ${S.name}`, "", `${S.c.length} 根 K（${new Date(S.c[0].t).toISOString().slice(0, 10)}～${new Date(S.c.at(-1).t).toISOString().slice(0, 10)}）｜${rows.length} 組參數：全期賺錢 ${pos} 組（${Math.round(pos / rows.length * 100)}%）、平均R 的平均 ${avg.toFixed(3)}｜樣本內外都 > 0.05R：${both.length} 組`, "",
    "| 參數 | 樣本內 | 樣本外 | 全期 | 全期 多/空 平均R | 亞/歐/美 平均R |", "|---|---|---|---|---|---|");
  const f = s => `${s.n}/${s.win}%/${s.avgR}/${s.pf ?? "—"}/${s.ddR}`;
  const sub = (tr, fn) => { const g = tr.filter(fn); return g.length ? (g.reduce((a, x) => a + x.R, 0) / g.length).toFixed(2) + `(${g.length})` : "—"; };
  rows.filter(r => r.IS.n >= 15).sort((a, b) => b.IS.avgR * Math.sqrt(b.IS.n) - a.IS.avgR * Math.sqrt(a.IS.n)).slice(0, 12)
    .forEach(r => L.push(`| ${pn(r.p)} | ${f(r.IS)} | ${f(r.OOS)} | ${f(r.ALL)} | ${sub(r.tr, x => x.dir > 0)} / ${sub(r.tr, x => x.dir < 0)} | ${sub(r.tr, x => x.sess === "亞洲")} / ${sub(r.tr, x => x.sess === "歐洲")} / ${sub(r.tr, x => x.sess === "美國")} |`));
  L.push("");
}
// 同一組參數在所有黃金／納指資料集的表現（看是不是普遍有效，而不是單一資料集碰巧）
L.push("## 跨資料集一致性（同一組參數，在幾個資料集樣本外 > 0）", "", "| 參數 | 黃金/納指資料集 樣本外>0 | 對照組(BTC/ETH) 樣本外>0 | 黃金/納指 全期平均R |", "|---|---|---|---|");
const isGN = s => /黃金|納指|GC|NQ/.test(s);
const cons = P.map((p, idx) => { const gn = all.filter(a => isGN(a.set)), cr = all.filter(a => !isGN(a.set));
  const g = gn.map(a => a.rows[idx]).filter(r => r.OOS.n >= 8), c2 = cr.map(a => a.rows[idx]).filter(r => r.OOS.n >= 8);
  const avg = g.length ? g.reduce((s, r) => s + r.ALL.avgR, 0) / g.length : -9;
  return { p, gPos: g.filter(r => r.OOS.avgR > 0).length, gN: g.length, cPos: c2.filter(r => r.OOS.avgR > 0).length, cN: c2.length, avg }; });
cons.sort((a, b) => b.gPos / Math.max(1, b.gN) - a.gPos / Math.max(1, a.gN) || b.avg - a.avg).slice(0, 15).forEach(x => L.push(`| ${pn(x.p)} | ${x.gPos}/${x.gN} | ${x.cPos}/${x.cN} | ${x.avg.toFixed(3)} |`));
await fs.writeFile("lab/report9.md", L.join("\n"));
await fs.writeFile("lab/results9.json", JSON.stringify({ created: new Date().toISOString(), sets: all.map(a => ({ set: a.set, rows: a.rows.map(r => ({ p: r.p, IS: r.IS, OOS: r.OOS, ALL: r.ALL })) })) }));
console.log(L.join("\n"));
