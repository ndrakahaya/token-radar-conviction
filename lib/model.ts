/** Conviction-weighted token radar model, derived entirely from a protocol snapshot. */

const DAY_SECONDS = 86_400;
const LIVE_ROWS = 24;
const VERSIONED = /\s(?:v\d+(?:\.\d+)?|V\d+(?:\.\d+)?|\d+\.\d+)$/;

type Nullable<T> = T | null;

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: Nullable<string>;
  chains: string[];
  tvl_usd: number;
  change_7d: Nullable<number>;
  mcap_usd: Nullable<number>;
  listed_at: Nullable<number | string>;
  gecko_id: Nullable<string>;
  symbol: Nullable<string>;
}

export interface Snapshot {
  as_of: string;
  source?: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  conviction: number;
  category: Nullable<string>;
  chains: string[];
  tvl_usd: number;
  change_7d: Nullable<number>;
  age_days: Nullable<number>;
}

/** Compact dashboard rows add risk signals to all ranked-board fields. */
export interface RadarRow extends BoardRow {
  risk_level: 'low' | 'moderate' | 'high';
  risk_flags: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: Nullable<string>;
  chains: string[];
  tvl_usd: number;
  mcap_usd: Nullable<number>;
  change_7d: Nullable<number>;
}

export interface RadarData {
  as_of: string;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot is not valid JSON');
  }
  if (!isRecord(raw)) throw new SnapshotError('snapshot must be an object');
  if (typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of)) throw new SnapshotError('snapshot has no valid as_of date');
  if (typeof raw.floor_usd !== 'number' || !Number.isFinite(raw.floor_usd)) throw new SnapshotError('snapshot has no valid floor_usd');
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist) || raw.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot has invalid protocols or watchlist');
  }
  const protocols: SnapshotProtocol[] = raw.protocols.map((value, index) => {
    if (!isRecord(value) || typeof value.slug !== 'string' || typeof value.name !== 'string' ||
        typeof value.tvl_usd !== 'number' || !Number.isFinite(value.tvl_usd)) {
      throw new SnapshotError(`protocol ${index} has invalid required fields`);
    }
    return {
      slug: value.slug,
      name: value.name,
      category: typeof value.category === 'string' ? value.category : null,
      chains: Array.isArray(value.chains) ? value.chains.filter((chain): chain is string => typeof chain === 'string') : [],
      tvl_usd: value.tvl_usd,
      change_7d: finiteOrNull(value.change_7d),
      mcap_usd: finiteOrNull(value.mcap_usd),
      listed_at: typeof value.listed_at === 'number' || typeof value.listed_at === 'string' ? value.listed_at : null,
      gecko_id: typeof value.gecko_id === 'string' ? value.gecko_id : null,
      symbol: typeof value.symbol === 'string' ? value.symbol : null,
    };
  });
  return {
    as_of: raw.as_of,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    floor_usd: raw.floor_usd,
    protocols,
    watchlist: raw.watchlist as string[],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function ageDays(asOf: string, listedAt: SnapshotProtocol['listed_at']): number | null {
  if (listedAt === null) return null;
  const asOfMs = Date.parse(`${asOf}T00:00:00Z`);
  let listedMs: number;
  if (typeof listedAt === 'number' || /^\d+(?:\.\d+)?$/.test(listedAt)) {
    const seconds = Number(listedAt);
    if (!Number.isFinite(seconds)) return null;
    listedMs = seconds * 1000;
  } else {
    listedMs = Date.parse(listedAt);
  }
  if (!Number.isFinite(asOfMs) || !Number.isFinite(listedMs)) return null;
  return (asOfMs - listedMs) / (DAY_SECONDS * 1000);
}

function imminence(age: number | null): number {
  if (age === null) return 0.8;
  if (age < 365) return 0.75;
  if (age <= 1095) return 1;
  if (age <= 1825) return 0.85;
  return 0.7;
}

function costFor(tvl: number): string {
  if (tvl >= 1_000_000_000) return '$200-$500';
  if (tvl >= 200_000_000) return '$100-$250';
  return '$50-$150';
}

function holdFor(age: number | null): number {
  if (age !== null && age < 365) return 30;
  if (age !== null && age <= 1095) return 45;
  return 60;
}

function chainFor(p: SnapshotProtocol): string {
  return p.chains[0] ?? 'the protocol’s primary chain';
}

function categoryWarning(category: string | null): string {
  const label = category ?? 'uncategorized';
  const lower = label.toLowerCase();
  if (lower.includes('bridge')) return `Bridge risk warning (${label}): verify destination, limits, and recovery options before moving funds.`;
  if (lower.includes('lend') || lower.includes('credit') || lower.includes('cdp')) return `Credit risk warning (${label}): monitor collateral health and liquidation terms throughout the position.`;
  if (lower.includes('dex') || lower.includes('exchange') || lower.includes('yield')) return `Market risk warning (${label}): account for impermanent loss, smart-contract exposure, and changing yields.`;
  if (lower.includes('stable')) return `Peg risk warning (${label}): check redemption terms and monitor the asset’s peg before adding funds.`;
  if (lower.includes('staking') || lower.includes('restak')) return `Slashing and unlock risk warning (${label}): review validator exposure and withdrawal delays first.`;
  return `Category risk warning (${label}): review contract, custody, and withdrawal risks before committing funds.`;
}

function makeFarmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const name = p.name;
  const chain = chainFor(p);
  const cost = costFor(p.tvl_usd);
  const hold = holdFor(age);
  const category = (p.category ?? '').toLowerCase();
  let action: string;
  if (category.includes('bridge')) action = `Bridge a small USDC test amount through ${name} on ${chain}, then confirm receipt before proceeding`;
  else if (category.includes('lend') || category.includes('credit') || category.includes('cdp')) action = `Supply USDC to ${name} on ${chain} and verify the collateral and withdrawal screens`;
  else if (category.includes('staking') || category.includes('restak')) action = `Stake the supported asset with ${name} on ${chain} and verify the receipt position`;
  else if (category.includes('dex') || category.includes('yield')) action = `Add balanced liquidity to a ${name} pool on ${chain} and save the position details`;
  else action = `Make a small supported deposit in ${name} on ${chain} and confirm it appears in the account`;
  const entries = [
    `Open the official ${name} app on ${chain}, verify its domain from trusted project links, and check that deposits and withdrawals are enabled.`,
    `${action}; start within the ${cost} budget and confirm the transaction in your wallet.`,
    `Review ${name} on ${chain} for a live incentive or qualifying task, then complete one eligible action without borrowing to farm.`,
    `Keep the ${name} position on ${chain} active for ${hold} days; check it twice weekly and retain enough funds for exit gas.`,
    `${categoryWarning(p.category)} For ${name} on ${chain}, test the exit route with a small amount before scaling up.`,
    `After ${hold} days, withdraw or rebalance through ${name} on ${chain}, record fees and rewards, and stop if terms have changed.`,
  ];
  return entries.map((text) => `${text} Budget: ${cost}. Time: ${timeFor(text, hold)}.`);
}

function timeFor(step: string, hold: number): string {
  if (step.includes('active for')) return `${hold} days, with two 5-minute checks each week`;
  if (step.includes('After ')) return `${hold} days plus 15 minutes to exit and log`;
  if (step.includes('risk warning')) return '10 minutes before funding';
  return '10-20 minutes';
}

interface Scored {
  protocol: SnapshotProtocol;
  implied: number;
  conviction: number;
  age: number | null;
}

export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const protocolsBySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const preTokenTotals = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || p.category === null) continue;
    preTokenTotals.set(p.category, (preTokenTotals.get(p.category) ?? 0) + p.tvl_usd);
  }

  const selected = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = protocolsBySlug.get(slug);
    if (protocol) selected.set(slug, protocol);
  }
  for (const p of snapshot.protocols) {
    if (selected.has(p.slug) || !isPreToken(p) || p.tvl_usd >= snapshot.floor_usd || p.category === 'CEX' || VERSIONED.test(p.name)) continue;
    selected.set(p.slug, p);
  }

  const scored: Scored[] = [...selected.values()].map((p) => {
    const categoryTotal = p.category === null ? 0 : preTokenTotals.get(p.category) ?? 0;
    const share = categoryTotal > 0 ? p.tvl_usd / categoryTotal : 0;
    const leadership = 1 + Math.min(share, 0.5);
    const g = Math.min(150, Math.max(-50, p.change_7d ?? 0));
    const growth = 1 + g / 100;
    const age = ageDays(snapshot.as_of, p.listed_at);
    const imminent = imminence(age);
    const breadth = Math.min(1.15, 1 + 0.03 * (p.chains.length - 1));
    const implied = Math.max(1, Math.round(p.tvl_usd * 0.30 * leadership * growth * imminent * breadth));
    const conviction = Math.round(
      40 * Math.min(share * 2, 1) +
      25 * Math.min(1, Math.max(0, (g + 50) / 200)) +
      20 * imminent +
      15 * Math.min((p.chains.length - 1) / 4, 1),
    );
    return { protocol: p, implied, conviction, age };
  });
  scored.sort((a, b) => b.implied - a.implied || a.protocol.slug.localeCompare(b.protocol.slug));
  return scored.map(({ protocol: p, implied, conviction, age }, index) => ({
    slug: p.slug,
    name: p.name,
    rank: index + 1,
    implied_value_usd: implied,
    farm_steps: makeFarmSteps(p, age),
    conviction,
    category: p.category,
    chains: [...p.chains],
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: age,
  }));
}

function riskFields(row: BoardRow): Pick<RadarRow, 'risk_level' | 'risk_flags'> {
  const flags: string[] = [];
  if (row.category === null) flags.push('Category is unclassified');
  if (row.chains.length <= 1) flags.push('Limited chain breadth');
  if (row.age_days === null || row.age_days < 365) flags.push('Short or unknown operating history');
  if (row.change_7d !== null && row.change_7d < 0) flags.push('Negative seven-day TVL change');
  const risk_level = flags.length >= 3 ? 'high' : flags.length >= 1 ? 'moderate' : 'low';
  return { risk_level, risk_flags: flags };
}

function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.gecko_id !== null && p.symbol !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, LIVE_ROWS)
    .map(({ slug, name, category, chains, tvl_usd, mcap_usd, change_7d }) => ({
      slug, name, category, chains: [...chains], tvl_usd, mcap_usd, change_7d,
    }));
}

export function buildRadar(snapshot: Snapshot): RadarData {
  const rows = buildBoard(snapshot).map((row) => ({ ...row, ...riskFields(row) }));
  return { as_of: snapshot.as_of, rows, live: liveRows(snapshot) };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows; expected 100-4000`;
  const slugs = new Set(board.map((row) => row.slug));
  const missing = snapshot.watchlist.filter((slug) => !slugs.has(slug));
  if (missing.length) return `board misses watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = new Set<number>();
  for (const row of board) {
    if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > board.length || ranks.has(row.rank)) return `rank ${row.rank} is invalid or duplicated`;
    ranks.add(row.rank);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has invalid implied value`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) if (step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} exceeds the prior row's implied value`;
  }
  return null;
}
