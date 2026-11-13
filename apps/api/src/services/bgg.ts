import { XMLParser } from "fast-xml-parser";
import type { GameKind } from "@tablefolk/contracts";
import { config, requireSetting } from "../config.js";
import { AppError } from "../lib/errors.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: true });
const baseUrl = "https://boardgamegeek.com/xmlapi2";
const kinds = new Set<GameKind>(["boardgame", "boardgameexpansion"]);
const searchCache = new Map<string, { until: number; result: SearchResult[] }>();

function array<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(typeof value === "object" && value !== null && "value" in value
    ? (value as { value: unknown }).value
    : value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function floatOrNull(value: unknown): number | null {
  const parsed = Number(typeof value === "object" && value !== null && "value" in value
    ? (value as { value: unknown }).value
    : value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function requestXml(path: string, retries = 2): Promise<unknown> {
  const token = requireSetting(config.bggToken, "BGG_TOKEN");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AppError(503, "BGG_UNAVAILABLE", "BoardGameGeek is unavailable. Try again later.");
  }

  // BGG returns 202 while compiling user collection
  if (response.status === 202 && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return requestXml(path, retries - 1);
  }

  if (!response.ok) {
    const code = response.status === 429 || response.status === 500 || response.status === 503
      ? "BGG_BUSY"
      : "BGG_ERROR";
    throw new AppError(503, code, "BoardGameGeek could not load games right now. Try again later.");
  }

  try {
    return parser.parse(await response.text());
  } catch {
    throw new AppError(502, "BGG_RESPONSE", "BoardGameGeek returned unreadable game data.");
  }
}

export interface SearchResult {
  bggId: number;
  kind: GameKind;
  name: string;
  yearPublished: number | null;
}

export async function searchBgg(query: string): Promise<SearchResult[]> {
  const normalized = query.trim().slice(0, 80);
  if (normalized.length < 2) return [];
  const key = normalized.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.until > Date.now()) return cached.result;
  const result = await requestXml(`/search?query=${encodeURIComponent(normalized)}&type=boardgame,boardgameexpansion`);
  const items = array((result as { items?: { item?: RawItem | RawItem[] } }).items?.item);
  const matches = items.filter((item) => kinds.has(item.type as GameKind)).slice(0, 25).map((item) => ({
    bggId: Number(item.id),
    kind: item.type as GameKind,
    name: nameValues(item.name).find((name) => name.type === "primary")?.value
      ?? nameValues(item.name)[0]?.value
      ?? "Unnamed game",
    yearPublished: numberOrNull(item.yearpublished),
  })).filter((item) => Number.isInteger(item.bggId) && item.bggId > 0);
  if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value ?? "");
  searchCache.set(key, { until: Date.now() + 5 * 60_000, result: matches });
  return matches;
}

interface RawName { type?: string; value: string }
interface RawLink {
  type: string;
  id?: number | string;
  value: string;
  inbound?: boolean | string;
}

interface RawItem {
  id: number | string;
  type: string;
  name?: RawName | RawName[];
  yearpublished?: { value: number | string };
  description?: string;
  minplayers?: { value: number | string };
  maxplayers?: { value: number | string };
  playingtime?: { value: number | string };
  minplaytime?: { value: number | string };
  maxplaytime?: { value: number | string };
  minage?: { value: number | string };
  image?: string;
  thumbnail?: string;
  link?: RawLink | RawLink[];
  statistics?: {
    ratings?: {
      averageweight?: { value: number | string };
    };
  };
}

function nameValues(value: RawName | RawName[] | undefined): RawName[] {
  return array(value);
}

export interface BggGameDetails {
  bggId: number;
  kind: GameKind;
  name: string;
  alternateNames: string[];
  yearPublished: number | null;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  baseGameBggId: number | null;
  baseGameTitle: string | null;
  playingTime: number | null;
  minPlayingTime: number | null;
  maxPlayingTime: number | null;
  weight: number | null;
  minAge: number | null;
  designers: string[];
  publishers: string[];
  categories: string[];
  sourceUrl: string;
  imageUrl: string | null;
}

function parseRawItem(item: RawItem): BggGameDetails | null {
  const bggId = Number(item.id);
  if (!Number.isInteger(bggId) || bggId < 1 || !kinds.has(item.type as GameKind)) return null;
  const names = nameValues(item.name);
  const links = array(item.link);
  const linked = (type: string) => links.filter((link) => link.type === type).map((link) => link.value);
  const baseLink = links.find(
    (l) => l.type === "boardgameexpansion" && (l.inbound === true || l.inbound === "true")
  );
  const baseGameBggId = baseLink && Number(baseLink.id) > 0 ? Number(baseLink.id) : null;
  const baseGameTitle = baseLink ? baseLink.value : null;

  return {
    bggId,
    kind: item.type as GameKind,
    name: names.find((name) => name.type === "primary")?.value ?? names[0]?.value ?? "Unnamed game",
    alternateNames: names.filter((name) => name.type !== "primary").map((name) => name.value),
    yearPublished: numberOrNull(item.yearpublished),
    description: textOrNull(item.description),
    minPlayers: numberOrNull(item.minplayers),
    maxPlayers: numberOrNull(item.maxplayers),
    baseGameBggId,
    baseGameTitle,
    playingTime: numberOrNull(item.playingtime),
    minPlayingTime: numberOrNull(item.minplaytime),
    maxPlayingTime: numberOrNull(item.maxplaytime),
    weight: floatOrNull(item.statistics?.ratings?.averageweight),
    minAge: numberOrNull(item.minage),
    designers: linked("boardgamedesigner"),
    publishers: linked("boardgamepublisher"),
    categories: linked("boardgamecategory"),
    sourceUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
    imageUrl: textOrNull(item.image) ?? textOrNull(item.thumbnail),
  };
}

export async function getBggGame(bggId: number): Promise<BggGameDetails> {
  const result = await requestXml(`/thing?id=${bggId}&type=boardgame,boardgameexpansion&stats=1`);
  const item = array((result as { items?: { item?: RawItem | RawItem[] } }).items?.item)[0];
  if (!item) {
    throw new AppError(404, "BGG_GAME_NOT_FOUND", "That game was not found on BoardGameGeek.");
  }
  const parsed = parseRawItem(item);
  if (!parsed) {
    throw new AppError(404, "BGG_GAME_NOT_FOUND", "That game was not found on BoardGameGeek.");
  }
  return parsed;
}

export async function getBggGamesBatch(bggIds: number[]): Promise<Map<number, BggGameDetails>> {
  const uniqueIds = Array.from(new Set(bggIds.filter((id) => Number.isInteger(id) && id > 0)));
  const map = new Map<number, BggGameDetails>();
  if (uniqueIds.length === 0) return map;

  const chunkSize = 20;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    try {
      const result = await requestXml(`/thing?id=${chunk.join(",")}&type=boardgame,boardgameexpansion&stats=1`);
      const items = array((result as { items?: { item?: RawItem | RawItem[] } }).items?.item);
      for (const item of items) {
        const details = parseRawItem(item);
        if (details) {
          map.set(details.bggId, details);
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch BGG batch for IDs ${chunk.join(",")}:`, err);
    }
    if (i + chunkSize < uniqueIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return map;
}

function extractVersionName(version: unknown): string | null {
  if (typeof version !== "object" || version === null) return null;
  const item = (version as { item?: unknown }).item;
  if (!item || typeof item !== "object") return null;
  const nameObj = (item as { name?: unknown }).name;
  if (typeof nameObj === "string") return nameObj.trim() || null;
  if (typeof nameObj === "object" && nameObj !== null) {
    if ("value" in nameObj && typeof (nameObj as { value: unknown }).value === "string") {
      return (nameObj as { value: string }).value.trim() || null;
    }
    if ("#text" in nameObj && typeof (nameObj as { "#text": unknown })["#text"] === "string") {
      return (nameObj as { "#text": string })["#text"].trim() || null;
    }
  }
  return null;
}

export interface BggCollectionItem {
  bggId: number;
  kind: GameKind;
  name: string;
  yearPublished: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  minPlayingTime: number | null;
  maxPlayingTime: number | null;
  weight: number | null;
  versionName: string | null;
  imageUrl: string | null;
}

export async function getBggCollection(username: string): Promise<BggCollectionItem[]> {
  const normalized = username.trim();
  if (!normalized) return [];

  const result = await requestXml(`/collection?username=${encodeURIComponent(normalized)}&own=1&stats=1&version=1`);
  const root = result as { items?: { item?: RawCollectionItem | RawCollectionItem[] } };
  const items = array(root.items?.item);

  return items.map((item) => {
    const subtype = (item.subtype ?? "boardgame") as GameKind;
    const stats = item.stats;
    const versionName = extractVersionName(item.version);

    return {
      bggId: Number(item.objectid),
      kind: kinds.has(subtype) ? subtype : "boardgame",
      name: typeof item.name === "object" && item.name !== null && "#text" in item.name
        ? String((item.name as { "#text"?: string })["#text"])
        : String(item.name ?? "Unnamed game"),
      yearPublished: numberOrNull(item.yearpublished),
      minPlayers: numberOrNull(stats?.minplayers),
      maxPlayers: numberOrNull(stats?.maxplayers),
      playingTime: numberOrNull(stats?.playingtime),
      minPlayingTime: numberOrNull(stats?.minplaytime),
      maxPlayingTime: numberOrNull(stats?.maxplaytime),
      weight: floatOrNull(stats?.rating?.averageweight),
      versionName: versionName ? versionName.trim() || null : null,
      imageUrl: textOrNull(item.image) ?? textOrNull(item.thumbnail),
    };
  }).filter((item) => Number.isInteger(item.bggId) && item.bggId > 0);
}

interface RawCollectionItem {
  objectid: number | string;
  subtype?: string;
  name?: string | { "#text"?: string };
  yearpublished?: number | string;
  image?: string;
  thumbnail?: string;
  version?: unknown;
  stats?: {
    minplayers?: number | string;
    maxplayers?: number | string;
    playingtime?: number | string;
    minplaytime?: number | string;
    maxplaytime?: number | string;
    rating?: {
      averageweight?: { value?: number | string };
    };
  };
}
