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

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function requestXml(path: string): Promise<unknown> {
  const token = requireSetting(config.bggToken, "BGG_TOKEN");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new AppError(503, "BGG_UNAVAILABLE", "BoardGameGeek is unavailable. Try again later.");
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
  link?: { type: string; value: string } | { type: string; value: string }[];
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
  playingTime: number | null;
  minPlayingTime: number | null;
  maxPlayingTime: number | null;
  minAge: number | null;
  designers: string[];
  publishers: string[];
  categories: string[];
  sourceUrl: string;
  imageUrl: string | null;
}

export async function getBggGame(bggId: number): Promise<BggGameDetails> {
  const result = await requestXml(`/thing?id=${bggId}&type=boardgame,boardgameexpansion`);
  const item = array((result as { items?: { item?: RawItem | RawItem[] } }).items?.item)[0];
  if (!item || !kinds.has(item.type as GameKind) || Number(item.id) !== bggId) {
    throw new AppError(404, "BGG_GAME_NOT_FOUND", "That game was not found on BoardGameGeek.");
  }
  const names = nameValues(item.name);
  const links = array(item.link);
  const linked = (type: string) => links.filter((link) => link.type === type).map((link) => link.value);
  return {
    bggId,
    kind: item.type as GameKind,
    name: names.find((name) => name.type === "primary")?.value ?? names[0]?.value ?? "Unnamed game",
    alternateNames: names.filter((name) => name.type !== "primary").map((name) => name.value),
    yearPublished: numberOrNull(item.yearpublished),
    description: textOrNull(item.description),
    minPlayers: numberOrNull(item.minplayers),
    maxPlayers: numberOrNull(item.maxplayers),
    playingTime: numberOrNull(item.playingtime),
    minPlayingTime: numberOrNull(item.minplaytime),
    maxPlayingTime: numberOrNull(item.maxplaytime),
    minAge: numberOrNull(item.minage),
    designers: linked("boardgamedesigner"),
    publishers: linked("boardgamepublisher"),
    categories: linked("boardgamecategory"),
    sourceUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
    imageUrl: textOrNull(item.image) ?? textOrNull(item.thumbnail),
  };
}
