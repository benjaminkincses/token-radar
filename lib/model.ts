// radar-2: score every eligible pre-token protocol using only the sealed snapshot.
// TVL times a category multiple is adjusted for growth, maturity and chain breadth.
// Valuation bands are 0.5x and 1.8x the rounded implied value. The watchlist marks
// coverage; it imposes neither a row cap nor an additional TVL floor.
// Names are used only for the shared eligibility rules and farm-plan labels.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** Retained for starter consumers; radar-2 uses category_multiples instead. */
  base_multiple: number;
  category_multiples: Record<string, number>;
  default_multiple: number;
  null_category_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_multiplier_floor: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  breadth_cap: number;
  band_low_multiple: number;
  band_high_multiple: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.24,
  category_multiples: {
    Dexs: 0.35,
    Lending: 0.32,
    CDP: 0.30,
    Derivatives: 0.45,
    Perpetuals: 0.45,
    Yield: 0.25,
    'Yield Aggregator': 0.25,
    'Risk Curators': 0.28,
    'Onchain Capital Allocator': 0.28,
    RWA: 0.22,
    Chain: 0.60,
    'Basis Trading': 0.20,
    'Staking Pool': 0.18,
    'Liquidity Manager': 0.25,
    Farm: 0.20,
  },
  default_multiple: 0.24,
  null_category_multiple: 0.22,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  growth_multiplier_floor: 0.45,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 300,
  breadth_weight: 0.03,
  breadth_cap: 5,
  band_low_multiple: 0.5,
  band_high_multiple: 1.8,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  model: {
    base_multiple: number;
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  band_low_usd: number;
  band_high_usd: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Full-precision factors, rounded implied value and bands for one protocol. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): {
  implied: number;
  categoryMultiple: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
  bandLow: number;
  bandHigh: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = Math.max(model.growth_multiplier_floor, 1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const categoryMultiple = protocol.category === null
    ? model.null_category_multiple
    : Object.hasOwn(model.category_multiples, protocol.category)
      ? model.category_multiples[protocol.category]!
      : model.default_multiple;
  const breadthMult = 1 + model.breadth_weight * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const base = protocol.tvl_usd * categoryMultiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return {
    implied, categoryMultiple, growthPct, growthMult, maturityMult, breadthMult, age,
    bandLow: Math.round(implied * model.band_low_multiple),
    bandHigh: Math.round(implied * model.band_high_multiple),
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const WRAPPED_OR_STAKED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Shared eligibility rules matching the snapshot watchlist's definition. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p)
    && (p.category === null || !EXCLUDED_CATEGORIES.has(p.category))
    && !VERSIONED.test(p.name)
    && !WRAPPED_OR_STAKED.test(p.name)
    && !EXCHANGE_PREFIX.test(p.name);
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const scored = snapshot.protocols
    .filter(isRankable)
    .map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    band_low_usd: s.bandLow,
    band_high_usd: s.bandHigh,
    model: {
      base_multiple: s.categoryMultiple,
      category_multiple: s.categoryMultiple,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      breadth_multiplier: s.breadthMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Exact category actions, with a shared fallback for unlisted categories. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): {
  main: string;
  weekly: string;
  second: string;
} {
  const app = `${p.name} on ${chain}`;
  const secondPool = `Provide $25 to a second pool in the same ${p.name} app.`;
  const vote = `Vote on a governance proposal in the same ${p.name} app.`;
  switch (p.category) {
    case 'Lending':
    case 'CDP':
      return {
        main: `Supply $${capital} of USDC to ${app} and keep the position open.`,
        weekly: 'Each week, borrow a small amount against the position or repay and re-supply.',
        second: `Borrow a small amount against the position in the same ${p.name} app.`,
      };
    case 'Dexs':
      return {
        main: `Provide $${capital} of liquidity to the main pool in ${app}.`,
        weekly: 'Each week, swap a small amount in the app.',
        second: secondPool,
      };
    case 'Derivatives':
    case 'Perpetuals':
      return {
        main: `Deposit $${capital} of margin into ${app} and open one small hedge.`,
        weekly: 'Each week, adjust the small hedge in the app.',
        second: vote,
      };
    case 'Yield':
    case 'Yield Aggregator':
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Liquidity Manager':
      return {
        main: `Deposit $${capital} into a vault in ${app}.`,
        weekly: 'Each week, deposit a small top-up or claim and restake rewards.',
        second: secondPool,
      };
    case 'RWA':
      return {
        main: `Mint $${capital} of the yield asset through ${app} and hold it.`,
        weekly: 'Each week, check the yield asset redemption window.',
        second: vote,
      };
    case 'Chain':
      return {
        main: `Bridge $${capital} of funds into ${app} and use two native apps.`,
        weekly: 'Each week, make one transaction in a native app.',
        second: secondPool,
      };
    case 'Basis Trading':
      return {
        main: `Deposit $${capital} of USDC into the basis vault in ${app}.`,
        weekly: 'Each week, top up the basis vault with $10 of USDC.',
        second: secondPool,
      };
    case 'Staking Pool':
      return {
        main: `Stake $${capital} of the chain asset through ${app}.`,
        weekly: 'Each week, restake the staking rewards.',
        second: vote,
      };
    case 'Farm':
      return {
        main: `Deposit $${capital} into the farm pool in ${app}.`,
        weekly: 'Each week, harvest and restake the farm rewards.',
        second: secondPool,
      };
    default:
      return {
        main: `Deposit $${capital} of USDC into ${app} and keep the position open.`,
        weekly: 'Each week, repeat a small deposit in the app.',
        second: secondPool,
      };
  }
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const actions = actionsFor(p, capital, chain);
  const multichain = p.chains.length >= 2;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'free to create the wallet',
      time: '5 minutes',
    },
    {
      text: actions.main,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: actions.weekly,
      cost: p.category === 'Basis Trading' ? '$10 of capital plus about $2 of gas a week' : 'about $2 of gas a week plus any small action amount',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for ${hold} days to span multiple activity snapshots; follow the exit rule if the token launches sooner.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: multichain
        ? `Bridge a smaller amount of $25 to ${p.chains[1]!} and use it in ${p.name}.`
        : actions.second,
      cost: multichain ? '$25 of capital plus about $5 in bridge fees and gas' : 'up to $25 of capital plus about $2 of gas',
      time: '15 minutes',
    },
    {
      text: `Check ${p.name}'s own points or rewards page and claim only from links the protocol publishes. Never pay to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a farm log of the wallet, dates and transactions. Set an exit rule: withdraw when the token launches or the position has run ${hold * 2} days (2x the ${hold}-day hold window), whichever comes first.`,
      cost: 'free to log; allow about $4 of gas to withdraw',
      time: '5 minutes to log and 10 minutes to exit',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: ReadonlySet<string> = new Set<string>()): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    band_low_usd: row.band_low_usd,
    band_high_usd: row.band_high_usd,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((row) => radarRow(row, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
