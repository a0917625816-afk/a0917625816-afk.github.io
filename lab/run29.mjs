// 策略實驗室 第二十九輪（11/19 會議決議）
// 實驗一（CEO 網上研究 11/18，C15）：ADX 低檔突破濾網，套用於波段A 進場。定義（照 queue 原文）：波段A 進場不變（4h 突破 55 根新高＋4h EMA200 之上＋BTC 日線 > EMA50＋20 日漲幅前 10），加「訊號 K 的 4h ADX(14) < 25」才進；出場不變（2ATR 停損、收盤跌破前 27 根低）。原本＝波段A。審查：門檻 20／30、ADX 週期 11／17（1 基準＋4 鄰近）；另列：日線 ADX(14) < 25 版、反向對照（ADX ≥25 才進）、套用於波段B（原本＝波段B）、成本 ×1.5／×2。
// 實驗二（觀察員2 11/16，R27）：洗盤後量枯多。定義（照 queue 原文）：標的 BTC、ETH 及 40 幣有 OI 者；D0＝UTC 日跌 ≤ −4% 且量 ≥2× 前 20 日均量且 OI 日減 ≥8%；D0 後 1–2 日內出現 D1＝量 ≤0.5× D0 且收盤高於 D0 低點且當日費率日合計 ≤0 → D1 收盤後首根 15 分K 開盤做多；停損＝D0 低點 −1%；出場＝+2R 或持有滿 4 日平倉。原本＝波段A（持有可達 4 日，會前寫死）。審查：跌幅 3.2／4.8%、量倍 1.6／2.4、OI 減 6.4／9.6%、量縮 0.4／0.6、停損 0.8／1.2%、持有 3／5 日（1 基準＋12 鄰近）；另列：拿掉 OI 條件的 30 個月對照版（11/16 登記）、拿掉費率條件、只 BTC／ETH／SOL、只在 BTC<EMA50 時、成本 ×1.5／×2。OI 只有 2025-05 起 18 個月 → 事先聲明基準很可能「判不了」，對照版才有足夠樣本。
// 補測（不佔名額，11/18 登記）：①週一桶分狀態——波段A／波段B／日內B 被 C14b 拿掉的週一單，按市場狀態（趨勢上／盤整／趨勢下／恐慌）拆開，對照非週一；②波段A 套「趨勢上不開單」與「只在盤整開單」對照波段A 原本（run16／17 已判不合格結案，這裡只當對照看週一效應是否＝趨勢上效應，不重判上線）。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K／已結算費率、OI 用日末值；進場用下一根開盤；成本分級；C15 與波段A 同口徑（未計費率，可比）；R27 主表與波段A 同口徑、持有 ≤4 日費率影響小；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告；C15 1 個參數、R27 6 個參數（快篩過）。R27 未套 BTC 濾網（它是「濾網外」的恐慌期多單題），另列套濾網版。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；審查＝主要參數各上下 20% 大部分變體仍合格。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。
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
const want = [...LIST19];
const data = {};
for (const base of want) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(base) : await binance15(base); console.log(base, m.length); if (m.length < 35000) continue; data[base] = { m, h: agg(m, H4), d: agg(m, D1) }; } catch (e) { console.log("失敗", base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"],["2026-11-06","08:30","NFP"],["2026-11-10","08:30","CPI"]];
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());
const U19 = LIST19.filter(c => data[c]);
console.log("list19 可用", U19.length);

// ===== 濾網（同現行機器人；排行依清單各算一份）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rkCache = new Map();
function top(day, U) { const key = U.key + ":" + day; if (rkCache.has(key)) return rkCache.get(key); const sc = []; for (const cn of U.list) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rkCache.set(key, s); return s; }
const okF = (cn, t, U) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1, U).has(cn);
const UNI19 = { key: "19", list: U19 };

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

// ===== 交易引擎（六個部門共用；o.costMul 成本倍數、o.stopMul 停損倍數、o.ban(cn,t) 禁多；o.mid={N,lvl,keep27} 中點移動停損出場）=====
function passF(cn, t, f) { if (f.liq) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= f.liq * 1e6)) return false; } if (f.ev && evBlock(t)) return false; if (f.trend && trendBlock(t)) return false; return true; }
function quality(P, i, q) { const b = P.c[i], rng = b.h - b.l; if (q.vol && !(b.v > q.vol * P.v20[i])) return false; if (q.cs && !(rng > 0 && (b.c - b.l) / rng >= q.cs)) return false; return true; }
function midOf(c, i, N, lvl) { let hi = -Infinity, lo = Infinity; for (let j = i - N + 1; j <= i; j++) { hi = Math.max(hi, c[j].c); lo = Math.min(lo, c[j].c); } return lo + lvl * (hi - lo); }
function trades(cn, S, U, o = {}) {
  const kind = S.kind, x = S.x, f = S.f, q = S.q, stopMul = o.stopMul || 1, costMul = o.costMul || 1, mid = o.mid;
  const tf = kind === "swing" ? "h" : "m", P = pre[cn][tf], c = P.c, a = P.a, out = [];
  const N = kind === "swing" ? 55 : 192, M = 27, stopK = (kind === "swing" ? 2 : 6) * stopMul;
  let pos = null, doneDay = -1;
  for (let i = Math.max(N, 210); i < c.length - 1; i++) {
    const b = c[i];
    if (pos) {
      let ex = null, why = "";
      if (b.l <= pos.st) { ex = Math.min(b.o, pos.st); why = pos.trail ? "中點停損" : "停損"; }
      else {
        if (x.tp && !pos.took && b.h >= pos.e + x.tp * pos.r) { pos.took = true; pos.real += x.f * x.tp; if (x.be) pos.st = Math.max(pos.st, pos.e + 0.05 * pos.r); }
        if (kind === "swing" && (!mid || mid.keep27)) { let lo = Infinity; for (let j = i - M; j < i; j++) lo = Math.min(lo, c[j].l); if (b.c < lo) { ex = b.c; why = "跌破27根低"; } }
        else if (kind !== "swing" && b.t + M15 >= pos.dayEnd) { ex = b.c; why = "收盤"; }
        if (ex == null && mid && kind === "swing") { const m = midOf(c, i, mid.N, mid.lvl); if (m > pos.st) { pos.st = m; pos.trail = true; } if (b.c < pos.st) { ex = c[i + 1].o; why = "收盤跌破中點"; } }
      }
      if (ex != null) { const left = pos.took ? 1 - x.f : 1; const gross = pos.real + left * (ex - pos.e) / pos.r, costR = pos.cost * pos.e / pos.r; out.push({ cn, t: pos.t, tx: b.t + (kind === "swing" ? H4 : M15), R: gross - costMul * costR, gross, costR, state: pos.state, why, bars: i - pos.i }); pos = null; }
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
    let st = e - r; if (mid && kind === "swing") { const m = midOf(c, i, mid.N, mid.lvl); if (m > st && m < e) st = m; }
    pos = { e, r: e - st, st, t, i: i + 1, real: 0, took: false, trail: false, dayEnd: (dk(b.t) + 1) * D1, cost: tieredCost(cn, t), state: stateAt(t) };
  }
  return out;
}
function portfolio(ts0, from, to, maxOpen = 5) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {}; let legF = 0, legP = 0;
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); if (open.length >= maxOpen || open.some(o => o.cn === x.cn)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; legF += x.legF || 0; legP += x.legP || 0; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, legF: n ? +(legF / n).toFixed(3) : 0, legP: n ? +(legP / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const t0 = Math.min(...coins.map(cn => data[cn].m[0].t)) + 30 * D1, t1 = Math.max(...coins.map(cn => data[cn].m.at(-1).t)), cut = t0 + SPLIT * (t1 - t0);
const fmtD = t => new Date(t).toISOString().slice(0, 10);
const seg = (tr, mo = 5) => ({ IS: portfolio(tr, t0, cut, mo), OOS: portfolio(tr, cut, Infinity, mo), ALL: portfolio(tr, t0, Infinity, mo) });
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
// ===== 五個部門（原本）=====
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const nm = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";


// ===== ADX（Wilder）=====
function adx(c, n = 14) { const L = c.length, out = new Array(L).fill(NaN); if (L <= 2 * n) return out; const tr = [], pdm = [], ndm = []; for (let i = 0; i < L; i++) { if (!i) { tr.push(c[i].h - c[i].l); pdm.push(0); ndm.push(0); continue; } const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l; pdm.push(up > dn && up > 0 ? up : 0); ndm.push(dn > up && dn > 0 ? dn : 0); tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c))); } let sTR = 0, sP = 0, sN = 0; for (let i = 1; i <= n; i++) { sTR += tr[i]; sP += pdm[i]; sN += ndm[i]; } const dx = new Array(L).fill(NaN); const dxAt = () => { const pdi = sTR > 0 ? 100 * sP / sTR : 0, ndi = sTR > 0 ? 100 * sN / sTR : 0; return pdi + ndi > 0 ? 100 * Math.abs(pdi - ndi) / (pdi + ndi) : 0; }; dx[n] = dxAt(); for (let i = n + 1; i < L; i++) { sTR = sTR - sTR / n + tr[i]; sP = sP - sP / n + pdm[i]; sN = sN - sN / n + ndm[i]; dx[i] = dxAt(); } let s = 0; for (let i = n; i < 2 * n; i++) s += dx[i]; out[2 * n - 1] = s / n; for (let i = 2 * n; i < L; i++) out[i] = (out[i - 1] * (n - 1) + dx[i]) / n; return out; }
const hIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].h.forEach((b, i) => m.set(b.t, i)); hIdx[cn] = m; }
const ADX = {}; const adxOf = (cn, tf, n) => { const k = cn + tf + n; return ADX[k] ||= adx(data[cn][tf], n); };
// ban(cn,t)：t＝進場 K 的時間（訊號 K 的下一根）；用訊號 K（i）的 ADX
const adxBan4h = (th, n = 14, inv = false) => (cn, t) => { const i = hIdx[cn].get(t); if (i == null || i < 1) return true; const v = adxOf(cn, "h", n)[i - 1]; if (!(v >= 0)) return true; return inv ? v < th : !(v < th); };
const adxBanD = (th, n = 14) => (cn, t) => { const i = dIdx[cn].get(dk(t) - 1); if (i == null) return true; const v = adxOf(cn, "d", n)[i]; if (!(v >= 0)) return true; return !(v < th); };
const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, extra: {} };
const L = ["# 策略實驗室 第二十九輪：C15 ADX 低檔突破濾網（波段A）＋R27 洗盤後量枯多＋補測 週一桶分狀態／波段A 套趨勢上不開單對照", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；OI 日資料 2025-05-08 起、費率 2024-05 起；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格。「原本」會前寫死（11/19 會議）：C15 套用於波段A → 原本＝波段A（波段B 版另列、原本＝波段B）；R27 持有可達 4 日 → 原本＝波段A；補測只當對照、不重判上線。樣本外 <30 筆＝判不了（不能上線、也不能說它差）。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣，下架幣不在內）；指標只用已收盤 K、已結算費率、OI 日末值；進場用下一根開盤；成本分級；C15 與波段A 同口徑（未計費率）；R27 未套 BTC 濾網（恐慌期多單題，另列套濾網版）、持有 ≤4 日未計費率；停損滑價另計；樣本內 65%／樣本外 35%，參數只在樣本內定；OI 只有 2025-05 起 18 個月，R27 基準事先聲明很可能判不了；各試組數寫在下面。", ""];

// ===== 實驗一：C15 ADX 低檔突破濾網（波段A）=====
L.push("## 實驗一：C15 ADX 低檔突破濾網（CEO 網上研究 11/18；原本＝波段A）", "",
  "定義：波段A 進場規則不變，另加「訊號 K（收盤突破 55 根高那根 4h K）的 4h ADX(14) < 25」才進場；出場不變。想法：突破發生在 ADX 低檔（盤整壓縮）時才做，跟分類員「盤整賺、趨勢上追高虧」是同一件事。審查：門檻 20／30、ADX 週期 11／17（1 基準＋4 鄰近）。另列：日線 ADX(14) < 25 版、反向對照（ADX ≥25 才進）、套用於波段B（原本＝波段B）、成本 ×1.5／×2。", "");
{
  const S = DEPTS[0], base = BASE.A; const raw = runRaw(S, UNI19, { ban: adxBan4h(25) }), v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, raw: raw.length }; let np = 0, nn = 0;
  L.push(...HDR, row("原本 波段A（判定用）", base), row("C15 基準（4h ADX14 < 25）" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm2, ban] of [["門檻 20", adxBan4h(20)], ["門檻 30", adxBan4h(30)], ["ADX 週期 11", adxBan4h(25, 11)], ["ADX 週期 17", adxBan4h(25, 17)]]) { const vv = seg(runRaw(S, UNI19, { ban })), nj = judge(base, vv); o.neigh[nm2] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm2, opt, S2, bb] of [["日線 ADX14 < 25 版", { ban: adxBanD(25) }], ["反向對照：ADX ≥25 才進", { ban: adxBan4h(25, 14, true) }], ["套用於波段B（原本＝波段B）", { ban: adxBan4h(25) }, DEPTS[1], BASE.B], ["成本 ×1.5（原本也 ×1.5）", { ban: adxBan4h(25), costMul: 1.5 }, S, seg(costMul(RAW.A, 1.5))], ["成本 ×2（原本也 ×2）", { ban: adxBan4h(25), costMul: 2 }, S, seg(costMul(RAW.A, 2))]]) { const rr = runRaw(S2 || S, UNI19, opt), vv = seg(rr), b2 = bb || base, nj = judge(b2, vv); o.extra[nm2] = { res: vv, judge: nj, be: breakEven(rr) }; L.push(row("　另列：" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); if (bb) L.push(row("　　（原本）", bb)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL); o.monthBase = monthly(base.ALL); o.be = breakEven(raw);
  // 被濾掉的單（波段A 有、C15 沒有）的表現
  const keep = new Set(raw.map(x => x.cn + ":" + x.t)); const cut0 = RAW.A.filter(x => !keep.has(x.cn + ":" + x.t)); const cs = cut0.length ? +(cut0.reduce((a, x) => a + x.R, 0) / cut0.length).toFixed(3) : null; const cw = cut0.length ? +(100 * cut0.filter(x => x.R > 0).length / cut0.length).toFixed(1) : null;
  o.cutBucket = { n: cut0.length, win: cw, avgR: cs };
  L.push("", `C15 基準：保留 ${raw.length} 筆（波段A 原始 ${RAW.A.length} 筆、被濾掉 ${cut0.length} 筆：勝率 ${cw}%、平均 ${cs}R）、損益兩平成本倍數 ${o.be}；出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}（原本 ${o.monthBase.months} 個月中 ${o.monthBase.pos} 個月為正${o.monthBase.top2 != null ? `、最好兩個月佔 ${Math.round(o.monthBase.top2 * 100)}%` : ""}）`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}`, "");
  OUT.exp1 = o; console.log("C15 完成", elapsed());
}

// ===== 實驗二：R27 洗盤後量枯多 =====
L.push("## 實驗二：R27 洗盤後量枯多（觀察員2 11/16；原本＝波段A）", "",
  "定義：D0＝UTC 日跌 ≤ −4% 且量 ≥2× 前 20 日均量且 OI 日減 ≥8%；D0 後 1–2 日內出現 D1＝量 ≤0.5× D0 且收盤高於 D0 低點且當日費率日合計 ≤0 → D1 收盤後首根 15 分K 開盤做多；停損＝D0 低點 −1%；出場＝+2R 或持有滿 4 日平倉；標的 40 幣有 OI 者；不套 BTC 濾網。審查：跌幅 3.2／4.8%、量倍 1.6／2.4、OI 減 6.4／9.6%、量縮 0.4／0.6、停損 0.8／1.2%、持有 3／5 日（1 基準＋12 鄰近）。另列：拿掉 OI 條件（30 個月對照）、拿掉費率條件、只 BTC／ETH／SOL、只在 BTC<EMA50 時、成本 ×1.5／×2。", "");
function r27(p = {}) {
  const drop = p.drop ?? +(process.env.R27_DROP || 0.04), volK = p.volK ?? +(process.env.R27_VOLK || 2), oiD = p.oiD ?? 0.08, shrink = p.shrink ?? +(process.env.R27_SHRINK || 0.5), buf = p.buf ?? 0.01, hold = p.hold ?? 4, win = 2, out = [];
  const list = p.big3 ? ["BTC", "ETH", "SOL"].filter(c => data[c]) : coins;
  for (const cn of list) {
    const d = data[cn].d, m = data[cn].m, mi = mIdx[cn]; let lastTx = 0;
    for (let i = 21; i < d.length - 3; i++) {
      if (d[i].t < lastTx) continue;
      const ret = d[i].c / d[i - 1].c - 1; if (!(ret <= -drop)) continue;
      let v20 = 0; for (let k = i - 20; k < i; k++) v20 += d[k].v; v20 /= 20; if (!(d[i].v >= volK * v20)) continue;
      if (!p.noOI) { const oc = oiChg(cn, dk(d[i].t), 1); if (isNaN(oc) || !(oc <= -oiD)) continue; }
      if (p.bear && btcUp.get(dk(d[i].t)) !== false) continue;
      let j1 = -1; for (let j = i + 1; j <= i + win && j < d.length - 1; j++) { if (d[j].l <= d[i].l) break; if (!(d[j].v <= shrink * d[i].v)) continue; if (!(d[j].c > d[i].l)) continue; if (!p.noFund) { const f = frAt(cn, dk(d[j].t)); if (isNaN(f) || !(f <= 0)) continue; } j1 = j; break; }
      if (j1 < 0) continue;
      const entT = d[j1].t + D1, i0 = mi.get(entT); if (i0 == null) continue;
      const e = m[i0].o, st = d[i].l * (1 - buf), r = e - st; if (!(r > 0) || r / e < 0.002) continue;
      const tgt = e + 2 * r, tEnd = entT + hold * D1; let ex = null, why = "", k = i0;
      for (; k < m.length; k++) { const x = m[k]; if (x.l <= st) { ex = Math.min(x.o, st); why = "停損"; break; } if (x.h >= tgt) { ex = Math.max(x.o, tgt); why = "+2R"; break; } if (x.t + M15 >= tEnd) { ex = x.c; why = "時間停損"; break; } }
      if (ex == null) continue;
      const gross = (ex - e) / r, costR = tieredCost(cn, entT) * e / r;
      out.push({ cn, t: entT, tx: m[k].t + M15, R: gross - (p.costK || 1) * costR, gross, costR, why, state: stateAt(entT), ret: +(ret * 100).toFixed(1) }); lastTx = m[k].t + M15;
    }
  }
  return out;
}
{
  const base = BASE.A; const raw = r27(), v = seg(raw), j = judge(base, v);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, raw: raw.length }; let np = 0, nn = 0;
  L.push(...HDR, row("原本 波段A（判定用）", base), row("R27 基準（跌 4%、量 2×、OI −8%、量縮 0.5、緩衝 1%、持有 4 日）" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm2, p] of [["跌幅 3.2%", { drop: 0.032 }], ["跌幅 4.8%", { drop: 0.048 }], ["量倍 1.6", { volK: 1.6 }], ["量倍 2.4", { volK: 2.4 }], ["OI 減 6.4%", { oiD: 0.064 }], ["OI 減 9.6%", { oiD: 0.096 }], ["量縮 0.4", { shrink: 0.4 }], ["量縮 0.6", { shrink: 0.6 }], ["停損緩衝 0.8%", { buf: 0.008 }], ["停損緩衝 1.2%", { buf: 0.012 }], ["持有 3 日", { hold: 3 }], ["持有 5 日", { hold: 5 }]]) { const vv = seg(r27(p)), nj = judge(base, vv); o.neigh[nm2] = { res: vv, judge: nj }; nn++; if (nj.pass) np++; L.push(row("　" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); }
  for (const [nm2, p, bb] of [["拿掉 OI 條件（30 個月對照）", { noOI: true }], ["拿掉 OI＋拿掉費率條件", { noOI: true, noFund: true }], ["拿掉 OI＋只在 BTC<EMA50 時", { noOI: true, bear: true }], ["拿掉費率條件", { noFund: true }], ["只 BTC／ETH／SOL（拿掉 OI）", { noOI: true, big3: true }], ["成本 ×1.5（原本也 ×1.5）", { costK: 1.5 }, seg(costMul(RAW.A, 1.5))], ["成本 ×2（原本也 ×2）", { costK: 2 }, seg(costMul(RAW.A, 2))], ["拿掉 OI＋成本 ×1.5", { noOI: true, costK: 1.5 }, seg(costMul(RAW.A, 1.5))], ["拿掉 OI＋成本 ×2", { noOI: true, costK: 2 }, seg(costMul(RAW.A, 2))]]) { const rr = r27(p), vv = seg(rr), b2 = bb || base, nj = judge(b2, vv); o.extra[nm2] = { res: vv, judge: nj, be: breakEven(rr), month: monthly(vv.ALL) }; L.push(row("　另列：" + nm2 + (nj.pass ? " ✅" : " ❌"), vv)); if (bb) L.push(row("　　（原本）", bb)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = j.pass && o.overfit.ok; o.note = verdictNote(j, v); o.month = monthly(v.ALL); o.be = breakEven(raw);
  const ctl = o.extra["拿掉 OI 條件（30 個月對照）"];
  L.push("", `R27 基準：原始訊號 ${raw.length} 筆、損益兩平成本倍數 ${o.be}；出場原因：${byW(v.ALL)}；分狀態：${bySt(v.ALL)}；分幣（前 8）：${byC(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`拿掉 OI 對照（30 個月）：損益兩平 ${ctl.be}；出場原因：${byW(ctl.res.ALL)}；分狀態：${bySt(ctl.res.ALL)}；分幣（前 8）：${byC(ctl.res.ALL)}；按月：${ctl.month.text}；時間穩定：${ctl.month.months} 個月中 ${ctl.month.pos} 個月為正${ctl.month.top2 != null ? `、最好兩個月佔總R ${Math.round(ctl.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}；拿掉 OI 對照：${J(ctl.judge)} ${verdictNote(ctl.judge, ctl.res)}`, "");
  OUT.exp2 = o; console.log("R27 完成", elapsed());
}

// ===== 補測：週一桶分狀態＋波段A 套狀態濾網對照 =====
L.push("## 補測（不佔名額）：週一桶分狀態（波段A／波段B／日內B）＋波段A 套「趨勢上不開單」「只在盤整開單」對照", "",
  "問題：日內D（已排除趨勢上）的週一桶是正的、其他部門的週一桶都是負的 → 「週一差」是不是其實就是「趨勢上追高差」？拆法：進場時刻（UTC）落在週一 00:00～24:00 的單＝週一桶，其餘＝非週一；再按進場前一日的市場狀態（第十二輪定義：恐慌＝5 日報酬 ≤ −8% 或 ATR/價 ≥4.5%；趨勢上＝收盤 > EMA50×1.03；趨勢下＝< EMA50×0.97；其餘盤整）拆開。", "");
const MON0 = Date.UTC(2024, 0, 1);
const wk = t => (((t - MON0) % (7 * D1)) + 7 * D1) % (7 * D1);
const isMon = t => wk(t) < 24 * H1;
{
  OUT.extra.monState = {};
  L.push("| 部門 | 桶 | 狀態 | 筆數 | 勝率 | 平均R | 合計R |", "|---|---|---|---|---|---|---|");
  for (const S of DEPTS) {
    const tr = RAW[S.key]; const g = {};
    for (const x of tr) { const k = (isMon(x.t) ? "週一" : "非週一") + "|" + (x.state || "未知"); const v = g[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; }
    const rows = {};
    for (const b of ["週一", "非週一"]) for (const st of ["趨勢上", "盤整", "趨勢下", "恐慌", "未知"]) { const v = g[b + "|" + st]; if (!v) continue; rows[b + "|" + st] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3), sumR: +v.s.toFixed(2) }; L.push(`| ${S.name} | ${b} | ${st} | ${v.n} | ${rows[b + "|" + st].win}% | ${rows[b + "|" + st].avgR} | ${rows[b + "|" + st].sumR} |`); }
    OUT.extra.monState[S.key] = rows;
  }
  L.push("");
  // 波段A 套狀態濾網對照（run16／17 已結案，不重判上線）
  const base = BASE.A; const onlyRange = (cn, t) => stateAt(t) !== "盤整";
  const vT = seg(runRaw(DEPTS[0], UNI19, { ban: (cn, t) => trendBlock(t) })), vR = seg(runRaw(DEPTS[0], UNI19, { ban: onlyRange })), jT = judge(base, vT), jR = judge(base, vR);
  L.push(...HDR, row("原本 波段A", base), row("對照：波段A＋趨勢上不開單" + (jT.pass ? " ✅" : " ❌"), vT), row("對照：波段A 只在盤整開單" + (jR.pass ? " ✅" : " ❌"), vR), row("參考：波段A-M（週一不開單，run27 已上線）", seg(runRaw(DEPTS[0], UNI19, { ban: (cn, t) => isMon(t) }))));
  const mT = monthly(vT.ALL), mR = monthly(vR.ALL);
  L.push("", `趨勢上不開單：${J(jT)}${verdictNote(jT, vT)}；按月 ${mT.months} 個月中 ${mT.pos} 個月為正${mT.top2 != null ? `、最好兩個月佔 ${Math.round(mT.top2 * 100)}%` : ""}；分狀態：${bySt(vT.ALL)}`);
  L.push(`只在盤整開單：${J(jR)}${verdictNote(jR, vR)}；按月 ${mR.months} 個月中 ${mR.pos} 個月為正${mR.top2 != null ? `、最好兩個月佔 ${Math.round(mR.top2 * 100)}%` : ""}；分狀態：${bySt(vR.ALL)}`);
  // 週一＋趨勢上 疊加：波段A 同時拿掉週一與趨勢上
  const vMT = seg(runRaw(DEPTS[0], UNI19, { ban: (cn, t) => isMon(t) || trendBlock(t) })), jMT = judge(base, vMT);
  L.push(row("對照：波段A 週一不開＋趨勢上不開（疊加）" + (jMT.pass ? " ✅" : " ❌"), vMT), "");
  OUT.extra.stateCtl = { trend: { res: vT, judge: jT }, range: { res: vR, judge: jR }, monTrend: { res: vMT, judge: jMT } };
  L.push("補測只當對照：run16／17 已判波段A 套狀態濾網「兩段方向相反、不合格」結案；這裡看的是「週一桶在哪個狀態虧」，用來決定波段A-M 跟狀態濾網是不是同一件事，不重判上線。", "");
  console.log("補測完成", elapsed());
}
L.push(`結論：C15 ${nm(OUT.exp1)}（全期 ${OUT.exp1.res.ALL.n} 筆、樣本外 ${OUT.exp1.res.OOS.n} 筆；鄰近 ${OUT.exp1.overfit.pass}/${OUT.exp1.overfit.n}）；R27 ${nm(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆；OI 只有 18 個月；拿掉 OI 對照 ${OUT.exp2.extra["拿掉 OI 條件（30 個月對照）"].judge.pass ? "合格" : "不合格"}，全期 ${OUT.exp2.extra["拿掉 OI 條件（30 個月對照）"].res.ALL.n} 筆）；補測見上表。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
await fs.writeFile("lab/report29.md", L.join("\n"));
await fs.writeFile("lab/results29.json", JSON.stringify(OUT));
console.log(L.join("\n"));
