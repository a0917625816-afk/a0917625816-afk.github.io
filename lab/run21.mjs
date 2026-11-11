// 策略實驗室 第二十一輪（11/12 CEO 策略統籌）：劇本單「實單回放」
// 拿盤前室真正下過的每一張劇本單（bot.json scen.closed ＋ intel.json scenarioVirtual 的原始參數），
// 用 BingX 15 分K 把當時的行情重播一次，比較不同「掛單方式」與「出場方式」：
//   V0 原版：照原本進場／停損／停利／有效時間／最長持有（用來核對跟機器人實際結果一致）
//   V1 兩段掛：一半風險掛在「下單當下價格與原進場價的中點」、一半掛原進場價（止損、停利不變；每段各自 0.5% 風險）
//   V2 1R 先平一半＋保本：成交後浮盈到 +1R 先平一半，剩下一半停損移到 +0.05R
//   V3 停利上限 1.5R：原停利若超過 1.5R，改成 1.5R
//   V4 ＝ V1＋V2
// 判定規則跟機器人一樣保守：成交那根碰到停損算停損；同一根停損停利都碰到算停損；成本照分級（BTC/ETH/SOL 0.14%，其他 0.25%）。
// 審查表：樣本 <30 張成交一律「判不了」，只看方向；本輪不改任何規則，結果交策略會議與盤前室參考。
import fs from "node:fs/promises";
const M15 = 9e5, H1 = 36e5;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url) { for (let t = 0; t < 5; t++) { try { const r = await fetch(url); if (r.status === 429) { await sleep(3000 * (t + 1)); continue; } if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); } catch (e) { if (t === 4) throw e; await sleep(1500 * (t + 1)); } } }
async function bars(base, from, to) {
  const out = [];
  for (let s = from; s < to; s += 1000 * M15) {
    const j = await getJSON(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?symbol=${base}-USDT&interval=15m&startTime=${s}&endTime=${Math.min(to, s + 1000 * M15)}&limit=1000`);
    if (j.code !== 0 || !Array.isArray(j.data)) throw new Error("bad data " + base);
    for (const x of j.data) out.push({ t: +x.time, o: +x.open, h: +x.high, l: +x.low, c: +x.close });
    await sleep(120);
  }
  const m = new Map(out.map(b => [b.t, b])); return [...m.values()].filter(b => b.t >= from - M15 && b.t + M15 <= Date.now()).sort((a, b) => a.t - b.t);
}
const MOCK = process.env.MOCK === "1";
function mockBars(from, to, p0) { const out = []; let p = p0; for (let t = Math.floor(from / M15) * M15 - M15; t < to; t += M15) { const o = p; p = o * (1 + (Math.random() - 0.5) * 0.008); out.push({ t, o, h: Math.max(o, p) * 1.002, l: Math.min(o, p) * 0.998, c: p }); } return out; }

const B = JSON.parse(await fs.readFile("bot.json", "utf8")), I = JSON.parse(await fs.readFile("intel.json", "utf8"));
const SV = Object.fromEntries((I.scenarioVirtual || []).map(o => [o.id, o]));
const SC = B.scen || { closed: [] };
// 下單當下時間：未成交過期的紀錄 t＝機器人第一次看到的時間；已成交的紀錄 t＝成交時間，所以用時段排程時間估（台北：東京 07:42、倫敦 15:10、紐約 20:50；11/01 以前倫敦 14:10、紐約 19:50）
function t0Of(c, o) {
  if (!c.amt) return c.t;
  const mmdd = String(c.id).slice(0, 4), y = new Date(c.t).getUTCFullYear(), mo = +mmdd.slice(0, 2) - 1, d = +mmdd.slice(2, 4);
  const early = mo < 10 || (mo === 10 && d < 2);
  const hm = { tokyo: [7, 42], london: early ? [14, 10] : [15, 10], ny: early ? [19, 50] : [20, 50] }[c.session || o.session] || [7, 42];
  return Date.UTC(y, mo, d, hm[0] - 8, hm[1]);
}
const orders = [];
for (const c of SC.closed || []) {
  if (/拒單|槓桿/.test(c.why || "")) continue;
  const o = SV[c.id]; if (!o) continue;
  orders.push({ id: c.id, base: o.base, side: o.side, type: o.type || "limit", session: o.session || c.session, pattern: o.pattern || c.pattern || "P0", entry: +o.entry, stop: +o.stop, target: +o.target, expireH: Math.min(72, o.expireH || 8), maxHoldH: Math.min(168, o.maxHoldH || 48), t0: t0Of(c, o), actualR: c.amt ? +c.R : 0, actualWhy: c.why });
}
console.log("劇本單筆數", orders.length);

const costOf = b => /^(BTC|ETH|SOL)$/.test(b) ? 0.0014 : 0.0025;
// 單段模擬：回傳 { filled, R（以這一段自己的風險為 1R）, why }
function leg(bs, o, entry, opt) {
  const L = o.side === "long", lim = o.type === "limit", dir = L ? 1 : -1, r = Math.abs(entry - o.stop), cost = costOf(o.base);
  let target = o.target; if (opt.cap && Math.abs(target - entry) / r > opt.cap) target = entry + dir * opt.cap * r;
  const tEnd = o.t0 + o.expireH * H1; let i = bs.findIndex(b => b.t + M15 > o.t0); if (i < 0) return { filled: false, R: 0 };
  let e = null;
  for (; i < bs.length && bs[i].t < tEnd; i++) {
    const b = bs[i];
    if (lim ? (L ? b.l <= entry : b.h >= entry) : (L ? b.h >= entry : b.l <= entry)) { e = lim ? (L ? Math.min(b.o, entry) : Math.max(b.o, entry)) : (L ? Math.max(b.o, entry) : Math.min(b.o, entry)); break; }
  }
  if (e == null) return { filled: false, R: 0 };
  const fin = (x, why, real = 0, left = 1) => ({ filled: true, R: real + left * dir * (x - e) / r - cost * e / r, why });
  if (L ? e <= o.stop : e >= o.stop) return fin(e, "跳空");
  if (L ? bs[i].l <= o.stop : bs[i].h >= o.stop) return fin(o.stop, "停損（成交當根）");
  const tFill = bs[i].t + M15; let stop = o.stop, real = 0, left = 1;
  for (i = i + 1; i < bs.length; i++) {
    const b = bs[i];
    if (L ? b.l <= stop : b.h >= stop) return fin(L ? Math.min(b.o, stop) : Math.max(b.o, stop), left < 1 ? "保本" : "停損", real, left);
    if (L ? b.h >= target : b.l <= target) return fin(L ? Math.max(b.o, target) : Math.min(b.o, target), "停利", real, left);
    if (opt.half && left === 1 && (L ? b.h >= e + r : b.l <= e - r)) { real = 0.5; left = 0.5; stop = e + dir * 0.05 * r; }
    if (b.t + M15 - tFill >= o.maxHoldH * H1) return fin(b.c, "超時", real, left);
  }
  const last = bs.at(-1); return { filled: true, R: real + left * dir * (last.c - e) / r - cost * e / r, why: "仍持有（以最新價計）", open: true };
}
function run(bs, o, v) {
  const opt = { half: v === "V2" || v === "V4", cap: v === "V3" ? 1.5 : 0 };
  if ((v === "V1" || v === "V4") && o.type === "limit") {
    const p0 = (bs.find(b => b.t + M15 > o.t0) || bs[0]).o, L = o.side === "long";
    const far = L ? p0 > o.entry : p0 < o.entry; // 現價在進場價「外面」才有中點可掛
    if (far) {
      const mid = (p0 + o.entry) / 2, a = leg(bs, o, mid, opt), b = leg(bs, o, o.entry, opt);
      return { filled: a.filled || b.filled, R: 0.5 * a.R + 0.5 * b.R, why: [a.why, b.why].filter(Boolean).join("／"), open: a.open || b.open };
    }
  }
  return leg(bs, o, o.entry, opt);
}
const VS = ["V0", "V1", "V2", "V3", "V4"], NAME = { V0: "原版", V1: "兩段掛（中點＋原價各半）", V2: "1R 先平一半＋保本", V3: "停利上限 1.5R", V4: "兩段掛＋1R 先平一半" };
const res = Object.fromEntries(VS.map(v => [v, []]));
const cache = {};
for (const o of orders) {
  const from = o.t0 - 2 * M15, to = o.t0 + (o.expireH + o.maxHoldH + 1) * H1, key = o.base;
  let bs;
  try {
    if (MOCK) bs = mockBars(from, to, o.entry * (o.side === "long" ? 1.01 : 0.99));
    else bs = await bars(o.base, from, Math.min(to, Date.now()));
  } catch (e) { console.log("略過", o.id, e.message); continue; }
  if (bs.length < 5) { console.log("資料不足", o.id); continue; }
  for (const v of VS) res[v].push({ ...o, ...run(bs, o, v) });
}
const agg = xs => { const F = xs.filter(x => x.filled), w = F.filter(x => x.R > 0).length, s = xs.reduce((a, x) => a + x.R, 0);
  let eq = 0, pk = 0, dd = 0; [...F].sort((a, b) => a.t0 - b.t0).forEach(x => { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); });
  return { orders: xs.length, fills: F.length, fillPct: xs.length ? Math.round(F.length / xs.length * 100) : 0, win: F.length ? Math.round(w / F.length * 100) : 0, avgRFilled: F.length ? +(F.reduce((a, x) => a + x.R, 0) / F.length).toFixed(2) : 0, sumR: +s.toFixed(2), avgRPerOrder: xs.length ? +(s / xs.length).toFixed(3) : 0, maxDD: +dd.toFixed(2) }; };
const out = { at: new Date().toISOString(), note: "劇本單實單回放；成交 <30 張＝判不了，只看方向", sanity: null, variants: {}, bySession: {}, byPattern: {} };
for (const v of VS) out.variants[v] = { name: NAME[v], ...agg(res[v]) };
for (const v of VS) out.bySession[v] = Object.fromEntries(["tokyo", "london", "ny"].map(s => [s, agg(res[v].filter(x => x.session === s))]));
for (const v of ["V0", "V2"]) out.byPattern[v] = Object.fromEntries([...new Set(res[v].map(x => x.pattern + "|" + x.side))].map(k => [k, agg(res[v].filter(x => x.pattern + "|" + x.side === k))]));
// 核對：V0 跟機器人實際結果差多少
const V0 = res.V0, diff = V0.filter(x => Math.abs(x.R - x.actualR) > 0.15 || (x.filled ? 0 : 1) !== (x.actualR === 0 && /過期/.test(x.actualWhy) ? 1 : 0));
out.sanity = { n: V0.length, mismatches: diff.length, examples: diff.slice(0, 8).map(x => ({ id: x.id, sim: +x.R.toFixed(2), simWhy: x.why || "未成交", actual: x.actualR, actualWhy: x.actualWhy })) };
await fs.writeFile("lab/results21.json", JSON.stringify(out, null, 1));
const fmt = a => `${a.orders} 張｜成交 ${a.fills}（${a.fillPct}%）｜勝率 ${a.win}%｜成交平均 ${a.avgRFilled}R｜每張平均 ${a.avgRPerOrder}R｜合計 ${a.sumR}R｜回落 ${a.maxDD}R`;
let md = `# 第二十一輪：劇本單實單回放（${out.at.slice(0, 16)}）\n\n成交不滿 30 張＝判不了（審查表 A 第 1 關），本輪只看方向，不改規則。\n\n## 各做法比較\n\n`;
for (const v of VS) md += `- **${v} ${NAME[v]}**：${fmt(out.variants[v])}\n`;
md += `\n## 分時段\n\n`;
for (const v of VS) md += `- ${v}：` + ["tokyo", "london", "ny"].map(s => `${s} ${out.bySession[v][s].fills} 筆 勝${out.bySession[v][s].win}% 均${out.bySession[v][s].avgRFilled}R`).join("；") + "\n";
md += `\n## 分型態（原版 vs 1R 先平一半）\n\n`;
for (const k of Object.keys(out.byPattern.V0)) { const a = out.byPattern.V0[k], b = out.byPattern.V2[k] || {}; md += `- ${k}：原版 ${a.fills} 筆 勝${a.win}% 均${a.avgRFilled}R ｜ 先平一半 勝${b.win}% 均${b.avgRFilled}R\n`; }
md += `\n## 核對（原版模擬 vs 機器人實際）\n\n${out.sanity.n} 張中 ${out.sanity.mismatches} 張不一致（主要原因：已成交單的下單時間是用時段排程估的）。\n`;
for (const e of out.sanity.examples) md += `- ${e.id}：模擬 ${e.sim}R（${e.simWhy}） vs 實際 ${e.actual}R（${e.actualWhy}）\n`;
await fs.writeFile("lab/report21.md", md);
console.log(md);
