// 策略實驗室 第十輪：黃金・那指專屬（11/02 董事長同意開新分頁＋回測）
// 三個方向：
//  A. 波段突破搬過去：4h（由 1h 合成）N 根新高突破，停損 k×ATR，收盤跌破前 N/2 根低點出場（可做空對稱）
//  B. 那指（也測黃金）紐約開盤區間突破：開盤後 X 分鐘的高低點，之後第一根 5 分K 收盤突破就順勢進場
//  C. 黃金（也測那指）倫敦盤突破：亞洲盤（UTC 00:00～倫敦開盤）的區間，倫敦開盤後順勢突破
// 成本兩種都算：期貨 0.04%、BingX 差價合約 0.10%（來回）
import fs from "node:fs/promises";
import { ema, atr } from "../scripts/ta-core.mjs";

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept": "application/json" };
const SPLIT = 0.65, COSTS = [0.0004, 0.001];
async function yahoo(sym, interval, range) {
  if (process.env.MOCK) { let s = sym.length * 97 + interval.length; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const dt = interval === "5m" ? 3e5 : 36e5, n = interval === "5m" ? 16000 : 12000, out = []; let p = 100; const t0 = Math.floor(Date.now() / 864e5) * 864e5 - n * dt; for (let i = 0; i < n; i++) { const t = t0 + i * dt, wd = new Date(t).getUTCDay(); if (wd === 6) continue; const sg = dt === 3e5 ? 0.0012 : 0.004, o = p, c = o * (1 + (rnd() - 0.49) * sg); out.push({ t, o, h: Math.max(o, c) * (1 + rnd() * sg * 0.3), l: Math.min(o, c) * (1 - rnd() * sg * 0.3), c }); p = c; } return out; }
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}&includePrePost=true`, { headers: UA });
      if (!r.ok) { console.log("yahoo", sym, interval, host, r.status); continue; }
      const res = (await r.json()).chart?.result?.[0]; if (!res) continue;
      const q = res.indicators.quote[0], out = [];
      res.timestamp.forEach((t, i) => { if ([q.open[i], q.high[i], q.low[i], q.close[i]].every(v => v != null)) out.push({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }); });
      return out;
    } catch (e) { console.log("yahoo 失敗", sym, e.message); }
  }
  return [];
}
function agg(c, dt) { const out = []; let cur = null; for (const b of c) { const t = Math.floor(b.t / dt) * dt; if (!cur || cur.t !== t) { cur = { ...b, t }; out.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; } } return out; }
const dayOf = t => Math.floor(t / 864e5);
function nthSun(y, m, k) { const f = new Date(Date.UTC(y, m, 1)); return dayOf(f.getTime()) + ((7 - f.getUTCDay()) % 7) + 7 * (k - 1); }
function lastSun(y, m) { const f = new Date(Date.UTC(y, m + 1, 1)); const d = dayOf(f.getTime()) - 1; return d - new Date(d * 864e5).getUTCDay(); }
const usOpen = day => { const y = new Date(day * 864e5).getUTCFullYear(); return day * 864e5 + (day >= nthSun(y, 2, 2) && day < nthSun(y, 10, 1) ? 13.5 : 14.5) * 36e5; };
const ukOpen = day => { const y = new Date(day * 864e5).getUTCFullYear(); return day * 864e5 + (day >= lastSun(y, 2) && day < lastSun(y, 9) ? 7 : 8) * 36e5; };
const stat = ts => { const n = ts.length, w = ts.filter(x => x.R > 0).length, s = ts.reduce((a, x) => a + x.R, 0), gp = ts.filter(x => x.R > 0).reduce((a, x) => a + x.R, 0), gl = -ts.filter(x => x.R < 0).reduce((a, x) => a + x.R, 0);
  let eq = 0, pk = 0, dd = 0; for (const x of ts) { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, sumR: +s.toFixed(1), pf: gl > 0 ? +(gp / gl).toFixed(2) : null, ddR: +dd.toFixed(1) }; };
const grid = o => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap(z => vs.map(v => ({ ...z, [k]: v }))), [{}]);
const first = (c, t) => { let lo = 0, hi = c.length; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m].t < t) lo = m + 1; else hi = m; } return lo; };

// ===== A. 波段突破（4h）=====
function swing(c, cost, p) {
  const a = atr(c, 14), e2 = ema(c.map(x => x.c), 200), out = [], M = Math.max(5, Math.round(p.N / 2));
  let pos = null;
  for (let i = Math.max(p.N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      const d = pos.dir; let x = null;
      if (d > 0 ? b.l <= pos.st : b.h >= pos.st) x = d > 0 ? Math.min(b.o, pos.st) : Math.max(b.o, pos.st);
      else { let ex = d > 0 ? Infinity : -Infinity; for (let j = i - M; j < i; j++) ex = d > 0 ? Math.min(ex, c[j].l) : Math.max(ex, c[j].h); if (d > 0 ? b.c < ex : b.c > ex) x = b.c; }
      if (x != null) { out.push({ t: pos.t, R: d * (x - pos.e) / pos.r - cost * pos.e / pos.r, dir: d }); pos = null; }
      continue;
    }
    let hi = -Infinity, lo = Infinity; for (let j = i - p.N; j < i; j++) { hi = Math.max(hi, c[j].h); lo = Math.min(lo, c[j].l); }
    let dir = b.c > hi ? 1 : b.c < lo ? -1 : 0; if (!dir) continue;
    if (dir < 0 && p.side === "long") continue;
    if (p.trend && (dir > 0 ? !(b.c > e2[i]) : !(b.c < e2[i]))) continue;
    const e = c[i + 1].o, r = p.k * a[i]; if (!(r > 0)) continue;
    pos = { dir, e, r, st: e - dir * r, t: c[i + 1].t };
  }
  return out;
}
// ===== B/C. 開盤區間突破（順勢）=====
// open(day)：區間開始；rangeEnd(day)：區間結束＝開始找突破的時間；window：區間結束後幾小時內可進場；hold：最多持有幾小時
function orb(c, cost, p, rangeStart, rangeEnd) {
  const out = [];
  for (let day = dayOf(c[0].t) + 1; day <= dayOf(c.at(-1).t); day++) {
    const wd = new Date(day * 864e5).getUTCDay(); if (wd === 0 || wd === 6) continue;
    const t0 = rangeStart(day), t1 = rangeEnd(day), i0 = first(c, t0), i1 = first(c, t1), i2 = first(c, t1 + p.win * 36e5);
    if (i1 - i0 < 2 || i2 >= c.length || c[i1].t - t1 > 36e5) continue;
    let H = -Infinity, L = Infinity; for (let j = i0; j < i1; j++) { H = Math.max(H, c[j].h); L = Math.min(L, c[j].l); }
    const R0 = H - L; if (!(R0 > 0)) continue;
    for (let k = i1; k < i2 - 1; k++) {
      const b = c[k], dir = b.c > H ? 1 : b.c < L ? -1 : 0; if (!dir) continue;
      if (dir < 0 && p.side === "long") break;
      const e = c[k + 1].o, S = p.stop === "opp" ? (dir > 0 ? L : H) : (H + L) / 2, r = Math.abs(e - S);
      if (!(r > 0) || (dir > 0 ? e <= S : e >= S)) break;
      const T = p.tgt ? e + dir * p.tgt * r : null, end = first(c, c[k + 1].t + p.hold * 36e5);
      let x = null;
      for (let m = k + 1; m < Math.min(end, c.length); m++) { const y = c[m];
        if (dir > 0 ? y.l <= S : y.h >= S) { x = m === k + 1 ? S : (dir > 0 ? Math.min(y.o, S) : Math.max(y.o, S)); break; }
        if (T && (dir > 0 ? y.h >= T : y.l <= T)) { x = T; break; } }
      if (x == null) x = c[Math.min(end, c.length) - 1].c;
      out.push({ t: c[k + 1].t, R: dir * (x - e) / r - cost * e / r, dir });
      break; // 每天只做第一次突破
    }
  }
  return out;
}

const D = {};
for (const [k, sym] of [["黃金", "GC=F"], ["那指", "NQ=F"]]) {
  const h1 = await yahoo(sym, "60m", "730d"), m5 = await yahoo(sym, "5m", "60d");
  D[k] = { h1, h4: agg(h1, 144e5), m5 };
  console.log(k, "1h", h1.length, h1[0] && new Date(h1[0].t).toISOString(), "5m", m5.length, m5[0] && new Date(m5[0].t).toISOString());
}
const L = ["# 策略實驗室 第十輪：黃金・那指專屬", "", `產生時間：${new Date().toISOString()}；資料：Yahoo 黃金期貨 GC、那指期貨 NQ（1 小時 2 年、5 分 60 天）；每組資料前 65% 樣本內、後 35% 樣本外`, "",
  "欄位：筆數/勝率/平均R/總R/獲利因子/最大回落(R)。成本兩種：期貨 0.04%、BingX 0.10%（來回）。", "",
  "合格標準（沿用鐵律精神）：BingX 成本 0.10% 下，樣本內、樣本外平均R 都 > 0.05，樣本外 ≥ 20 筆，而且鄰近參數也大多是正的。", ""];
const qualified = [];
function section(title, rows, nm) {
  L.push(`## ${title}`, "", "| 參數 | 成本 | 樣本內 | 樣本外 | 全期 |", "|---|---|---|---|---|");
  const f = s => `${s.n}/${s.win}%/${s.avgR}/${s.sumR}/${s.pf ?? "—"}/${s.ddR}`;
  const pos = rows.filter(r => r.cost === 0.001 && r.ALL.n >= 20 && r.ALL.avgR > 0).length, tot = rows.filter(r => r.cost === 0.001).length;
  L.push(`| **BingX 成本下 ${tot} 組中全期賺錢 ${pos} 組** | | | | |`);
  rows.filter(r => r.cost === 0.001 && r.IS.n >= 15).sort((a, b) => b.IS.avgR * Math.sqrt(b.IS.n) - a.IS.avgR * Math.sqrt(a.IS.n)).slice(0, 8).forEach(r => {
    const fut = rows.find(z => z.cost === 0.0004 && JSON.stringify(z.p) === JSON.stringify(r.p));
    L.push(`| ${nm(r.p)} | 0.10% | ${f(r.IS)} | ${f(r.OOS)} | ${f(r.ALL)} |`);
    if (fut) L.push(`| 〃 | 0.04% | ${f(fut.IS)} | ${f(fut.OOS)} | ${f(fut.ALL)} |`);
    if (r.IS.avgR > 0.05 && r.OOS.avgR > 0.05 && r.OOS.n >= 20) qualified.push({ title, name: nm(r.p), p: r.p, IS: r.IS, OOS: r.OOS, ALL: r.ALL });
  });
  L.push("");
}
const run = (c, fn, P) => { if (!c || c.length < 500) return []; const cut = c[Math.floor(c.length * SPLIT)].t; return P.flatMap(p => COSTS.map(cost => { const tr = fn(c, cost, p); return { p, cost, IS: stat(tr.filter(x => x.t < cut)), OOS: stat(tr.filter(x => x.t >= cut)), ALL: stat(tr) }; })); };

const PA = grid({ N: [20, 55], k: [2, 3], side: ["long", "both"], trend: [true, false] });
const nA = p => `${p.N} 根突破｜停損 ${p.k}ATR｜${p.side === "long" ? "只做多" : "多空"}｜${p.trend ? "EMA200 濾網" : "無濾網"}`;
for (const k of ["黃金", "那指"]) section(`A. 波段突破 4h｜${k}（2 年）`, run(D[k].h4, swing, PA), nA);

const PB = grid({ X: [30, 60], stop: ["opp", "mid"], tgt: [0, 1, 2], side: ["both", "long"], win: [3], hold: [4] });
const nB = p => `開盤後 ${p.X} 分區間｜停損${p.stop === "opp" ? "區間另一端" : "區間中間"}｜${p.tgt ? "目標 " + p.tgt + "R" : "4 小時到期出"}｜${p.side === "long" ? "只做多" : "多空"}`;
for (const k of ["那指", "黃金"]) section(`B. 紐約開盤區間突破 5 分｜${k}（60 天）`, run(D[k].m5, (c, cost, p) => orb(c, cost, p, usOpen, d => usOpen(d) + p.X * 6e4), PB), nB);

const PC = grid({ stop: ["opp", "mid"], tgt: [0, 1, 2], side: ["both", "long"], win: [4], hold: [8] });
const nC = p => `亞洲盤區間→倫敦突破｜停損${p.stop === "opp" ? "區間另一端" : "區間中間"}｜${p.tgt ? "目標 " + p.tgt + "R" : "8 小時到期出"}｜${p.side === "long" ? "只做多" : "多空"}`;
for (const k of ["黃金", "那指"]) {
  section(`C. 倫敦盤突破 1 小時｜${k}（2 年）`, run(D[k].h1, (c, cost, p) => orb(c, cost, p, d => d * 864e5, ukOpen), PC), nC);
  section(`C. 倫敦盤突破 5 分｜${k}（60 天）`, run(D[k].m5, (c, cost, p) => orb(c, cost, p, d => d * 864e5, ukOpen), PC), nC);
}
L.push("## 合格清單（BingX 成本下樣本內、樣本外平均R 都 > 0.05、樣本外 ≥ 20 筆）", "");
if (!qualified.length) L.push("（沒有）");
qualified.forEach(q => L.push(`- ${q.title}｜${q.name}｜樣本內 ${q.IS.n} 筆 ${q.IS.avgR}R｜樣本外 ${q.OOS.n} 筆 勝率 ${q.OOS.win}% ${q.OOS.avgR}R｜全期回落 ${q.ALL.ddR}R`));
await fs.writeFile("lab/report10.md", L.join("\n"));
await fs.writeFile("lab/results10.json", JSON.stringify({ created: new Date().toISOString(), qualified }));
console.log(L.join("\n"));
