import { z } from "zod";

export const groupNameSchema = z.object({ name: z.string().trim().min(2).max(80) });
export const collectionAddSchema = z.object({ bggId: z.number().int().positive() });
export const shareSchema = collectionAddSchema;
export const inviteSchema = z.object({ email: z.email().max(254) });
export const inviteLinkSchema = z.object({ expiresAt: z.iso.datetime({ offset: true }).nullable() });
export const pickSchema = z.object({
  playerCount: z.number().int().min(1).max(1000),
  excludeBggId: z.number().int().positive().optional(),
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
  playingTime: number | null;
  minAge: number | null;
  coverUrl: string | null;
  sourceUrl: string;
  designers: string[];
  publishers: string[];
  categories: string[];
}

export interface CollectionGame extends Game {
  sharedGroupIds: string[];
}

export interface Member {
  userId: string;
  displayName: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  creatorId: string;
  memberCount: number;
  gameCount: number;
}

export interface GroupGame extends Game {
  owners: Member[];
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

export interface ApiError {
  error: { code: string; message: string };
}
