// 策略實驗室 第三十八輪（11/28 會議決議）
// 名額①（觀察員1 11/27 R51 ＋ 11/22 R38 合併；CEO 網上研究 11/28 括號單當另列變體）：事件日雙向動能（BTC 基準、ETH 另列）。定義（照 queue R51 原文）：BTCUSDT 15 分K；非農／CPI／FOMC（基準三類；PPI 另列）公布時刻那根 15 分K（事件 K）若振幅（高−低）≥ 前 20 根平均振幅 ×1.5 → 次根 K（第 2 根）收盤 > 事件K 高點做多／< 事件K 低點做空，第 3 根開盤成交；停損＝事件K 另一端；出場＝進場後 8 根（2 小時）收盤或先到 +1.5R；|當日費率日合計| > 0.05%（≈0.017%/8h）時只做費率反向方向（費率正只做空、負只做多）；不加碼、一場事件最多 1 筆。5 個參數（1.5、1.5R、8 根、0.05%、20 根）。鄰近 8 組：振幅 1.2／1.8、停利 1.2R／1.8R、出場 6／10 根、回看 16／24 根。另列：不看費率方向、含 PPI、ETH 同規則、R38 變體（事件日前一日 BTC 日收 < EMA50×0.92 才做＋第 2 根 |Δ| ≥0.8% 順勢＋停損 30 分鐘窗口反向極值外推 0.3%＋出場 8 小時或 2R）、CEO 括號單變體（公布前一根收盤 P0 ± 1×ATR(15m,20) 掛雙向停止單，先成交那邊進場、另一邊當停損、出場 4 小時或 2R）、成本 ×1.5／×2、損益兩平、分事件類別、分狀態、按月、停損高原（×0.75／×1.25：以事件K 另一端外推 ∓25% 振幅）。原本＝日內（≥1 億U）。
// 名額②（CEO 網上研究 11/11 C11，低優先、只做一次快速否證）：BTC 10 日新高隔夜多。定義（照 queue 原文）：BTC 日線（UTC）收盤 ≥ 近 10 日最高收盤 → 當天若為週五／週一／週二（美東日期），美東 16:00 那根 15 分K 開盤做多，隔天美東 10:00 那根收盤平倉；無停損（另列 2×ATR14（日）停損）；成本分級（BTC 0.14%）；1R＝2×日ATR14（算 R 用，無停損版也用同一個 R 換算）。鄰近 6 組：10 日→8／12 日、平倉 10:00→09:00／11:00、只週五版、每天都做版。另列：2×ATR 停損版、反向（10 日新低隔夜空）對照、成本 ×1.5／×2、分狀態、按月。原本＝日內（≥1 億U）。
// 補測（不佔名額）：R56 費率擁擠＋OI 暴增 禁多濾網統計（觀察員2 11/28）：40 幣任一幣，前一日費率日合計 ≥ +0.30%（≈3 次平均 0.10%/8h）且日 OI 增幅 ≥ +40% → 觸發；統計觸發後 1／3 日該幣報酬分布 vs 該幣全部日子基準；並列觸發後 2 日內波段A／日內B 在該幣的多單筆數與平均R（反事實：被擋掉的單）。OI 2025-05 起。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K、已結算費率（日合計，費率方向濾網用「事件前一日」的日合計，不含當日）；進場用下一根開盤；成本分級（BTC 0.14% 來回）；空單費率腿＝跨 00／08／16 結算點時收（付）當日費率 ÷3；停損用 max/min(開盤,停損) 保守出、滑價另計（事件日滑價偏大，另列成本 ×2 當保守估）；美東時間冬令／夏令照 nthSunday 換算；樣本內 65%／樣本外 35%，參數只在樣本內定、樣本外只看不調；各試組數寫在報告。
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
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "I", name: "日內（≥1 億U）", kind: "intra", q: QI, x: XA, f: { liq: 100 } },
];
const runRaw = (S, U, o) => U.list.flatMap(cn => trades(cn, S, U, o));
const RAW = {}, BASE = {};
for (const S of DEPTS) { RAW[S.key] = runRaw(S, UNI19); BASE[S.key] = seg(RAW[S.key]); console.log("原本", S.key, BASE[S.key].ALL.n, elapsed()); }
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
if (process.env.MOCK) for (const cn of coins) for (const k in FO.coins[cn].fr) FO.coins[cn].fr[k] = +(FO.coins[cn].fr[k] * 0.3 + (cn.charCodeAt(0) % 5) * 0.01 * Math.sin(+k / 9)).toFixed(4);
const BIG3 = new Set(["BTC", "ETH", "SOL"]);
const legs = tr => tr.length ? `價格腿 ${(tr.reduce((a, x) => a + (x.legP || 0), 0) / tr.length).toFixed(3)}R、費率腿 ${(tr.reduce((a, x) => a + (x.legF || 0), 0) / tr.length).toFixed(3)}R／筆` : "—";
function sharpe30(cn, day) { const i = dIdx[cn].get(day); if (i == null || i < 31) return NaN; const d = data[cn].d, rs = []; for (let j = i - 29; j <= i; j++) rs.push(Math.log(d[j].c / d[j - 1].c)); const mu = rs.reduce((a, x) => a + x, 0) / rs.length, sd = Math.sqrt(rs.reduce((a, x) => a + (x - mu) ** 2, 0) / (rs.length - 1)); return sd > 0 ? mu / sd * Math.sqrt(365) : NaN; }
const dayStart = dk(t0), dayEnd = dk(t1);
function portfolioK(ts0, from, to, maxOpen = 16) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0, lf = 0, lp = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {};
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  for (const x of ts) { settle(x.t); const key = x.k || x.cn; if (open.length >= maxOpen || open.some(o => (o.k || o.cn) === key)) continue; open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; lf += x.legF || 0; lp += x.legP || 0; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R); }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, legF: n ? +(lf / n).toFixed(3) : 0, legP: n ? +(lp / n).toFixed(3) : 0, cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const segK = (tr, mo = 16) => ({ IS: portfolioK(tr, t0, cut, mo), OOS: portfolioK(tr, cut, Infinity, mo), ALL: portfolioK(tr, t0, Infinity, mo) });
const bySd = p => Object.entries(p.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";


// ===== 共用：日 ATR、R48 濾網、順跌 Sharpe =====
const dATR = (cn, day) => { const i = dIdx[cn].get(day); return i == null ? NaN : pre[cn].d.a[i]; };
const dClose = (cn, day) => { const i = dIdx[cn].get(day); return i == null ? NaN : data[cn].d[i].c; };
// R48（觀察員2 11/26）：BTC 連續 2 個 UTC 日費率日合計 ≤0 且 2 日 OI ≥ +3% 且 2 日跌幅 ≤5% → 當日收盤後觸發；之後 72h（3 個 UTC 日）或遇到費率日合計 >0 的日子結束後解除
const R48 = new Set(), R48trig = [];
{ const d = data.BTC.d; for (let i = 2; i < d.length; i++) { const day = dk(d[i].t); const f0 = frAt("BTC", day), f1 = frAt("BTC", day - 1), oc = oiChg("BTC", day, 2), r2 = d[i].c / d[i - 2].c - 1; if (f0 <= 0 && f1 <= 0 && oc >= 0.03 && r2 >= -0.05) { R48trig.push(day); for (let k = 1; k <= 3; k++) { R48.add(day + k); if (frAt("BTC", day + k) > 0) break; } } } }
const r48Active = day => R48.has(day);
console.log("R48 觸發", R48trig.length, "禁空日", R48.size, elapsed());
const settleBar = t => { const h = new Date(t).getUTCHours(), mi = new Date(t).getUTCMinutes(); return mi === 0 && (h === 0 || h === 8 || h === 16); };

// ===== 名額①：事件日雙向動能（R51＋R38 合併；CEO 括號單變體）=====
const BTC_E50 = new Map(); bD.forEach((b, i) => BTC_E50.set(dk(b.t), bE[i]));
function evMom(p) {
  const cn = p.cn || "BTC", k = p.k ?? 1.5, tp = p.tp ?? 1.5, bars = p.bars ?? 8, look = p.look ?? 20, frThr = p.frThr ?? 0.05, useFr = p.useFr !== false, mode = p.mode || "r51", stopK = p.stopK ?? 0, costK = p.costK || 1, list = p.evs || EV, out = [], seen = new Set();
  const m = data[cn].m, idx = mIdx[cn], A14 = pre[cn].m.a; let nEv = 0, nSig = 0;
  for (const ev of list) {
    if (ev.t < t0 || ev.t > t1 - 2 * D1) continue;
    const i1 = idx.get(ev.t); if (i1 == null || i1 < look + 1 || i1 + 40 >= m.length) continue;
    const key = ev.t; if (seen.has(key)) continue; seen.add(key); nEv++;
    const liq = LIQ[cn].get(dk(ev.t) - 1); if (!(liq >= 100e6)) continue;
    if (p.panic && !(dClose("BTC", dk(ev.t) - 1) < BTC_E50.get(dk(ev.t) - 1) * 0.92)) continue;
    const P0 = m[i1 - 1].c; let avg = 0; for (let j = i1 - look; j < i1; j++) avg += m[j].h - m[j].l; avg /= look;
    const b1 = m[i1], b2 = m[i1 + 1];
    let dir = 0, e, st, iE, tgtR, maxBars;
    if (mode === "r51") {
      if (!(b1.h - b1.l >= k * avg)) continue;
      if (b2.c > b1.h) dir = 1; else if (b2.c < b1.l) dir = -1; else continue;
      iE = i1 + 2; e = m[iE].o; const rng = b1.h - b1.l; st = dir > 0 ? b1.l - stopK * rng : b1.h + stopK * rng; tgtR = tp; maxBars = bars;
    } else if (mode === "r38") {
      const d2 = b2.c / P0 - 1; if (!(Math.abs(d2) >= (p.thr ?? 0.008))) continue; dir = d2 > 0 ? 1 : -1;
      iE = i1 + 2; e = m[iE].o; const lo = Math.min(b1.l, b2.l), hi = Math.max(b1.h, b2.h); st = dir > 0 ? lo * (1 - 0.003) : hi * (1 + 0.003); tgtR = 2; maxBars = 32;
    } else { // bracket：P0 ± 1×ATR14(15m)，事件K 起 8 根內先碰到那邊成交
      const w = (p.brK ?? 1) * A14[i1 - 1]; const up = P0 + w, dn = P0 - w; let hit = null;
      for (let j = i1; j < i1 + 8; j++) { const b = m[j]; const u = b.h >= up, d = b.l <= dn; if (u && d) { hit = "both"; break; } if (u) { hit = { dir: 1, j, e: Math.max(b.o, up) }; break; } if (d) { hit = { dir: -1, j, e: Math.min(b.o, dn) }; break; } }
      if (!hit || hit === "both") continue; dir = hit.dir; iE = hit.j; e = hit.e; st = dir > 0 ? dn : up; tgtR = 2; maxBars = 16;
    }
    nSig++;
    if (p.onlyDir && dir !== p.onlyDir) continue;
    if (useFr) { const f = frAt(cn, dk(ev.t) - 1); if (!isNaN(f) && Math.abs(f) > frThr && Math.sign(f) === dir) continue; }
    const r = Math.abs(e - st); if (!(r > 0) || r / e < 0.001) continue;
    const tgt = dir > 0 ? e + tgtR * r : e - tgtR * r; let ex = null, tx = null, why = "", legF = 0;
    const jStart = mode === "bracket" ? iE : iE; // 括號單：成交那根就可能碰停損／停利，從同根檢查（保守：同根先碰停損算停損）
    for (let j = jStart, nb = 0; j < m.length; j++, nb++) {
      const b = m[j]; if (j > iE && settleBar(b.t)) { const f2 = frAt(cn, dk(b.t)); if (!isNaN(f2)) legF += -dir * f2 / 3 / 100 * e / r; }
      if (dir > 0 ? b.l <= st : b.h >= st) { ex = dir > 0 ? Math.min(b.o, st) : Math.max(b.o, st); if (j === iE) ex = st; tx = b.t + M15; why = "停損"; break; }
      if (dir > 0 ? b.h >= tgt : b.l <= tgt) { ex = tgt; tx = b.t + M15; why = "停利"; break; }
      if (nb + 1 >= maxBars) { ex = b.c; tx = b.t + M15; why = "時間平倉"; break; }
    }
    if (ex == null) continue;
    const legP = dir * (ex - e) / r, costR = tieredCost(cn, m[iE].t) * costK * e / r;
    out.push({ cn, k: cn, t: m[iE].t, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: dir < 0 ? "空" : "多", state: stateAt(m[iE].t), ev: ev.k });
  }
  return { res: segK(out, p.maxOpen || 1), raw: out, nEv, nSig };
}

// ===== 名額②：C11 BTC 10 日新高隔夜多 =====
function c11(p) {
  const cn = "BTC", N = p.N ?? 10, exitHM = p.exit || "10:00", days = p.days || [5, 1, 2], dir = p.dir ?? 1, useStop = !!p.stop, costK = p.costK || 1, out = [];
  const m = data[cn].m, idx = mIdx[cn], d = data[cn].d;
  const dayAt = (t) => { const x = new Date(t); return x.toISOString().slice(0, 10); };
  for (let t = Math.floor(t0 / D1) * D1; t < t1 - 2 * D1; t += D1) {
    const ds = dayAt(t), nxt = dayAt(t + D1), tE = etToUtc(ds, "16:00"), tX = etToUtc(nxt, exitHM);
    const wd = new Date(tE - 5 * H1).getUTCDay(); // 美東日期的星期（粗略用 −5h；DST 期間 16:00 ET 仍同一天）
    if (days.length && !days.includes(wd)) continue;
    const day = dk(tE) - 1, i = dIdx[cn].get(day); if (i == null || i < N + 15) continue;
    let ext = dir > 0 ? -Infinity : Infinity; for (let j = i - N + 1; j <= i; j++) ext = dir > 0 ? Math.max(ext, d[j].c) : Math.min(ext, d[j].c);
    if (!(dir > 0 ? d[i].c >= ext : d[i].c <= ext)) continue;
    const iE = idx.get(tE); if (iE == null) continue; const e = m[iE].o, r = 2 * pre[cn].d.a[i]; if (!(r > 0)) continue;
    const st = dir > 0 ? e - r : e + r; let ex = null, tx = null, why = "", legF = 0;
    for (let j = iE; j < m.length; j++) { const b = m[j]; if (j > iE && settleBar(b.t)) { const f = frAt(cn, dk(b.t)); if (!isNaN(f)) legF += -dir * f / 3 / 100 * e / r; } if (useStop && (dir > 0 ? b.l <= st : b.h >= st)) { ex = dir > 0 ? Math.min(b.o, st) : Math.max(b.o, st); tx = b.t + M15; why = "停損"; break; } if (b.t + M15 >= tX) { ex = b.c; tx = b.t + M15; why = "時間平倉"; break; } }
    if (ex == null) continue;
    const legP = dir * (ex - e) / r, costR = tieredCost(cn, tE) * costK * e / r;
    out.push({ cn, k: cn, t: tE, tx, R: legP + legF - costR, gross: legP + legF, legP, legF, costR, why, side: dir < 0 ? "空" : "多", state: stateAt(tE) });
  }
  return { res: segK(out, 1), raw: out };
}

// ===== 報告 =====
const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, r56: {} };
const L = ["# 策略實驗室 第三十八輪：事件日雙向動能（R51＋R38 合併＋CEO 括號單變體，BTC／ETH）＋C11 BTC 10 日新高隔夜多（快速否證）＋補測 R56 費率擁擠＋OI 暴增 禁多濾網統計", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；名額①②都是 BTC 單張；原本＝日內（≥1 億U）最多 5 張；事件 FOMC／CPI／非農 ${EV.length} 場、含 PPI ${EVP.length} 場`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；含空單「損益兩平成本倍數 <1.5 直接淘汰」（常設條款，雙向題也套）。「原本」會前寫死（11/28 會議）：兩題都對日內（≥1 億U）。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差）；指標只用已收盤 K、已結算費率（費率方向濾網用事件前一日日合計）；進場用下一根開盤（括號單用停止價或開盤較差者）；成本分級、事件日另列 ×2 當滑價保守估；費率腿＝跨結算點時收（付）當日費率 ÷3；停損以較差價保守出；C11 的訊號用「進場前最後一個已收盤 UTC 日」（原文美東收盤判斷有前視，已改掉）；美東冬令／夏令照換算；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在下面。", ""];
const nmOf = x => x.ok ? "合格" : (x.res.OOS.n < 30 || x.res.IS.n < 30) ? "判不了" : "不合格";
const base = BASE.I, base15 = seg(runRaw(DEPTS[2], UNI19, { costMul: 1.5 })), base2 = seg(runRaw(DEPTS[2], UNI19, { costMul: 2 }));
function evSplit(raw) { const m = {}; for (const x of raw) { const v = m[x.ev] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } return Object.entries(m).map(([k, v]) => `${k} ${v.n} 筆／${(v.w / v.n * 100).toFixed(0)}%／${(v.s / v.n).toFixed(3)}R`).join("；") || "無"; }
function block(title, defn, P, fn, neigh, extras, opt = {}) {
  L.push(title, "", defn, "");
  const r = fn(P), v = r.res, j = judge(base, v), be = breakEven(r.raw);
  const o = { base, res: v, judge: j, neigh: {}, extra: {}, be, nEv: r.nEv, nSig: r.nSig }; let np = 0, nn = 0;
  L.push(`### 基準`, "", `全期 ${v.ALL.n} 筆${r.nEv != null ? `（事件 ${r.nEv} 場、觸發 ${r.nSig} 場）` : ""}；${legs(r.raw)}；損益兩平成本倍數 ${be}；出場原因：${byW(v.ALL)}；多空：${bySd(v.ALL)}${r.raw[0]?.ev ? `；分事件：${evSplit(r.raw)}` : ""}`, "", ...HDR, row("原本 日內（≥1 億U）（判定用）", base), row("基準" + (j.pass ? " ✅" : " ❌"), v));
  for (const [nm, q] of neigh) { const rr = fn({ ...P, ...q }), vv = rr.res, nj = judge(base, vv); o.neigh[nm] = { res: vv, judge: nj, be: breakEven(rr.raw) }; nn++; if (nj.pass) np++; L.push(row("　" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆）`, vv)); }
  for (const [nm, q] of extras) { const b2 = q.costK === 1.5 ? base15 : q.costK === 2 ? base2 : base; const rr = fn({ ...P, ...q }), vv = rr.res, nj = judge(b2, vv); o.extra[nm] = { res: vv, judge: nj, be: breakEven(rr.raw), n: vv.ALL.n }; L.push(row("　另列：" + nm + (nj.pass ? " ✅" : " ❌") + `（${vv.ALL.n} 筆，損益兩平 ${breakEven(rr.raw)}${rr.raw[0]?.ev ? `；${evSplit(rr.raw)}` : ""}）`, vv)); if (/×/.test(nm)) L.push(row(`　　（原本 ${nm}）`, b2)); }
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.beOK = !(be != null && be < 1.5); o.ok = j.pass && o.overfit.ok && o.beOK; o.note = verdictNote(j, v); o.month = monthly(v.ALL);
  L.push("", `基準 分狀態：${bySt(v.ALL)}；按月平均R：${o.month.text}；時間穩定：${o.month.months} 個月中 ${o.month.pos} 個月為正${o.month.top2 != null ? `、最好兩個月佔總R ${Math.round(o.month.top2 * 100)}%` : ""}`);
  L.push(`判定：${J(j)} ${o.note}；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"}；損益兩平 ${be}（${o.beOK ? "≥1.5 過" : "<1.5 淘汰"}）→ ${o.ok ? "**合格**" : (v.OOS.n < 30 || v.IS.n < 30) ? "**判不了**" : "**不合格**"}${opt.tail || ""}`, "");
  return o;
}
{
  const P = { cn: "BTC", k: 1.5, tp: 1.5, bars: 8, look: 20, frThr: 0.05, mode: "r51", evs: EV };
  OUT.exp1 = block("## 名額①：事件日雙向動能（R51＋R38 合併；原本＝日內（≥1 億U））",
    "定義：BTCUSDT 15 分K；FOMC／CPI／非農公布那根 15 分K 振幅 ≥ 前 20 根平均 ×1.5 → 第 2 根收盤 > 事件K 高做多／< 低做空，第 3 根開盤進場；停損＝事件K 另一端；出場＝8 根（2h）或 +1.5R；前一日 |費率日合計| >0.05% 只做費率反向。鄰近 8 組：振幅 1.2／1.8、停利 1.2R／1.8R、出場 6／10 根、回看 16／24 根。另列：不看費率方向、含 PPI、ETH、R38 恐慌期變體、CEO 括號單變體（含恐慌期版、ETH 版）、停損高原（外推 ∓25% 振幅）、成本 ×1.5／×2、分事件、分狀態、按月。",
    P, evMom,
    [["振幅 1.2", { k: 1.2 }], ["振幅 1.8", { k: 1.8 }], ["停利 1.2R", { tp: 1.2 }], ["停利 1.8R", { tp: 1.8 }], ["出場 6 根", { bars: 6 }], ["出場 10 根", { bars: 10 }], ["回看 16 根", { look: 16 }], ["回看 24 根", { look: 24 }]],
    [["不看費率方向", { useFr: false }], ["含 PPI（4 類事件）", { evs: EVP }], ["ETH 同規則", { cn: "ETH" }], ["ETH 不看費率", { cn: "ETH", useFr: false }], ["只做多（事後切片、只看）", { onlyDir: 1, useFr: false, k: 1.5 }], ["R38 恐慌期變體（EMA50×0.92 下、第 2 根 |Δ|≥0.8%、停損 30 分窗極值外 0.3%、8h 或 2R）", { mode: "r38", panic: true, useFr: false }], ["R38 變體不限恐慌期", { mode: "r38", panic: false, useFr: false }], ["CEO 括號單（P0±1×ATR14、4h 或 2R）", { mode: "bracket", useFr: false }], ["CEO 括號單＋費率方向", { mode: "bracket", useFr: true }], ["CEO 括號單 ETH", { mode: "bracket", useFr: false, cn: "ETH" }], ["CEO 括號單 ±1.5×ATR", { mode: "bracket", useFr: false, brK: 1.5 }], ["CEO 括號單 恐慌期", { mode: "bracket", useFr: false, panic: true }], ["停損外推 25% 振幅（×1.25）", { stopK: 0.25 }], ["停損內縮 25% 振幅（×0.75）", { stopK: -0.25 }], ["成本 ×1.5", { costK: 1.5 }], ["成本 ×2", { costK: 2 }]],
    { tail: "；事件型一年約 36 場，樣本外 <30 幾乎確定＝判不了；本題主要看「數字方向」決定 R36 家族是否整個結案" });
  console.log("名額① 完成", OUT.exp1.res.ALL.n, elapsed());
}
{
  const P = { N: 10, exit: "10:00", days: [5, 1, 2] };
  OUT.exp2 = block("## 名額②：C11 BTC 10 日新高隔夜多（CEO 網上研究 11/11，Quantpedia；原本＝日內（≥1 億U））",
    "定義：BTC 日線（UTC）收盤 ≥ 近 10 日最高收盤（用進場前最後一個已收盤 UTC 日）→ 美東週五／週一／週二 16:00 那根 15 分K 開盤做多，隔天美東 10:00 收盤平倉；無停損；1R＝2×日ATR14。鄰近 6 組：8／12 日、平倉 09:00／11:00、只週五、每天都做。另列：2×ATR 停損版、反向 10 日新低隔夜空對照、成本 ×1.5／×2、分狀態、按月。",
    P, c11,
    [["8 日新高", { N: 8 }], ["12 日新高", { N: 12 }], ["平倉 09:00", { exit: "09:00" }], ["平倉 11:00", { exit: "11:00" }], ["只週五", { days: [5] }], ["每天都做", { days: [] }]],
    [["2×ATR 停損版", { stop: true }], ["反向：10 日新低隔夜空（對照）", { dir: -1 }], ["反向＋每天", { dir: -1, days: [] }], ["成本 ×1.5", { costK: 1.5 }], ["成本 ×2", { costK: 2 }]],
    { tail: "；低優先快速否證：不合格或判不了都結案不再排" });
  console.log("名額② 完成", OUT.exp2.res.ALL.n, elapsed());
}
// ----- 補測：R56 統計 -----
{
  const stat = arr => { const a = arr.filter(x => !isNaN(x)).sort((x, y) => x - y); if (!a.length) return "無"; const mu = a.reduce((s, x) => s + x, 0) / a.length, med = a[Math.floor(a.length / 2)], pos = a.filter(x => x > 0).length / a.length; return `n=${a.length}、平均 ${(mu * 100).toFixed(2)}%、中位 ${(med * 100).toFixed(2)}%、上漲機率 ${(pos * 100).toFixed(0)}%`; };
  const FRT = +(process.env.R56_FR || 0.30), OIT = +(process.env.R56_OI || 0.40);
  const t1s = [], t3s = [], a1s = [], a3s = [], trig = []; const I2raw = runRaw({ key: "I2", name: "日內B", kind: "intra", q: QI, x: XA, f: { liq: 500 } }, UNI19);
  const blockedA = [], blockedI = [];
  for (const cn of coins) { const d = data[cn].d; if (!Object.keys(OI(cn)).length) continue; for (let i = 1; i < d.length - 3; i++) { const day = dk(d[i].t); const oc = oiChg(cn, day, 1), f = frAt(cn, day); if (isNaN(oc)) continue; const r1 = d[i + 1].c / d[i].c - 1, r3 = d[i + 3].c / d[i].c - 1; a1s.push(r1); a3s.push(r3); if (f >= FRT && oc >= OIT) { trig.push({ cn, day, f, oc, r1, r3 }); t1s.push(r1); t3s.push(r3); for (const x of RAW.A) if (x.cn === cn && dk(x.t) > day && dk(x.t) <= day + 2) blockedA.push(x.R); for (const x of I2raw) if (x.cn === cn && dk(x.t) > day && dk(x.t) <= day + 2) blockedI.push(x.R); } } }
  const avg = a => a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(3) : "—";
  // 放寬版（線索用）：費率 ≥0.15%、OI ≥+25%
  const t1b = [], t3b = [], trigB = []; for (const cn of coins) { const d = data[cn].d; if (!Object.keys(OI(cn)).length) continue; for (let i = 1; i < d.length - 3; i++) { const day = dk(d[i].t); const oc = oiChg(cn, day, 1), f = frAt(cn, day); if (isNaN(oc)) continue; if (f >= 0.15 && oc >= 0.25) { trigB.push(cn); t1b.push(d[i + 1].c / d[i].c - 1); t3b.push(d[i + 3].c / d[i].c - 1); } } }
  OUT.r56 = { n: trig.length, t1: stat(t1s), t3: stat(t3s), a1: stat(a1s), a3: stat(a3s), blockedA: { n: blockedA.length, avg: avg(blockedA) }, blockedI: { n: blockedI.length, avg: avg(blockedI) }, loose: { n: trigB.length, t1: stat(t1b), t3: stat(t3b) }, list: trig.map(x => `${x.cn} ${fmtD(x.day * D1)}（費率 ${x.f.toFixed(2)}%、OI +${(x.oc * 100).toFixed(0)}%、1 日 ${(x.r1 * 100).toFixed(1)}%、3 日 ${(x.r3 * 100).toFixed(1)}%）`) };
  L.push("## 補測（不佔名額）：R56 費率擁擠＋OI 暴增 禁多濾網統計（觀察員2 11/28）", "", `定義：40 幣任一幣，當日費率日合計 ≥ +${FRT}%（≈3 次平均 0.10%/8h）且日 OI 增幅 ≥ +${Math.round(OIT * 100)}% → 當日收盤觸發（OI 2025-05 起）。觸發 ${trig.length} 次：${OUT.r56.list.join("；") || "無"}`, "", `觸發後 1 日：${OUT.r56.t1}；全部幣日 1 日基準：${OUT.r56.a1}`, `觸發後 3 日：${OUT.r56.t3}；全部幣日 3 日基準：${OUT.r56.a3}`, `觸發後 2 日內會被擋掉的多單：波段A ${blockedA.length} 筆（平均 ${avg(blockedA)}R）、日內B ${blockedI.length} 筆（平均 ${avg(blockedI)}R）`, `放寬版（費率 ≥0.15%、OI ≥+25%，線索用）：觸發 ${trigB.length} 次；1 日 ${OUT.r56.loose.t1}；3 日 ${OUT.r56.loose.t3}`, "", "解讀：觸發後 1／3 日平均報酬明顯低於基準且擋掉的多單平均R 為負＝濾網有依據，可排正式回測（套波段A／日內B）；觸發 <20 次只當線索；「既有多單次日開盤出場」那半條涉及波段A 出場（11/15 結案不能動），只列不測。", "");
}
L.push(`結論：名額① 事件日雙向動能 ${nmOf(OUT.exp1)}（全期 ${OUT.exp1.res.ALL.n} 筆、樣本外 ${OUT.exp1.res.OOS.n} 筆、損益兩平 ${OUT.exp1.be}）；名額② C11 隔夜多 ${nmOf(OUT.exp2)}（全期 ${OUT.exp2.res.ALL.n} 筆、樣本外 ${OUT.exp2.res.OOS.n} 筆、損益兩平 ${OUT.exp2.be}）；R56 觸發 ${OUT.r56.n} 次。合格才會以新一組虛擬單上線，與現有各組並列，不動既有規則；判不了＝不能上線、也不能說它差；不合格就是不合格，不放寬標準。`);
await fs.writeFile("lab/report38.md", L.join("\n"));
await fs.writeFile("lab/results38.json", JSON.stringify(OUT));
console.log(L.join("\n"));
console.log("總耗時", elapsed());
