import { z } from "zod";

export const groupNameSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const collectionAddSchema = z.object({ bggId: z.number().int().positive() });
export const shareSchema = collectionAddSchema;
export const inviteSchema = z.object({ email: z.string().email().max(254) });
export const inviteLinkSchema = z.object({ expiresAt: z.string().datetime({ offset: true }).nullable() });
export const pickSchema = z.object({
  playerCount: z.number().int().min(1).max(1000),
  excludeBggId: z.number().int().positive().optional(),
  maxDuration: z.number().int().positive().optional(),
  maxWeight: z.number().min(1).max(5).optional(),
});

export const collectionAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
  unavailableReason: z.string().trim().max(100).nullable().optional(),
  versionName: z.string().trim().max(100).nullable().optional(),
  maxPlayersOverride: z.number().int().min(1).max(99).nullable().optional(),
});

export const bggProfileSchema = z.object({
  bggUsername: z.string().trim().min(1).max(50),
});

export const eventCreateSchema = z.object({
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  scheduledDate: z.string().datetime({ offset: true }),
  location: z.string().trim().max(200).nullable().optional(),
  hostUserId: z.string().nullable().optional(),
  manualHeadcount: z.number().int().min(1).max(1000).nullable().optional(),
});

export const eventUpdateSchema = eventCreateSchema.partial();

export const eventRsvpSchema = z.object({
  status: z.enum(["ATTENDING", "DECLINED", "MAYBE"]),
  additionalGuests: z.number().int().min(0).max(50).default(0),
});

export const gameInterestVoteSchema = z.object({
  bggId: z.number().int().positive(),
  points: z.number().int().min(1).max(10),
});

export const eventPickSchema = z.object({
  playerCount: z.number().int().min(1).max(1000).optional(),
  excludeBggId: z.number().int().positive().optional(),
  maxDuration: z.number().int().positive().optional(),
  maxWeight: z.number().min(1).max(5).optional(),
});

export const sessionPlanSchema = z.object({
  playerCount: z.number().int().min(1).max(1000).optional(),
  totalMinutes: z.number().int().min(30).max(720).default(180),
  allowHeavy: z.boolean().default(true),
  excludeBggIds: z.array(z.number().int().positive()).optional(),
});

export const eventSetOfficialSchema = z.object({
  type: z.enum(["single", "lineup", "clear"]),
  bggId: z.number().int().positive().optional(),
  carrierDisplayName: z.string().optional(),
  lineup: z.array(z.object({
    role: z.enum(["warmup", "main", "cooldown", "filler"]),
    label: z.string(),
    bggId: z.number().int().positive(),
    name: z.string(),
    estimatedMinutes: z.number().int().positive(),
    carrierDisplayName: z.string().optional(),
    expansions: z.array(z.object({
      bggId: z.number().int().positive(),
      name: z.string(),
    })).optional(),
  })).optional(),
});

export type GameKind = "boardgame" | "boardgameexpansion";

export interface Game {
  bggId: number;
  kind: GameKind;
  name: string;
  yearPublished: number | null;
  description: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  baseGameBggId?: number | null;
  baseGameTitle?: string | null;
  playingTime: number | null;
  minPlayingTime: number | null;
  maxPlayingTime: number | null;
  weight: number | null;
  minAge: number | null;
  coverUrl: string | null;
  sourceUrl: string;
  designers: string[];
  publishers: string[];
  categories: string[];
}

export interface CollectionGame extends Game {
  sharedGroupIds: string[];
  isAvailable: boolean;
  unavailableReason: string | null;
  versionName: string | null;
  maxPlayersOverride?: number | null;
  effectiveMaxPlayers?: number | null;
  expansionCount?: number;
  expansions?: { bggId: number; name: string; maxPlayers: number | null }[];
}

export interface Member {
  userId: string;
  displayName: string;
  bggUsername?: string | null;
}

export interface GameOwner extends Member {
  versionName?: string | null;
  isAvailable?: boolean;
  unavailableReason?: string | null;
}

export interface GroupSummary {
  id: string;
  name: string;
  creatorId: string;
  memberCount: number;
  gameCount: number;
}

export interface GroupGame extends Game {
  owners: GameOwner[];
  interestScore?: number;
  userVotedPoints?: number;
  effectiveMaxPlayers?: number | null;
  expansionCount?: number;
  expansions?: { bggId: number; name: string; maxPlayers: number | null }[];
}

export interface GroupDetail extends GroupSummary {
  members: Member[];
}

export interface Invitation {
  id: string;
  email: string;
  status: "PENDING" | "SEND_FAILED" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

export interface GroupInviteLink {
  id: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
  expiresAt: string | null;
  createdAt: string;
  joinCount: number;
}

export type PickResult =
  | { status: "picked"; game: GroupGame; eligibleCount: number; onlyMatch: boolean }
  | { status: "empty"; eligibleCount: 0 }
  | { status: "no_match"; eligibleCount: 0; unknownPlayerCount: number };

export type SessionRole = "warmup" | "main" | "cooldown" | "filler";

export interface SessionGameSlot {
  role: SessionRole;
  label: string;
  game: GroupGame;
  estimatedMinutes: number;
  transitionBeforeMinutes?: number;
  transitionReason?: string;
}

export interface SessionLineupResult {
  status: "success" | "empty" | "no_match";
  lineup: SessionGameSlot[];
  totalEstimatedMinutes: number;
  transitionMinutes?: number;
  targetMinutes: number;
  hasHeavy: boolean;
}

export interface EventRsvpMember {
  userId: string;
  displayName: string;
  bggUsername?: string | null;
  status: "ATTENDING" | "DECLINED" | "MAYBE";
  additionalGuests: number;
  updatedAt: string;
}

export interface OfficialLineupItem {
  role: SessionRole;
  label: string;
  bggId: number;
  name: string;
  estimatedMinutes: number;
  carrierDisplayName?: string;
  expansions?: { bggId: number; name: string }[];
}

export interface EventDetail {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  scheduledDate: string;
  location: string | null;
  hostUserId: string | null;
  hostDisplayName: string | null;
  manualHeadcount: number | null;
  totalHeadcount: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  officialPickBggId?: number | null;
  officialPick?: Game | null;
  officialPickCarrier?: string | null;
  officialLineup?: OfficialLineupItem[] | null;
  createdAt: string;
  rsvps: EventRsvpMember[];
}

export interface BggSyncResult {
  importedCount: number;
  updatedCount: number;
  totalCount: number;
}

export interface UserVotingSummary {
  availablePoints: number;
  usedPoints: number;
  totalPoints: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
