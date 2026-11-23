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
  includedOwnerIds: z.array(z.string()).optional(),
});

export const collectionAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
  unavailableReason: z.string().trim().max(100).nullable().optional(),
  versionName: z.string().trim().max(100).nullable().optional(),
  maxPlayersOverride: z.number().int().min(1).max(99).nullable().optional(),
  isStandalone: z.boolean().optional(),
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

export const eventUpdateSchema = eventCreateSchema.partial().extend({
  creatorId: z.string().nullable().optional(),
});

export const eventAttendanceSchema = z.object({
  rsvps: z.array(z.object({
    userId: z.string(),
    status: z.enum(["ATTENDING", "DECLINED", "MAYBE"]),
    additionalGuests: z.number().int().min(0).max(50).default(0),
    guestNames: z.array(z.string().trim().min(1).max(60)).default([]).optional(),
  })),
});

export const eventRsvpSchema = z.object({
  status: z.enum(["ATTENDING", "DECLINED", "MAYBE"]),
  additionalGuests: z.number().int().min(0).max(50).default(0),
  guestNames: z.array(z.string().trim().min(1).max(60)).default([]).optional(),
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
  mechanicsAffinity: z.number().min(-1).max(1).default(0),
  themeCategory: z.string().optional(),
  includedOwnerIds: z.array(z.string()).optional(),
  recipeId: z.string().optional(),
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
    effectiveWeight: z.number().nullable().optional(),
    addedMechanics: z.array(z.string()).optional(),
  })).optional(),
});

export const eventMenuVoteSchema = z.object({
  optionId: z.string().min(1),
});

export const eventMenuPollCloseSchema = z.object({
  winningOptionId: z.string().optional(),
});

export const eventCloseSchema = z.object({
  playedBggIds: z.array(z.number().int().positive()),
  attendedUserIds: z.array(z.string()).optional(),
  attendedGuestNames: z.array(z.string().trim().min(1).max(60)).optional(),
  notes: z.string().max(500).optional(),
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
  rating?: number | null;
  rank?: number | null;
  bestPlayers?: string | null;
  minAge: number | null;
  coverUrl: string | null;
  sourceUrl: string;
  designers: string[];
  publishers: string[];
  categories: string[];
  mechanics: string[];
  lastEnrichedAt?: string | null;
}

export interface AttachedExpansion {
  bggId: number;
  name: string;
  maxPlayers: number | null;
  weight?: number | null;
  playingTime?: number | null;
  mechanics?: string[];
  sharedGroupIds?: string[];
}

export interface CollectionGame extends Game {
  sharedGroupIds: string[];
  isAvailable: boolean;
  unavailableReason: string | null;
  versionName: string | null;
  maxPlayersOverride?: number | null;
  isStandalone?: boolean | null;
  effectiveMaxPlayers?: number | null;
  expansionCount?: number;
  expansions?: AttachedExpansion[];
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
  isStandalone?: boolean | null;
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
  expansions?: AttachedExpansion[];
  isStandalone?: boolean | null;
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
  sharedMechanics?: string[];
  expansions?: { bggId: number; name: string }[];
  effectiveWeight?: number | null;
  addedMechanics?: string[];
}

export interface SessionLineupResult {
  status: "success" | "empty" | "no_match";
  lineup: SessionGameSlot[];
  totalEstimatedMinutes: number;
  transitionMinutes?: number;
  targetMinutes: number;
  hasHeavy: boolean;
  themeNotice?: string;
  recipeId?: string;
  recipeTitle?: string;
  recipeBadge?: string;
  recipeDescription?: string;
}

export interface SessionTemplateSummary {
  id: string;
  titlePrefix: string;
  styleBadge: string;
  description: string;
}

export const SESSION_TEMPLATES: SessionTemplateSummary[] = [
  {
    id: "heavy_euro_brainburner",
    titlePrefix: "Brain Burners & Heavy Euros",
    styleBadge: "🧠 Heavy Euro & Brain Burner",
    description: "Deep economic systems, worker placement, and complex optimization for players seeking heavy crunch.",
  },
  {
    id: "epic_strategy",
    titlePrefix: "Epic & Grand Strategy",
    styleBadge: "🔴 Heavy Strategy",
    description: "Centerpiece heavyweight strategy game with dedicated setup and mental reset transition buffers.",
  },
  {
    id: "tactical_conflict",
    titlePrefix: "Area Control & Tactical Combat",
    styleBadge: "⚔️ Area Control & Clashes",
    description: "Territorial struggle, tactical movement, and direct tabletop combat with high stakes.",
  },
  {
    id: "cooperative_survival",
    titlePrefix: "Cooperative Survival & Teamwork",
    styleBadge: "🤝 Co-op & Team Survival",
    description: "High-tension cooperative crisis management, pandemic response, and shared puzzle solving.",
  },
  {
    id: "engine_building",
    titlePrefix: "Engine Building & Synergies",
    styleBadge: "⚙️ Engine Building",
    description: "Combos, chain reactions, and satisfying tableaus where small actions snowball into massive turns.",
  },
  {
    id: "spatial_puzzle",
    titlePrefix: "Tile Placement & Spatial Puzzles",
    styleBadge: "🧩 Spatial & Tile Puzzles",
    description: "Pattern building, polyomino fitting, and spatial geometry that rewards careful spatial foresight.",
  },
  {
    id: "social_deduction",
    titlePrefix: "Social Deduction & Table Talk",
    styleBadge: "🎭 Social & Deduction",
    description: "Bluffing, hidden roles, lively debate, and reading the table for memorable social interactions.",
  },
  {
    id: "party_mayhem",
    titlePrefix: "Party Mayhem & Push-Your-Luck",
    styleBadge: "🎲 Party & Push-Your-Luck",
    description: "High energy, fast laughter, press-your-luck drama, and zero barrier to entry for any table.",
  },
  {
    id: "thematic_narrative",
    titlePrefix: "Thematic & Narrative Worlds",
    styleBadge: "🏰 Thematic & Narrative",
    description: "Rich worldbuilding, immersive lore, and storytelling where flavor drives every mechanical decision.",
  },
  {
    id: "table_favorites",
    titlePrefix: "Table Favorites & Wishlist",
    styleBadge: "⭐ Table Favorites",
    description: "Prioritizes titles with high community wishlist points that your group is most eager to table.",
  },
  {
    id: "accessible_gateway",
    titlePrefix: "Breezy Gateway & Modern Classics",
    styleBadge: "🟢 Accessible Classics",
    description: "Approachable rules, quick teach, and modern masterpieces welcoming newcomers and seasoned players alike.",
  },
  {
    id: "wildcard_random",
    titlePrefix: "Wildcard & Blind Draw",
    styleBadge: "🎲 Wildcard & Chaos",
    description: "Unfiltered random selection giving every eligible game an equal shot regardless of weight or votes.",
  },
];

export interface EventRsvpMember {
  userId: string;
  displayName: string;
  bggUsername?: string | null;
  status: "ATTENDING" | "DECLINED" | "MAYBE";
  additionalGuests: number;
  guestNames?: string[];
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
  effectiveWeight?: number | null;
  addedMechanics?: string[];
}

export interface EventMenuVote {
  userId: string;
  displayName: string;
}

export interface EventMenuOption {
  id: "A" | "B" | "C" | string;
  title: string;
  styleBadge: string;
  description: string;
  lineup: SessionGameSlot[];
  totalEstimatedMinutes: number;
  transitionMinutes: number;
  hasHeavy: boolean;
  themeNotice?: string;
  votes: EventMenuVote[];
}

export interface EventMenuPoll {
  status: "OPEN" | "CLOSED";
  options: EventMenuOption[];
  winningOptionId?: string | null;
  updatedAt: string;
}

export interface SessionMenuTrioResult {
  status: "success" | "empty" | "no_match";
  options: EventMenuOption[];
}

export interface EventDetail {
  id: string;
  groupId: string;
  groupName?: string;
  groupCreatorId?: string;
  creatorId?: string | null;
  creatorDisplayName?: string | null;
  canManage?: boolean;
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
  menuPoll?: EventMenuPoll | null;
  playedBggIds?: number[];
  playedGames?: Game[];
  confirmedGuestNames?: string[];
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
  maxLiquidPoints?: number;
  weeklyAllowance?: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
