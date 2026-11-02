// 策略實驗室 第十一輪：斐波延伸反轉「1～3 分鐘極短線版」（11/02 華群補充：影片是切到 1～3 分鐘跑極短的）
// 規則同第九輪，只把 K 線換成 1 分、3 分；成本三種：0（不含成本，看有沒有本事）、0.05%（掛單吃 maker 為主）、0.10%（BingX 一般）
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { atr } from "../scripts/ta-core.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "application/json" };
const SPLIT = 0.65, COSTS = [0, 0.0005, 0.001];
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

async function yahoo1m(sym, days) { // Yahoo 1 分K 每次最多 7 天，往回拼 days 天
  const out = new Map(), now = Math.floor(Date.now() / 1000);
  for (let end = now; end > now - days * 86400; end -= 7 * 86400) {
    const st = Math.max(end - 7 * 86400, now - days * 86400);
    try { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&period1=${st}&period2=${end}&includePrePost=true`, { headers: UA });
      if (!r.ok) { console.log("yahoo", sym, r.status); continue; }
      const res = (await r.json()).chart?.result?.[0]; if (!res || !res.timestamp) continue; const q = res.indicators.quote[0];
      res.timestamp.forEach((t, i) => { if ([q.open[i], q.high[i], q.low[i], q.close[i]].every(v => v != null)) out.set(t * 1000, { t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }); });
    } catch (e) { console.log("yahoo 失敗", sym, e.message); }
    await sleep(300);
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}
async function bingx(sym, iv, pages) {
  const map = new Map(); let end = Date.now();
  for (let k = 0; k < pages; k++) {
    try { const r = await fetch(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${sym}&interval=${iv}&limit=1440&endTime=${end}`, { headers: UA });
      const j = await r.json(); if (j.code !== 0 || !Array.isArray(j.data) || !j.data.length) break;
      let oldest = Infinity; for (const x of j.data) { const t = +x.time; oldest = Math.min(oldest, t); map.set(t, { t, o: +x.open, h: +x.high, l: +x.low, c: +x.close }); }
      if (j.data.length < 50) break; end = oldest - 1; await sleep(120);
    } catch (e) { console.log("bingx 失敗", sym, e.message); break; }
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}
function agg(c, dt) { const out = []; let cur = null; for (const b of c) { const t = Math.floor(b.t / dt) * dt; if (!cur || cur.t !== t) { cur = { ...b, t }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; } } return out; }
function mock(n, seed) { let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const out = []; let p = 100; for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (rnd() - 0.5) * 0.0012); out.push({ t: 1.79e12 + i * 6e4, o, h: Math.max(o, c) * (1 + rnd() * 0.0003), l: Math.min(o, c) * (1 - rnd() * 0.0003), c }); p = c; } return out; }
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
const dayOf = t => Math.floor(t / 864e5);
function nthSun(y, m, k) { const f = new Date(Date.UTC(y, m, 1)); return dayOf(f.getTime()) + ((7 - f.getUTCDay()) % 7) + 7 * (k - 1); }
function lastSun(y, m) { const f = new Date(Date.UTC(y, m + 1, 1)); const d = dayOf(f.getTime()) - 1; return d - new Date(d * 864e5).getUTCDay(); }
function opens(day) { const y = new Date(day * 864e5).getUTCFullYear(); const usDst = day >= nthSun(y, 2, 2) && day < nthSun(y, 10, 1), ukDst = day >= lastSun(y, 2) && day < lastSun(y, 9);
  return [["東京", day * 864e5], ["倫敦", day * 864e5 + (ukDst ? 7 : 8) * 36e5], ["紐約", day * 864e5 + (usDst ? 13.5 : 14.5) * 36e5]]; }
function simSess(c, cost, p) {
  const a = atr(c, 14), out = [], idx = new Map(); c.forEach((b, i) => idx.set(b.t, i));
  const first = t => { let lo = 0, hi = c.length; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m].t < t) lo = m + 1; else hi = m; } return lo; };
  for (let day = dayOf(c[0].t) + 1; day <= dayOf(c.at(-1).t); day++) for (const [sess, T] of opens(day)) {
    if (p.sess !== "all" && p.sess !== sess) continue;
    const i0 = first(T - p.pre * 36e5), i1 = first(T), i2 = first(T + 4 * 36e5);
    if (i1 - i0 < 3 || i2 >= c.length || i1 < 20 || c[i1].t - T > 36e5) continue;
    let H = -Infinity, Lo = Infinity; for (let j = i0; j < i1; j++) { H = Math.max(H, c[j].h); Lo = Math.min(Lo, c[j].l); }
    const R = H - Lo; if (!(R >= a[i1 - 1]) || !(R > 0)) continue;
    let tr = null;
    for (let k = i1; k < i2 && !tr; k++) {
      const b = c[k]; let dir = 0; if (b.l < Lo && !(b.h > H)) dir = 1; else if (b.h > H && !(b.l < Lo)) dir = -1; if (!dir) continue;
      const base = dir > 0 ? Lo : H, lvl = x => base - dir * x * R, E = lvl(p.e), S = lvl(p.s), Tg = lvl(p.t);
      let ent = null, touched = false, m = k;
      for (; m < i2; m++) { const x = c[m];
        const hitE = dir > 0 ? x.l <= E : x.h >= E, hitS = dir > 0 ? x.l <= S : x.h >= S;
        if (p.mode === "limit") { if (hitE) { if (m > k && (dir > 0 ? x.o <= S : x.o >= S)) break; ent = { m, e: m > k ? (dir > 0 ? Math.min(x.o, E) : Math.max(x.o, E)) : E, sb: hitS }; break; } }
        else { if (hitS) break; if (hitE) touched = true; if (touched && (dir > 0 ? x.c > E : x.c < E) && m + 1 < c.length) { ent = { m: m + 1, e: c[m + 1].o, sb: false }; break; } }
      }
      if (!ent) break; // 這個開盤第一次破區間就決定，沒成交就放棄（避免同一開盤反覆找）
      const e = ent.e, r = Math.abs(e - S); if (!(r > 0) || (dir > 0 ? e <= S : e >= S)) break;
      let x = null, q = ent.m; const end = Math.min(c.length - 1, first(c[ent.m].t + 4 * 36e5));
      if (ent.sb) x = S; else for (; q <= end; q++) { const y = c[q];
        if (dir > 0 ? y.l <= S : y.h >= S) { x = q === ent.m ? S : (dir > 0 ? Math.min(y.o, S) : Math.max(y.o, S)); break; }
        if (p.mode === "limit" && q === ent.m) continue;
        if (dir > 0 ? y.h >= Tg : y.l <= Tg) { x = Tg; break; } }
      if (x == null) x = c[end].c;
      tr = { t: c[ent.m].t, R: dir * (x - e) / r - cost * e / r, dir, sess, riskPct: r / e };
    }
    if (tr) out.push(tr);
  }
  return out;
}

const SETS = [];
const add = (name, c) => { SETS.push({ name: name + " 1分", c }); SETS.push({ name: name + " 3分", c: agg(c, 18e4) }); };
if (process.env.MOCK) { add("模擬", mock(60000, 7)); }
else {
  add("黃金期貨 GC（Yahoo 近 28 天）", await yahoo1m("GC=F", 28));
  add("那指期貨 NQ（Yahoo 近 28 天）", await yahoo1m("NQ=F", 28));
  add("黃金 BingX", await bingx("NCCOGOLD2USD-USDT", "1m", 40));
  add("那指 BingX", await bingx("NCSINASDAQ1002USD-USDT", "1m", 40));
  add("黃金 Binance XAU（近 6 個月）", await binance("XAUUSDT", "1m", 6));
  add("BTC（對照，近 3 個月）", await binance("BTCUSDT", "1m", 3));
}
for (const S of SETS) console.log(S.name, S.c.length, S.c[0] ? new Date(S.c[0].t).toISOString() : "", S.c.at(-1) ? new Date(S.c.at(-1).t).toISOString() : "");
const P = grid({ N: [30, 60, 120], e: [0.5, 0.618], s: [0.886, 1.0], t: [0.277, 0, -0.5], mode: ["limit", "confirm"], side: ["both"] }).filter(p => p.s > p.e);
const PS = grid({ sess: ["東京", "倫敦", "紐約"], pre: [1, 2], e: [0.5, 0.618], s: [0.886, 1.0], t: [0.277, 0, -0.5], mode: ["limit", "confirm"] }).filter(p => p.s > p.e);
const pn = p => p.sess ? `${p.sess}｜開盤前${p.pre}小時｜進${p.e === 0.5 ? "-0.5" : "-0.618"}｜損${p.s === 1 ? "-1.0" : "-0.886"}｜標${p.t === 0.277 ? "-0.277" : p.t === 0 ? "0線" : "中線"}｜${p.mode === "limit" ? "掛單" : "確認"}`
  : `區間${p.N}根｜進${p.e === 0.5 ? "-0.5" : "-0.618"}｜損${p.s === 1 ? "-1.0" : "-0.886"}｜標${p.t === 0.277 ? "-0.277" : p.t === 0 ? "0線" : "中線"}｜${p.mode === "limit" ? "掛單" : "確認"}`;
const f = s => `${s.n}/${s.win}%/${s.avgR}/${s.pf ?? "—"}`;
const L = ["# 策略實驗室 第十一輪：斐波延伸反轉 1～3 分鐘版", "", `產生時間：${new Date().toISOString()}`, "", "規則同第九輪（區間高＝1、低＝0，破區間後在 -0.5／-0.618 反向進場），只把 K 線換成 1 分與 3 分。成本三種：0／0.05%／0.10%（來回）。樣本內＝前 65%、樣本外＝後 35%。欄位：筆數/勝率/平均R/獲利因子。", ""];
const summary = [];
for (const S of SETS) {
  if (S.c.length < 3000) { L.push(`## ${S.name}`, "", `資料不足（${S.c.length} 根），略過`, ""); continue; }
  const cut = S.c[Math.floor(S.c.length * SPLIT)].t;
  L.push(`## ${S.name}`, "", `${S.c.length} 根（${new Date(S.c[0].t).toISOString().slice(0, 10)}～${new Date(S.c.at(-1).t).toISOString().slice(0, 10)}）`, "");
  for (const [label, PP, fn] of [["全天候", P, sim], ["開盤版", PS, simSess]]) {
    const rows = PP.map(p => { const tr0 = fn(S.c, 0, p); const rs = tr0.map(x => x.riskPct).filter(Boolean).sort((a, b) => a - b);
      return { p, med: rs.length ? rs[rs.length >> 1] : null, by: COSTS.map(cost => { const tr = fn(S.c, cost, p); return { cost, IS: stat(tr.filter(x => x.t < cut)), OOS: stat(tr.filter(x => x.t >= cut)), ALL: stat(tr) }; }) }; });
    const cnt = ci => rows.filter(r => r.by[ci].ALL.n >= 20 && r.by[ci].ALL.avgR > 0).length, both = ci => rows.filter(r => r.by[ci].IS.n >= 15 && r.by[ci].OOS.n >= 10 && r.by[ci].IS.avgR > 0.05 && r.by[ci].OOS.avgR > 0.05).length;
    const meds = rows.map(r => r.med).filter(Boolean).sort((a, b) => a - b), med = meds.length ? (meds[meds.length >> 1] * 100).toFixed(3) + "%" : "—";
    L.push(`**${label}**：${rows.length} 組｜全期賺錢：不含成本 ${cnt(0)} 組、0.05% ${cnt(1)} 組、0.10% ${cnt(2)} 組｜樣本內外都 >0.05R：${both(0)}／${both(1)}／${both(2)} 組｜停損距離中位數 ${med}`, "");
    summary.push({ set: S.name, label, n: rows.length, g: cnt(0), m: cnt(1), b: cnt(2), q: both(2), med });
    L.push("| 參數 | 不含成本 樣本內→樣本外 | 0.05% 樣本內→樣本外 | 0.10% 全期 |", "|---|---|---|---|");
    rows.filter(r => r.by[1].IS.n >= 15).sort((a, b) => b.by[1].IS.avgR * Math.sqrt(b.by[1].IS.n) - a.by[1].IS.avgR * Math.sqrt(a.by[1].IS.n)).slice(0, 5)
      .forEach(r => L.push(`| ${pn(r.p)} | ${f(r.by[0].IS)} → ${f(r.by[0].OOS)} | ${f(r.by[1].IS)} → ${f(r.by[1].OOS)} | ${f(r.by[2].ALL)} |`));
    L.push("");
  }
}
L.splice(6, 0, "## 總表", "", "| 資料 | 版本 | 組數 | 不含成本賺錢 | 0.05% 賺錢 | 0.10% 賺錢 | 0.10% 樣本內外都合格 | 停損距離中位數 |", "|---|---|---|---|---|---|---|---|", ...summary.map(x => `| ${x.set} | ${x.label} | ${x.n} | ${x.g} | ${x.m} | ${x.b} | ${x.q} | ${x.med} |`), "");
await fs.writeFile("lab/report11.md", L.join("\n"));
await fs.writeFile("lab/results11.json", JSON.stringify({ created: new Date().toISOString(), summary }));
console.log(L.join("\n"));
