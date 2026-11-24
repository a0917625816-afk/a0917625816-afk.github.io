// 策略實驗室 第三十四輪（11/24 會議決議）
// 實驗一 C20 異常日「當日順勢」（CEO 網上研究 11/24；Caporale & Plastun 2019, Brunel WP 1917；Saef et al. 2024 佐證「跳躍當日延續、隔日不延續」）：UTC 日內累積報酬（15 分K 收盤／當日開盤 −1）超出「滾動 90 日日報酬均值 ± k×σ」（k=2，只用 d−90～d−1 的已完成日，無前視）→ 下一根 15 分K 開盤順勢進場（跌異常做空、漲異常做多）；停損＝進場價反向 0.5×|當日已走幅度|；出場＝當日最後一根 15 分K 收盤（UTC 23:45 收）或先到停損；每幣每日最多 1 筆；20:00 UTC 後不再觸發（留 ≥4 小時）。標的 list19 40 幣（分級成本）。無對應部門 → 絕對門檻。鄰近：k 1.6／2.4、σ回看 72／108 日、停損 0.4／0.6。另列：停損 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只空／只多、只 BTC／ETH、只 ≥20 億U 幣（點時選取）、隔日版對照（原文策略 2：次日開盤進、次日收盤出）、按觸發時段、分狀態、按月、按年、損益兩平成本倍數。
// 實驗二 R42 事件前 48 小時反彈進壓力區失敗空（空方辯手 11/23 草案、做空研究員 11/24 寫死；覆盤員 11/24 加「停損放 h24 外」變體）：事件＝FOMC／CPI／非農／PPI（GDP＋PCE 不在事件表，另記）；標的＝BTC、ETH、SOL 中進場前一日 30 日均成交額 ≥20 億U 者（點時選取，第一級成本）；前置＝BTC 前一日日線收盤 < EMA50；時間窗＝公布前 48h～公布前 15 分；壓力區＝前 5 日（120 根 1h，不含當根）最高 ±0.3×ATR(1h,14)；觸發＝某根 1h 收盤落在壓力區內，下一根 1h 收盤跌回區下緣之下 → 再下一根開盤做空；停損＝區上緣＋0.3×ATR(1h)；出場＝1.5R 停利或公布前 15 分無條件平倉（不持有過事件）。4 個參數（48h、5 日、0.3、1.5）。無對應部門 → 絕對門檻。鄰近：48h→38／58h、5 日→4／6 日、0.3→0.24／0.36、1.5R→1.2／1.8。另列：覆盤員變體「停損放進場前 24h 最高＋0.3×ATR 外」、停損 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只 BTC、無事件窗對照（任何時間，同前置）、無 EMA50 前置對照、按事件類型、分狀態、按月、損益兩平成本倍數。
// 補測（不佔名額；run33 出場研究員記錄）：波段A 只套「單日 −2R」單條、只套「週 −5R」單條的鄰近審查（−1.6／−2.4R；−4／−6R）；只看是否值得正式排名額。
// 偏誤交代（審查表 B）：幣池固定 list19（存活者偏差：只含 2026-11-10 仍在前 40 名的幣）；指標只用已收盤 K；進場用下一根開盤；成本分級；C20 的 μ／σ 只用 d−1 以前的已完成日；R42 事件時刻寫死（美東含夏令／冬令）、幣池點時選取、壓力區只用已收盤 1h K；停損用 min/max(開盤,停損) 保守出、滑價另計、未計費率（當日／跨事件前 ≤48h 持倉，費率腿最多 6 次，另列估算）；樣本內 65%／樣本外 35%，參數只在樣本內定；各試組數寫在報告。
// 鐵律＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；無對應部門用絕對門檻（兩段各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0）；審查＝主要參數各上下 20% 大部分變體仍合格。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。
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
const LIST18 = process.env.MOCK ? ["BTC", "ETH", "SOL", "XRP"].slice(0, N_COINS) : CL.list18;
const want = [...new Set([...LIST19, ...LIST18])];
const data = {};
for (const base of want) {
  if (Object.keys(data).length >= N_COINS) break;
  try { const m = process.env.MOCK ? mock(base) : await binance15(base); console.log(base, m.length); if (m.length < 35000) continue; data[base] = { m, h: agg(m, H4), d: agg(m, D1), h1: agg(m, H1) }; } catch (e) { console.log("失敗", base, e.message); }
}
const EVENTS_LIST = [["2024-05-01","14:00","FOMC"],["2024-05-03","08:30","NFP"],["2024-05-15","08:30","CPI"],["2024-06-07","08:30","NFP"],["2024-06-12","08:30","CPI"],["2024-06-12","14:00","FOMC"],["2024-07-05","08:30","NFP"],["2024-07-11","08:30","CPI"],["2024-07-31","14:00","FOMC"],["2024-08-02","08:30","NFP"],["2024-08-14","08:30","CPI"],["2024-09-06","08:30","NFP"],["2024-09-11","08:30","CPI"],["2024-09-18","14:00","FOMC"],["2024-10-04","08:30","NFP"],["2024-10-10","08:30","CPI"],["2024-11-01","08:30","NFP"],["2024-11-07","14:00","FOMC"],["2024-11-13","08:30","CPI"],["2024-12-06","08:30","NFP"],["2024-12-11","08:30","CPI"],["2024-12-18","14:00","FOMC"],["2025-01-10","08:30","NFP"],["2025-01-15","08:30","CPI"],["2025-01-29","14:00","FOMC"],["2025-02-07","08:30","NFP"],["2025-02-12","08:30","CPI"],["2025-03-07","08:30","NFP"],["2025-03-12","08:30","CPI"],["2025-03-19","14:00","FOMC"],["2025-04-04","08:30","NFP"],["2025-04-10","08:30","CPI"],["2025-05-02","08:30","NFP"],["2025-05-07","14:00","FOMC"],["2025-05-13","08:30","CPI"],["2025-06-06","08:30","NFP"],["2025-06-11","08:30","CPI"],["2025-06-18","14:00","FOMC"],["2025-07-03","08:30","NFP"],["2025-07-15","08:30","CPI"],["2025-07-30","14:00","FOMC"],["2025-08-01","08:30","NFP"],["2025-08-12","08:30","CPI"],["2025-09-05","08:30","NFP"],["2025-09-11","08:30","CPI"],["2025-09-17","14:00","FOMC"],["2025-10-24","08:30","CPI"],["2025-10-29","14:00","FOMC"],["2025-11-20","08:30","NFP"],["2025-12-10","14:00","FOMC"],["2025-12-16","08:30","NFP"],["2025-12-18","08:30","CPI"],["2026-01-09","08:30","NFP"],["2026-01-13","08:30","CPI"],["2026-01-28","14:00","FOMC"],["2026-02-11","08:30","NFP"],["2026-02-13","08:30","CPI"],["2026-03-06","08:30","NFP"],["2026-03-11","08:30","CPI"],["2026-03-18","14:00","FOMC"],["2026-04-03","08:30","NFP"],["2026-04-10","08:30","CPI"],["2026-04-29","14:00","FOMC"],["2026-05-08","08:30","NFP"],["2026-05-12","08:30","CPI"],["2026-06-05","08:30","NFP"],["2026-06-10","08:30","CPI"],["2026-06-17","14:00","FOMC"],["2026-07-02","08:30","NFP"],["2026-07-14","08:30","CPI"],["2026-07-29","14:00","FOMC"],["2026-08-07","08:30","NFP"],["2026-08-12","08:30","CPI"],["2026-09-04","08:30","NFP"],["2026-09-11","08:30","CPI"],["2026-09-16","14:00","FOMC"],["2026-10-02","08:30","NFP"],["2026-10-14","08:30","CPI"],["2026-10-28","14:00","FOMC"],["2026-11-06","08:30","NFP"],["2026-11-10","08:30","CPI"]];
const PPI_LIST = ["2024-05-14","2024-06-13","2024-07-12","2024-08-13","2024-09-12","2024-10-11","2024-11-14","2024-12-12","2025-01-14","2025-02-13","2025-03-13","2025-04-11","2025-05-15","2025-06-12","2025-07-16","2025-08-14","2025-09-10","2025-11-25","2026-01-14","2026-01-30","2026-02-27","2026-03-18","2026-04-14","2026-05-13","2026-06-11","2026-07-15","2026-08-13","2026-09-10","2026-10-15","2026-11-13"].map(d => [d, "08:30", "PPI"]);
const coins = Object.keys(data); console.log("幣種", coins.length, elapsed());
const U19 = LIST19.filter(c => data[c]), U18 = LIST18.filter(c => data[c]);
console.log("list19 可用", U19.length, "list18 可用", U18.length);

// ===== 濾網（同現行機器人；排行依清單各算一份）=====
const dk = t => Math.floor(t / D1);
const bD = data.BTC.d, bC = bD.map(x => x.c), bE = ema(bC, 50), btcUp = new Map(); bD.forEach((b, i) => btcUp.set(dk(b.t), b.c > bE[i]));
const dc = {}; coins.forEach(cn => { const m = new Map(); data[cn].d.forEach(b => m.set(dk(b.t), b.c)); dc[cn] = m; });
const rkCache = new Map();
function top(day, U) { const key = U.key + ":" + day; if (rkCache.has(key)) return rkCache.get(key); const sc = []; for (const cn of U.list) { const a = dc[cn].get(day), b = dc[cn].get(day - 20); if (a && b) sc.push([cn, a / b - 1]); } sc.sort((x, y) => y[1] - x[1]); const s = new Set(sc.slice(0, 10).filter(x => x[1] > 0).map(x => x[0])); rkCache.set(key, s); return s; }
const okF = (cn, t, U) => btcUp.get(dk(t) - 1) === true && top(dk(t) - 1, U).has(cn);
const UNI19 = { key: "19", list: U19 }, UNI18 = { key: "18", list: U18 };

// ===== 市場狀態（第十二輪定義）、趨勢上（日內 D 用）=====
const bA = atr(bD, 14);
const stateMap = new Map(), trendUp = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -0.08 || ap >= 0.045) s = "恐慌"; else if (b.c > bE[i] * 1.03) s = "趨勢上"; else if (b.c < bE[i] * 0.97) s = "趨勢下"; else s = "盤整"; stateMap.set(dk(b.t), s); trendUp.set(dk(b.t), !(r5 <= -0.08 || ap >= 0.045) && b.c > bE[i] * 1.03); });
const stateAt = t => stateMap.get(dk(t) - 1) || "未知";
const trendBlock = t => trendUp.get(dk(t) - 1) === true;
// 盤整濾網（run30 實驗二同定義）：ban(cn,t)＝進場前一日 BTC 狀態 ≠ 盤整
function stateFn(band = 0.03, pr5 = 0.08, patr = 0.045) { const m = new Map(); bD.forEach((b, i) => { if (i < 50) return; const r5 = i >= 5 ? b.c / bD[i - 5].c - 1 : 0, ap = bA[i] / b.c; let s; if (r5 <= -pr5 || ap >= patr) s = "恐慌"; else if (b.c > bE[i] * (1 + band)) s = "趨勢上"; else if (b.c < bE[i] * (1 - band)) s = "趨勢下"; else s = "盤整"; m.set(dk(b.t), s); }); return (cn, t) => m.get(dk(t) - 1) !== "盤整"; }

// ===== 指標、成本 =====
const pre = {};
for (const cn of coins) for (const tf of ["h", "m", "d"]) { const c = data[cn][tf]; (pre[cn] ||= {})[tf] = { c, a: atr(c, 14), e20: ema(c.map(x => x.c), 20), e200: ema(c.map(x => x.c), 200), v20: sma(c.map(x => x.v), 20) }; }
const LIQ = {}; for (const cn of coins) { const d = data[cn].d, m = new Map(); let s = 0; const q = d.map(b => b.c * b.v); for (let i = 0; i < d.length; i++) { s += q[i]; if (i >= 30) s -= q[i - 30]; if (i >= 29) m.set(dk(d[i].t), s / 30); } LIQ[cn] = m; }
const TIERS = [[2000e6, 0.0014], [500e6, 0.0025], [100e6, 0.0040], [0, 0.0070]];
function tieredCost(cn, t) { const v = LIQ[cn].get(dk(t) - 1); if (!(v >= 0)) return 0.0040; for (const [th, c] of TIERS) if (v >= th) return c; return 0.0070; }
const mIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].m.forEach((b, i) => m.set(b.t, i)); mIdx[cn] = m; }

// ===== 重大事件日曆、美東時間換算（含夏令時）=====
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

// ===== 交易引擎（部門共用；o.costMul 成本倍數、o.stopMul 停損倍數、o.ban(cn,t) 禁多；o.mid={N,lvl,keep27} 中點移動停損出場）=====
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
const mk = p => p ? " ✅" : " ❌";
const bySt = p => Object.entries(p.byState).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const byW = p => Object.entries(p.byWhy).map(([k, v]) => `${k} ${v.n} 筆（${v.avgR}R）`).join("、") || "無";
const byC = p => Object.entries(p.byCoin).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${k} ${v.n} 筆／${v.avgR}R`).join("；") || "無";
const bySd = p => Object.entries(p.bySide).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const verdictNote = (j, v) => { const small = v.IS.n < 30 || v.OOS.n < 30; if (j.pass) return ""; const onlySize = j.why.every(w => /筆數/.test(w)); return small ? (onlySize ? "（筆數不足、數字本身過關：判不了，等樣本）" : "（筆數不足且數字也差）") : "（樣本夠，是真的差）"; };
// 按月：正月數／總月數、最好與最差月、是否靠 1–2 個月撐（最大兩個月合計R 佔總R 比例）
function monthly(p) { const ms = Object.entries(p.byMonth).sort(); if (!ms.length) return { months: 0, pos: 0, text: "無", top2: 0 }; const pos = ms.filter(([, v]) => v.avgR > 0).length; const sums = ms.map(([k, v]) => [k, v.avgR * v.n]); const tot = sums.reduce((a, x) => a + x[1], 0); const top2 = sums.map(x => x[1]).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0); return { months: ms.length, pos, top2: tot > 0 ? +(top2 / tot).toFixed(2) : null, text: ms.map(([k, v]) => `${k.slice(2)} ${v.avgR > 0 ? "+" : ""}${v.avgR}(${v.n})`).join("、") }; }
const monthText = m => `${m.months} 個月中 ${m.pos} 個月為正${m.top2 != null ? `、最好兩個月佔總R ${Math.round(m.top2 * 100)}%` : "（總R ≤0，最好兩個月佔比不計）"}`;
const costMul = (tr, k) => tr.map(x => ({ ...x, R: x.gross - k * x.costR }));
const dIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].d.forEach((b, i) => m.set(dk(b.t), i)); dIdx[cn] = m; }
const fundSum = (cn, d0, d1) => { let s = 0, k = 0; for (let d = d0; d < d1; d++) { const f = frAt(cn, d); if (!isNaN(f)) { s += f; k++; } } return { s, k }; };
const breakEven = tr => { const g = tr.reduce((a, x) => a + x.gross, 0), c = tr.reduce((a, x) => a + x.costR, 0); return c > 0 ? +(g / c).toFixed(2) : null; };
const pos2 = v => v.IS.avgR > 0 && v.OOS.avgR > 0;
const byYear = tr => { const g = {}; for (const x of tr) { const y = new Date(x.t).getUTCFullYear(); const v = g[y] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const yrText = o => Object.entries(o).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
const grp = (tr, key) => { const g = {}; for (const x of tr) { const k = x[key] ?? "未知"; const v = g[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (x.R > 0) v.w++; v.s += x.R; } const o = {}; for (const [k, v] of Object.entries(g)) o[k] = { n: v.n, win: +(100 * v.w / v.n).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
const grpText = o => Object.entries(o).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n} 筆／${v.win}%／${v.avgR}R`).join("；") || "無";
// 絕對門檻判定（無原本部門；與 run31 C17 同）
function judgeAbs(raw) { const v = seg(raw), v15 = seg(costMul(raw, 1.5)), be = breakEven(raw); const why = []; for (const [nm2, s, s15] of [["樣本內", v.IS, v15.IS], ["樣本外", v.OOS, v15.OOS]]) { if (s.n < 30) why.push(`${nm2}筆數 ${s.n} < 30`); if (!(s.avgR > 0)) why.push(`${nm2}平均R ${s.avgR} ≤ 0`); if (!(s.win > 50)) why.push(`${nm2}勝率 ${s.win}% ≤ 50%`); if (!(s15.avgR > 0)) why.push(`${nm2}成本×1.5 後平均R ${s15.avgR} ≤ 0`); } if (!(be >= 1.5)) why.push(`損益兩平成本倍數 ${be} < 1.5`); return { pass: !why.length, res: v, res15: v15, be, why, n: raw.length }; }
const smallOf = v => v.IS.n < 30 || v.OOS.n < 30;
const verdictAbs = j => j.pass ? "合格" : smallOf(j.res) ? (j.why.every(w => /筆數/.test(w)) ? "判不了（筆數不足、數字本身過關）" : "判不了（筆數不足且數字也差）") : "不合格（樣本夠，是真的差）";
const hIdx = {}; for (const cn of coins) { const m = new Map(); data[cn].h.forEach((b, i) => m.set(b.t, i)); hIdx[cn] = m; }
// 前 5 幣（進場前一日 30 日均成交額，排除 BTC／ETH，點時選取）
function top5At(t) { const d = dk(t) - 1; const sc = []; for (const cn of U19) { if (cn === "BTC" || cn === "ETH") continue; const v = LIQ[cn].get(d); if (v > 0) sc.push([cn, v]); } sc.sort((a, b) => b[1] - a[1]); return sc.slice(0, 5).map(x => x[0]); }
const EVALL = EVP.filter(e => e.t >= t0 && e.t < t1);
const feeLegs = (t, tx) => { let k = 0; for (let u = Math.ceil(t / (8 * H1)) * 8 * H1; u < tx; u += 8 * H1) k++; return k; }; // 跨幾次 8h 費率結算
const frLeg = (cn, t, tx) => { const d = dk(t); const f = frAt(cn, d - 1); return isNaN(f) ? NaN : f / 100 / 3 * feeLegs(t, tx); }; // 用前一日費率日合計／3 估每次結算（比例）

// ===== 六個上線部門（原本）=====
const XA = { tp: 0, f: 0, be: false }, XB = { tp: 1, f: 0.33, be: true }, QI = { vol: 1.5, cs: 0.6 };
const isMonUTC = t => new Date(t).getUTCDay() === 1;
const DEPTS = [
  { key: "A", name: "波段A", kind: "swing", q: {}, x: XA, f: {} },
  { key: "B", name: "波段B（1R先平1/3＋保本）", kind: "swing", q: {}, x: XB, f: {} },
  { key: "AM", name: "波段A-M（波段A＋週一 UTC 不開新單）", kind: "swing", q: {}, x: XA, f: {}, ban: (cn, t) => isMonUTC(t) },
  { key: "I2", name: "日內B（≥5 億U）", kind: "intra", q: QI, x: XA, f: { liq: 500 } },
  { key: "I3", name: "日內C（日內B＋事件前後 4h 不開單）", kind: "intra", q: QI, x: XA, f: { liq: 500, ev: true } },
  { key: "I4", name: "日內D（日內＋BTC 趨勢上不開單）", kind: "intra", q: QI, x: XA, f: { liq: 100, trend: true } },
];
const runRaw = (S, U, o = {}) => U.list.flatMap(cn => trades(cn, S, U, { ...o, ban: S.ban || o.ban }));
// ===== 熔斷版組合（rules 任一條為 null＝不套；全 null＝原本）=====
// rules: { day: -2, streak: 2, week: -5, month: -8 }；只擋新開單，不平已開的單；只用已平倉（tx ≤ t）單的 R
function portfolioBrk(ts0, from, to, maxOpen = 5, rules = {}) {
  const ts = ts0.filter(x => x.t >= from && x.t < to).sort((a, b) => a.t - b.t);
  let eq = 1, peak = 1, dd = 0, open = [], n = 0, w = 0, s = 0; const byState = {}, byWhy = {}, bySide = {}, byCoin = {}, byMonth = {}; const ledger = []; const skipped = []; const byRule = { 單日: 0, 連敗: 0, 週: 0, 月: 0 };
  const settle = u => { open.sort((a, b) => a.tx - b.tx); while (open.length && open[0].tx <= u) { const o = open.shift(); eq += o.amt * o.R; peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak); ledger.push({ tx: o.tx, R: o.R }); } };
  const acc = (m, k, R) => { const v = m[k] ||= { n: 0, w: 0, s: 0 }; v.n++; if (R > 0) v.w++; v.s += R; };
  const sumSince = u => { let k = 0; for (let i = ledger.length - 1; i >= 0 && ledger[i].tx >= u; i--) k += ledger[i].R; return k; };
  const blocked = t => {
    const hit = [];
    if (rules.day != null) { const d0 = Math.floor(t / D1) * D1; if (sumSince(d0) <= rules.day) hit.push("單日"); }
    if (rules.week != null) { const dow = (new Date(t).getUTCDay() + 6) % 7; const w0 = Math.floor(t / D1) * D1 - dow * D1; if (sumSince(w0) <= rules.week) hit.push("週"); }
    if (rules.month != null) { const dt = new Date(t); const m0 = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1); if (sumSince(m0) <= rules.month) hit.push("月"); }
    if (rules.streak != null && ledger.length >= rules.streak) { let k = 0, last = 0; for (let i = ledger.length - 1; i >= 0 && ledger[i].R < 0; i--) { k++; last = Math.max(last, ledger[i].tx); } if (k >= rules.streak && t < last + 24 * H1) hit.push("連敗"); }
    return hit;
  };
  for (const x of ts) {
    settle(x.t);
    const hit = blocked(x.t); if (hit.length) { skipped.push(x); for (const h of hit) byRule[h]++; continue; }
    if (open.length >= maxOpen || open.some(o => o.cn === x.cn)) continue;
    open.push({ ...x, amt: eq * 0.01 }); n++; if (x.R > 0) w++; s += x.R; acc(byState, x.state || "未知", x.R); acc(byWhy, x.why || "", x.R); acc(bySide, x.side || "多", x.R); acc(byCoin, x.cn, x.R); acc(byMonth, new Date(x.t).toISOString().slice(0, 7), x.R);
  }
  settle(Infinity); const Y = ((to === Infinity ? Date.now() : to) - from) / (365 * D1);
  const fin = m => { const o = {}; for (const [k, v] of Object.entries(m)) o[k] = { n: v.n, win: +(v.w / v.n * 100).toFixed(1), avgR: +(v.s / v.n).toFixed(3) }; return o; };
  const skR = skipped.length ? +(skipped.reduce((a, x) => a + x.R, 0) / skipped.length).toFixed(3) : null, skW = skipped.length ? +(skipped.filter(x => x.R > 0).length / skipped.length * 100).toFixed(1) : null;
  return { n, win: n ? +(w / n * 100).toFixed(1) : 0, avgR: n ? +(s / n).toFixed(3) : 0, sumR: +s.toFixed(2), cagr: eq > 0 ? +((Math.pow(eq, 1 / Y) - 1) * 100).toFixed(1) : -100, dd: +(dd * 100).toFixed(1), skipped: skipped.length, skAvgR: skR, skWin: skW, byRule, byState: fin(byState), byWhy: fin(byWhy), bySide: fin(bySide), byCoin: fin(byCoin), byMonth: fin(byMonth) };
}
const segB = (tr, rules, mo = 5) => ({ IS: portfolioBrk(tr, t0, cut, mo, rules), OOS: portfolioBrk(tr, cut, Infinity, mo, rules), ALL: portfolioBrk(tr, t0, Infinity, mo, rules) });
const FULL = { day: -2, streak: 2, week: -5, month: -8 };
const NEIGH = [["單日 −1.6R", { ...FULL, day: -1.6 }], ["單日 −2.4R", { ...FULL, day: -2.4 }], ["週 −4R", { ...FULL, week: -4 }], ["週 −6R", { ...FULL, week: -6 }], ["月 −6.4R", { ...FULL, month: -6.4 }], ["月 −9.6R", { ...FULL, month: -9.6 }], ["連敗 3 筆", { ...FULL, streak: 3 }]];
const SINGLE = [["只套單日 −2R", { day: -2 }], ["只套連敗 2 筆冷卻 24h", { streak: 2 }], ["只套週 −5R", { week: -5 }], ["只套月 −8R", { month: -8 }]];

const RAW = {}; { const S = DEPTS[0]; RAW.A = runRaw(S, UNI19); console.log("原本 波段A", RAW.A.length, "筆（幣層）", elapsed()); }
const tier1At = t => { const d = dk(t) - 1; return U19.filter(cn => (LIQ[cn].get(d) || 0) >= 2000e6); };
const liqAt = (cn, t) => LIQ[cn].get(dk(t) - 1) || 0;

const OUT = { created: new Date().toISOString(), coins: coins.length, list19: U19, exp1: {}, exp2: {}, extra: {} };
const L = ["# 策略實驗室 第三十四輪：C20 異常日當日順勢（Caporale & Plastun）＋R42 事件前 48h 反彈進壓力區失敗空（BTC／ETH／SOL）＋補測 波段A 單條熔斷鄰近審查", "",
  `產生時間：${OUT.created}；資料幣種 ${coins.length}（固定清單 list19 ${U19.length} 幣）；Binance 15 分K ${MONTHS} 個月；樣本內 ${fmtD(t0)}～${fmtD(cut)}，樣本外 ${fmtD(cut)}～${fmtD(t1)}；成本一律用分級成本（≥20 億U 0.14%、5–20 億 0.25%、1–5 億 0.40%、<1 億 0.70%）；每筆風險 1%；最多 5 張`, "",
  "鐵律：合格＝勝率提高、平均R ≥ 原本 90%、回撤 ≤ 原本 1.2 倍、樣本內與樣本外（≥30 筆）都合格；過擬合審查＝主要參數各上下 20% 後大部分變體仍合格；審查表 A 另看 成本 ×1.5／×2、停損高原、按月。兩個實驗都無對應部門 → 絕對門檻（兩段各 ≥30 筆、兩段平均R>0、兩段勝率>50%、損益兩平成本倍數 ≥1.5、成本 ×1.5 後兩段平均R 仍 >0；鄰近過半才算通過審查）。樣本外 <30 筆＝判不了。沒過就是沒過，不放寬。", "",
  "偏誤交代（審查表 B）：幣池固定 list19（存活者偏差）；只用已收盤 K；進場用下一根開盤；成本分級；C20 的 μ／σ 只用 d−1 以前的已完成日（無前視）、20:00 UTC 後不觸發、每幣每日 1 筆；R42 事件時刻寫死（美東含夏令／冬令）、幣池點時選取（≥20 億U）、壓力區只用已收盤 1h K、不持有過事件；停損用 min/max(開盤,停損) 保守出、滑價另計、主表未計費率（另列估算）；參數只在樣本內定、樣本外只看不調。", ""];

// ===== 實驗一：C20 異常日當日順勢 =====
L.push("## 實驗一：C20 異常日當日順勢（Caporale & Plastun 2019；無對應部門 → 絕對門檻）", "",
  "定義：UTC 日 d 內，15 分K 收盤相對當日開盤的累積報酬 cum；μ、σ＝該幣 d−90～d−1 日報酬（收／開 −1）的均值與標準差；cum ≤ μ − 2σ → 下一根開盤做空、cum ≥ μ + 2σ → 做多；停損＝進場價反向 0.5×|當日已走幅度|；出場＝當日最後一根 15 分K 收盤或先到停損；每幣每日 1 筆、20:00 UTC 後不觸發。鄰近（±20%）：k 1.6／2.4、σ回看 72／108 日、停損係數 0.4／0.6。另列：停損 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只空／只多、只 BTC／ETH、只 ≥20 億U 幣、隔日版對照、按觸發時段、分狀態、按月、按年。", "");
const dayStats = {};
function muSd(cn, N) {
  const key = cn + ":" + N; if (dayStats[key]) return dayStats[key];
  const rs = data[cn].d.map(b => ({ d: dk(b.t), r: b.c / b.o - 1 })), m = new Map();
  for (let i = N; i < rs.length; i++) { let s = 0, s2 = 0; for (let j = i - N; j < i; j++) { s += rs[j].r; s2 += rs[j].r * rs[j].r; } const mu = s / N, sd = Math.sqrt(Math.max(0, s2 / N - mu * mu)); m.set(rs[i].d, { mu, sd }); }
  dayStats[key] = m; return m;
}
const dayFirst = {}; for (const cn of coins) { const m = new Map(); data[cn].m.forEach((b, i) => { const d = dk(b.t); if (!m.has(d)) m.set(d, i); }); dayFirst[cn] = m; }
function c20(opt = {}) {
  const { k = 2, N = 90, stopF = 0.5, stopMul = 1, pick = U19, lastH = 20, nextDay = false, costMul: cm = 1 } = opt; const out = []; let trig = 0;
  for (const cn of pick) {
    if (!data[cn]) continue;
    const M = data[cn].m, st = muSd(cn, N), DF = dayFirst[cn]; let curDay = -1, dayOpen = 0, done = false;
    for (let i = 0; i < M.length - 1; i++) {
      const b = M[i], d = dk(b.t);
      if (d !== curDay) { curDay = d; dayOpen = b.o; done = false; }
      if (done || b.t < t0) continue;
      const s = st.get(d); if (!s || !(s.sd > 0)) continue;
      if ((b.t % D1) / H1 >= lastH) continue;
      const cum = b.c / dayOpen - 1; let side = 0;
      if (cum <= s.mu - k * s.sd) side = -1; else if (cum >= s.mu + k * s.sd) side = 1;
      if (!side) continue;
      done = true; trig++;
      const iE = nextDay ? DF.get(d + 1) : i + 1; if (iE == null || iE >= M.length) continue;
      const exitDay = nextDay ? d + 1 : d;
      const e = M[iE].o, move = Math.abs(b.c - dayOpen), r = stopF * move * stopMul; if (!(e > 0) || !(r > 0) || r / e < 0.001) continue;
      const stp = side > 0 ? e - r : e + r;
      let ex = null, why = "收盤", tx = 0, j = iE;
      for (; j < M.length && dk(M[j].t) === exitDay; j++) { const bb = M[j]; if (side > 0 ? bb.l <= stp : bb.h >= stp) { ex = side > 0 ? Math.min(bb.o, stp) : Math.max(bb.o, stp); why = "停損"; tx = bb.t + M15; break; } ex = bb.c; tx = bb.t + M15; }
      if (ex == null) continue;
      const gross = side * (ex - e) / r, costR = tieredCost(cn, M[iE].t) * e / r, fl = frLeg(cn, M[iE].t, tx); const feeR = isNaN(fl) ? 0 : -side * fl * e / r;
      const hr = (b.t % D1) / H1; const hb = hr < 8 ? "00–08 UTC" : hr < 16 ? "08–16 UTC" : "16–20 UTC";
      out.push({ cn, t: M[iE].t, tx, R: gross - cm * costR, gross, costR, feeR, state: stateAt(M[iE].t), why, side: side > 0 ? "多" : "空", hb, liq: liqAt(cn, M[iE].t), rPct: +(r / e * 100).toFixed(2), cumPct: +(cum * 100).toFixed(2), bars: j - iE });
    }
  }
  out.trig = trig; return out;
}
{
  const o = { neigh: {}, extra: {}, tried: 0, passed: 0 }; const cnt = j => { o.tried++; if (j.pass) o.passed++; return j; };
  const rawB = c20(); const jB = cnt(judgeAbs(rawB)); o.base = { judge: jB, res: jB.res, be: jB.be, raw: rawB.length, trig: rawB.trig };
  L.push(...HDR, row("C20 基準：k=2、σ 90 日、停損 0.5×已走幅度、當日收盤出" + mk(jB.pass), jB.res));
  let np = 0, nn = 0;
  for (const [nm2, opt] of [["k 1.6", { k: 1.6 }], ["k 2.4", { k: 2.4 }], ["σ回看 72 日", { N: 72 }], ["σ回看 108 日", { N: 108 }], ["停損 0.4×", { stopF: 0.4 }], ["停損 0.6×", { stopF: 0.6 }]]) {
    const rr2 = c20(opt), nj = cnt(judgeAbs(rr2)); o.neigh[nm2] = { judge: nj, res: nj.res, be: nj.be, raw: rr2.length }; nn++; if (nj.pass) np++; L.push(row("　鄰近：" + nm2 + mk(nj.pass), nj.res));
  }
  const stops = {}; let sp = 0; for (const sm of [0.5, 0.75, 1.25, 1.5]) { const rr2 = c20({ stopMul: sm }), nj = cnt(judgeAbs(rr2)); stops[sm] = { judge: nj, res: nj.res, be: nj.be }; if (nj.pass) sp++; L.push(row(`　停損距離 ×${sm}` + mk(nj.pass), nj.res)); } o.stops = stops; o.plateau = `${sp}/4`;
  const v15 = seg(costMul(rawB, 1.5)), v2 = seg(costMul(rawB, 2)); o.extra["成本 ×1.5"] = { res: v15, pos: pos2(v15) }; o.extra["成本 ×2"] = { res: v2, pos: pos2(v2) };
  L.push(row("　另列：成本 ×1.5（兩段平均R>0？）" + mk(pos2(v15)), v15), row("　另列：成本 ×2（兩段平均R>0？）" + mk(pos2(v2)), v2));
  const rawS = rawB.filter(x => x.side === "空"), rawL = rawB.filter(x => x.side === "多"); const jS = cnt(judgeAbs(rawS)), jL = cnt(judgeAbs(rawL)); o.extra["只空"] = { judge: jS, res: jS.res, be: jS.be }; o.extra["只多"] = { judge: jL, res: jL.res, be: jL.be };
  L.push(row("　另列：只做空（跌異常日）" + mk(jS.pass), jS.res), row("　另列：只做多（漲異常日）" + mk(jL.pass), jL.res));
  const rawBE = c20({ pick: ["BTC", "ETH"].filter(c => data[c]) }), jBE = cnt(judgeAbs(rawBE)); o.extra["只 BTC／ETH"] = { judge: jBE, res: jBE.res, be: jBE.be, raw: rawBE.length }; L.push(row("　另列：只 BTC／ETH" + mk(jBE.pass), jBE.res));
  const rawT1 = rawB.filter(x => x.liq >= 2000e6), jT1 = cnt(judgeAbs(rawT1)); o.extra["只 ≥20 億U"] = { judge: jT1, res: jT1.res, be: jT1.be, raw: rawT1.length }; L.push(row("　另列：只 ≥20 億U 幣（點時選取）" + mk(jT1.pass), jT1.res));
  const rawT1S = rawT1.filter(x => x.side === "空"), jT1S = cnt(judgeAbs(rawT1S)); o.extra["只 ≥20 億U 只空"] = { judge: jT1S, res: jT1S.res, be: jT1S.be, raw: rawT1S.length }; L.push(row("　另列：只 ≥20 億U 幣、只做空" + mk(jT1S.pass), jT1S.res));
  const rawND = c20({ nextDay: true }), jND = cnt(judgeAbs(rawND)); o.extra["隔日版"] = { judge: jND, res: jND.res, be: jND.be, raw: rawND.length }; L.push(row("　另列：隔日版對照（原文策略 2：次日開盤進、次日收盤出）" + mk(jND.pass), jND.res));
  const rawFee = rawB.map(x => ({ ...x, R: x.R + x.feeR })), vFee = seg(rawFee); o.extra["含費率腿估算"] = { res: vFee }; L.push(row("　另列：含費率腿估算" + mk(pos2(vFee)), vFee));
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = jB.pass && o.overfit.ok; o.res = jB.res; o.month = monthly(jB.res.ALL); o.year = byYear(rawB); o.byHb = grp(rawB, "hb"); o.byCoin = grp(rawB, "cn"); o.bySide = grp(rawB, "side");
  const avgRp = rawB.length ? +(rawB.reduce((a, x) => a + x.rPct, 0) / rawB.length).toFixed(2) : null, avgCum = rawB.length ? +(rawB.reduce((a, x) => a + x.cumPct, 0) / rawB.length).toFixed(2) : null, avgBars = rawB.length ? +(rawB.reduce((a, x) => a + x.bars, 0) / rawB.length).toFixed(1) : null;
  L.push("", `C20 基準：觸發 ${rawB.trig} 次、成交 ${rawB.length} 筆（幣層；組合層最多 5 張後見表）；多空：${grpText(o.bySide)}；平均觸發幅度 ${avgCum}%、平均停損距離 ${avgRp}%、平均持有 ${avgBars} 根 15 分K；損益兩平成本倍數 基準 ${jB.be}、只空 ${jS.be}、只多 ${jL.be}、只 BTC／ETH ${jBE.be}、只 ≥20 億U ${jT1.be}、隔日版 ${jND.be}；按觸發時段：${grpText(o.byHb)}；分幣（前 8）：${byC(jB.res.ALL)}；出場原因：${byW(jB.res.ALL)}；分狀態：${bySt(jB.res.ALL)}；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}；按年：${yrText(o.year)}；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}；停損高原 ${o.plateau}；含費率腿全期平均R ${vFee.ALL.avgR}`);
  L.push(`判定：${J(jB)}（${verdictAbs(jB)}）；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → **${o.ok ? "合格（新部門候選，與現有各組並列）" : verdictAbs(jB).startsWith("判不了") ? "判不了" : "不合格"}**`);
  L.push(`【審查表】C20：共試 ${o.tried} 組（基準 1＋鄰近 ${nn}＋停損 4＋只空／只多 2＋只 BTC／ETH 1＋只 ≥20 億U 2＋隔日版 1）、合格 ${o.passed} 組；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}${pos2(v15) ? "（仍正）" : "（轉負）"}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}${pos2(v2) ? "（仍正）" : "（轉負）"}；按月 ${o.month.months} 個月中 ${o.month.pos} 個月為正；最好兩個月佔總R ${o.month.top2 != null ? Math.round(o.month.top2 * 100) + "%" : "不計（總R ≤0）"}；停損高原 ${o.plateau}；只空 ${jS.res.ALL.n} 筆／${jS.res.ALL.avgR}R、只多 ${jL.res.ALL.n} 筆／${jL.res.ALL.avgR}R；隔日版 ${jND.res.ALL.n} 筆／${jND.res.ALL.avgR}R`, "");
  OUT.exp1 = o; console.log("C20 完成", rawB.length, "筆", elapsed());
}

// ===== 實驗二：R42 事件前 48h 反彈進壓力區失敗空 =====
L.push("## 實驗二：R42 事件前 48 小時反彈進壓力區失敗空（BTC／ETH／SOL 中 ≥20 億U 者；無對應部門 → 絕對門檻）", "",
  "定義：事件＝FOMC／CPI／非農／PPI；前置＝BTC 前一日日線收盤 < EMA50；時間窗＝公布前 48h～公布前 15 分；壓力區＝前 5 日（120 根 1h，不含當根）最高 ±0.3×ATR(1h,14)；觸發＝某根 1h 收盤落在區內、下一根 1h 收盤跌回區下緣之下 → 再下一根開盤做空；停損＝區上緣＋0.3×ATR(1h)；出場＝1.5R 停利或公布前 15 分平倉。鄰近（±20%）：窗 38／58h、回看 4／6 日、區寬 0.24／0.36、R:R 1.2／1.8。另列：覆盤員變體「停損放進場前 24h 最高＋0.3×ATR 外」、停損 ×0.5／0.75／1.25／1.5、成本 ×1.5／×2、只 BTC、無事件窗對照（任何時間、持有最多 48h）、無 EMA50 前置對照、按事件類型、分狀態、按月。", "");
const btcBelow = new Map(); bD.forEach((b, i) => btcBelow.set(dk(b.t), b.c < bE[i]));
const A1 = {}; for (const cn of ["BTC", "ETH", "SOL"]) if (data[cn]) A1[cn] = atr(data[cn].h1, 14);
const h1Idx = {}; for (const cn of ["BTC", "ETH", "SOL"]) if (data[cn]) { const m = new Map(); data[cn].h1.forEach((b, i) => m.set(b.t, i)); h1Idx[cn] = m; }
function r42(opt = {}) {
  const { win = 48, days = 5, zA = 0.3, rr = 1.5, stopMul = 1, stopH24 = false, only = null, noWin = false, noEma = false, costMul: cm = 1 } = opt; const out = []; let touch = 0, conf = 0;
  for (const cn of ["BTC", "ETH", "SOL"]) {
    if (!data[cn] || (only && !only.includes(cn))) continue;
    const H = data[cn].h1, A = A1[cn], M = data[cn].m, ix = mIdx[cn], nb = days * 24;
    const windows = noWin ? [[t0, Infinity, null]] : EVALL.map(ev => [ev.t - win * H1, ev.t - 15 * 60e3, ev]);
    let lastTx = 0;
    for (const [w0, w1, ev] of windows) {
      let i = 0; { let lo = 0, hi = H.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (H[m].t < w0) lo = m + 1; else hi = m; } i = lo; }
      for (; i < H.length - 2 && H[i].t + H1 <= w1; i++) {
        const b = H[i]; if (i < nb || !(A[i] > 0) || b.t < t0 || b.t < lastTx) continue;
        if (liqAt(cn, b.t) < 2000e6) continue;
        if (!noEma && btcBelow.get(dk(b.t) - 1) !== true) continue;
        let hi5 = -Infinity; for (let j = i - nb; j < i; j++) hi5 = Math.max(hi5, H[j].h);
        const top = hi5 + zA * A[i], bot = hi5 - zA * A[i];
        if (!(b.c >= bot && b.c <= top)) continue; touch++;
        const b2 = H[i + 1]; if (!(b2.c < bot) || b2.t + H1 > w1) continue; conf++;
        const tE = b2.t + H1, iE = ix.get(tE); if (iE == null) continue;
        const e = M[iE].o; if (!(e > 0)) continue;
        let stopP = top; if (stopH24) { let h24 = -Infinity; for (let j = Math.max(0, i - 22); j <= i + 1; j++) h24 = Math.max(h24, H[j].h); stopP = Math.max(top, h24 + zA * A[i]); }
        const r = (stopP - e) * stopMul; if (!(r > 0) || r / e < 0.001) continue;
        const stp = e + r, tp = e - rr * r, tEnd = noWin ? tE + win * H1 : w1;
        let ex = null, why = noWin ? "時間平倉" : "事件前平倉", tx = 0, j = iE;
        for (; j < M.length && M[j].t + M15 <= tEnd; j++) { const bb = M[j]; if (bb.h >= stp) { ex = Math.max(bb.o, stp); why = "停損"; tx = bb.t + M15; break; } if (bb.l <= tp) { ex = Math.min(bb.o, tp); why = "停利"; tx = bb.t + M15; break; } ex = bb.c; tx = bb.t + M15; }
        if (ex == null) continue;
        const gross = -(ex - e) / r, costR = tieredCost(cn, M[iE].t) * e / r, fl = frLeg(cn, M[iE].t, tx); const feeR = isNaN(fl) ? 0 : fl * e / r;
        out.push({ cn, t: M[iE].t, tx, R: gross - cm * costR, gross, costR, feeR, state: stateAt(M[iE].t), why, side: "空", ev: ev ? ev.k : "無事件窗", rPct: +(r / e * 100).toFixed(2), hrsBefore: ev ? +((ev.t - M[iE].t) / H1).toFixed(1) : null });
        lastTx = tx; i = Math.max(i, (h1Idx[cn].get(Math.floor(tx / H1) * H1) ?? i) - 1);
      }
    }
  }
  out.touch = touch; out.conf = conf; return out;
}
{
  const o = { neigh: {}, extra: {}, tried: 0, passed: 0 }; const cnt = j => { o.tried++; if (j.pass) o.passed++; return j; };
  const rawB = r42(); const jB = cnt(judgeAbs(rawB)); o.base = { judge: jB, res: jB.res, be: jB.be, raw: rawB.length, touch: rawB.touch, conf: rawB.conf };
  L.push(...HDR, row("R42 基準：事件前 48h、5 日高 ±0.3ATR、1.5R／事件前平倉" + mk(jB.pass), jB.res));
  let np = 0, nn = 0;
  for (const [nm2, opt] of [["窗 38h", { win: 38 }], ["窗 58h", { win: 58 }], ["回看 4 日", { days: 4 }], ["回看 6 日", { days: 6 }], ["區寬 0.24", { zA: 0.24 }], ["區寬 0.36", { zA: 0.36 }], ["R:R 1.2", { rr: 1.2 }], ["R:R 1.8", { rr: 1.8 }]]) {
    const rr2 = r42(opt), nj = cnt(judgeAbs(rr2)); o.neigh[nm2] = { judge: nj, res: nj.res, be: nj.be, raw: rr2.length }; nn++; if (nj.pass) np++; L.push(row("　鄰近：" + nm2 + mk(nj.pass), nj.res));
  }
  const stops = {}; let sp = 0; for (const sm of [0.5, 0.75, 1.25, 1.5]) { const rr2 = r42({ stopMul: sm }), nj = cnt(judgeAbs(rr2)); stops[sm] = { judge: nj, res: nj.res, be: nj.be }; if (nj.pass) sp++; L.push(row(`　停損距離 ×${sm}` + mk(nj.pass), nj.res)); } o.stops = stops; o.plateau = `${sp}/4`;
  const rawH = r42({ stopH24: true }), jH = cnt(judgeAbs(rawH)); o.extra["停損放 h24 外（覆盤員變體）"] = { judge: jH, res: jH.res, be: jH.be, raw: rawH.length }; L.push(row("　另列：覆盤員變體 停損放進場前 24h 最高＋0.3ATR 外" + mk(jH.pass), jH.res));
  const v15 = seg(costMul(rawB, 1.5)), v2 = seg(costMul(rawB, 2)); o.extra["成本 ×1.5"] = { res: v15, pos: pos2(v15) }; o.extra["成本 ×2"] = { res: v2, pos: pos2(v2) };
  L.push(row("　另列：成本 ×1.5（兩段平均R>0？）" + mk(pos2(v15)), v15), row("　另列：成本 ×2（兩段平均R>0？）" + mk(pos2(v2)), v2));
  const rawBtc = r42({ only: ["BTC"] }), jBtc = cnt(judgeAbs(rawBtc)); o.extra["只 BTC"] = { judge: jBtc, res: jBtc.res, be: jBtc.be, raw: rawBtc.length }; L.push(row("　另列：只 BTC" + mk(jBtc.pass), jBtc.res));
  const rawNW = r42({ noWin: true }), jNW = cnt(judgeAbs(rawNW)); o.extra["無事件窗對照"] = { judge: jNW, res: jNW.res, be: jNW.be, raw: rawNW.length }; L.push(row("　另列：無事件窗對照（任何時間、持有最多 48h）" + mk(jNW.pass), jNW.res));
  const rawNE = r42({ noEma: true }), jNE = cnt(judgeAbs(rawNE)); o.extra["無 EMA50 前置對照"] = { judge: jNE, res: jNE.res, be: jNE.be, raw: rawNE.length }; L.push(row("　另列：無 EMA50 前置對照（BTC 在 EMA50 上也做）" + mk(jNE.pass), jNE.res));
  const rawFee = rawB.map(x => ({ ...x, R: x.R + x.feeR })), vFee = seg(rawFee); o.extra["含費率腿估算"] = { res: vFee }; L.push(row("　另列：含費率腿估算" + mk(pos2(vFee)), vFee));
  o.overfit = { n: nn, pass: np, ok: np * 2 > nn }; o.ok = jB.pass && o.overfit.ok; o.res = jB.res; o.month = monthly(jB.res.ALL); o.year = byYear(rawB); o.byEv = grp(rawB, "ev"); o.byCoin = grp(rawB, "cn");
  const avgRp = rawB.length ? +(rawB.reduce((a, x) => a + x.rPct, 0) / rawB.length).toFixed(2) : null, avgHb = rawB.length ? +(rawB.reduce((a, x) => a + (x.hrsBefore || 0), 0) / rawB.length).toFixed(1) : null;
  L.push("", `R42 基準：碰壓力區 ${rawB.touch} 次、確認失敗 ${rawB.conf} 次、成交 ${rawB.length} 筆（只 BTC ${rawBtc.length}、h24 變體 ${rawH.length}、無事件窗 ${rawNW.length}、無 EMA50 前置 ${rawNE.length}）；分幣：${grpText(o.byCoin)}；平均停損距離 ${avgRp}%、平均進場在公布前 ${avgHb} 小時；損益兩平成本倍數 基準 ${jB.be}、h24 變體 ${jH.be}、只 BTC ${jBtc.be}、無事件窗 ${jNW.be}、無 EMA50 前置 ${jNE.be}；出場原因：${byW(jB.res.ALL)}；分狀態：${bySt(jB.res.ALL)}；按事件類型：${grpText(o.byEv)}；按月平均R：${o.month.text}；時間穩定：${monthText(o.month)}；按年：${yrText(o.year)}；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}；停損高原 ${o.plateau}；含費率腿全期平均R ${vFee.ALL.avgR}`);
  L.push(`判定：${J(jB)}（${verdictAbs(jB)}）；審查：鄰近 ${nn} 組 ${np} 組合格 → ${o.overfit.ok ? "通過" : "未通過"} → **${o.ok ? "合格（新部門候選，與現有各組並列）" : verdictAbs(jB).startsWith("判不了") ? "判不了" : "不合格"}**`);
  L.push(`【審查表】R42：共試 ${o.tried} 組（基準 1＋鄰近 ${nn}＋停損 4＋h24 變體 1＋只 BTC 1＋對照 2）、合格 ${o.passed} 組；成本 ×1.5 兩段平均R ${v15.IS.avgR}／${v15.OOS.avgR}${pos2(v15) ? "（仍正）" : "（轉負）"}、×2 ${v2.IS.avgR}／${v2.OOS.avgR}${pos2(v2) ? "（仍正）" : "（轉負）"}；按月 ${o.month.months} 個月中 ${o.month.pos} 個月為正；最好兩個月佔總R ${o.month.top2 != null ? Math.round(o.month.top2 * 100) + "%" : "不計（總R ≤0）"}；停損高原 ${o.plateau}；h24 變體 ${jH.res.ALL.n} 筆／${jH.res.ALL.avgR}R；無事件窗對照 ${jNW.res.ALL.n} 筆／${jNW.res.ALL.avgR}R`, "");
  OUT.exp2 = o; console.log("R42 完成", rawB.length, "筆", elapsed());
}

// ===== 補測：波段A 單條熔斷鄰近審查 =====
L.push("## 補測（不佔名額）：波段A 只套「單日 −2R」單條、只套「週 −5R」單條的鄰近審查", "",
  "出處：run33 出場研究員記錄——波段A 只套單日 −2R 或週 −5R 兩段都過且回撤變小，但沒做鄰近審查。這裡只補鄰近（±20%），看是否值得正式排名額；判定用鐵律對波段A 原本。", "");
{
  const raw = RAW.A, base = segB(raw, {}); const o = { base, rows: {} };
  L.push(...HDR, row("波段A 原本（不加熔斷）", base));
  for (const [nm2, rl] of [["只套單日 −2R", { day: -2 }], ["　鄰近：單日 −1.6R", { day: -1.6 }], ["　鄰近：單日 −2.4R", { day: -2.4 }], ["只套週 −5R", { week: -5 }], ["　鄰近：週 −4R", { week: -4 }], ["　鄰近：週 −6R", { week: -6 }], ["單日 −2R＋週 −5R 兩條", { day: -2, week: -5 }]]) {
    const v = segB(raw, rl), nj = judge(base, v); o.rows[nm2] = { res: v, judge: nj, skipped: v.ALL.skipped, skAvgR: v.ALL.skAvgR }; L.push(row(nm2 + mk(nj.pass), v));
  }
  const dayOk = ["只套單日 −2R", "　鄰近：單日 −1.6R", "　鄰近：單日 −2.4R"].filter(k => o.rows[k].judge.pass).length, wkOk = ["只套週 −5R", "　鄰近：週 −4R", "　鄰近：週 −6R"].filter(k => o.rows[k].judge.pass).length;
  o.dayOk = dayOk; o.wkOk = wkOk;
  L.push("", `補測結論：單日 −2R 家族 3 組中 ${dayOk} 組合格（被擋 ${o.rows["只套單日 −2R"].skipped} 筆、反事實平均 ${o.rows["只套單日 −2R"].skAvgR ?? "—"}R）；週 −5R 家族 3 組中 ${wkOk} 組合格（被擋 ${o.rows["只套週 −5R"].skipped} 筆、反事實平均 ${o.rows["只套週 −5R"].skAvgR ?? "—"}R）；兩條合併 ${o.rows["單日 −2R＋週 −5R 兩條"].judge.pass ? "合格" : "不合格"}。鄰近 3/3 才算通過審查；通過也只是「值得正式排名額」，不直接寫進 bot.mjs。`, "");
  OUT.extra.brkA = o; console.log("補測完成", elapsed());
}

const finA = OUT.exp1, finB = OUT.exp2;
L.push(`結論：實驗一 C20 ${finA.ok ? "合格" : verdictAbs(finA.base.judge).startsWith("判不了") ? "判不了" : "不合格"}（全期 ${finA.res.ALL.n} 筆、樣本外 ${finA.res.OOS.n} 筆；共試 ${finA.tried} 組合格 ${finA.passed} 組；鄰近 ${finA.overfit.pass}/${finA.overfit.n}；停損高原 ${finA.plateau}）；實驗二 R42 ${finB.ok ? "合格" : verdictAbs(finB.base.judge).startsWith("判不了") ? "判不了" : "不合格"}（全期 ${finB.res.ALL.n} 筆、樣本外 ${finB.res.OOS.n} 筆；共試 ${finB.tried} 組合格 ${finB.passed} 組；鄰近 ${finB.overfit.pass}/${finB.overfit.n}；停損高原 ${finB.plateau}）；補測 波段A 單日 −2R 家族 ${OUT.extra.brkA.dayOk}/3、週 −5R 家族 ${OUT.extra.brkA.wkOk}/3。合格者才能以新一組虛擬單並列上線；判不了＝等樣本，不得當作「差」也不得上線。`);
await fs.writeFile("lab/report34.md", L.join("\n"));
await fs.writeFile("lab/results34.json", JSON.stringify(OUT));
console.log(L.join("\n"));
