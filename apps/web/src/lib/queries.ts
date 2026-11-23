"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { useApi } from "@/lib/api";
import type {
  GroupSummary,
  GroupDetail,
  GroupGame,
  UserVotingSummary,
  CollectionGame,
  EventDetail,
} from "@tablefolk/contracts";

const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export const queryKeys = {
  groups: ["groups"] as const,
  groupDetail: (groupId: string) => ["groups", groupId] as const,
  groupGames: (groupId: string) => ["groups", groupId, "games"] as const,
  groupInterest: (groupId: string) => ["groups", groupId, "interest"] as const,
  events: ["events"] as const,
  groupEvents: (groupId: string) => ["groups", groupId, "events"] as const,
  eventDetail: (eventId: string) => ["events", eventId] as const,
  collection: ["collection"] as const,
  bggProfile: ["user", "bgg-profile"] as const,
};

export function useGroupsQuery() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => api<{ groups: GroupSummary[] }>("/v1/groups"),
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 5 * 60 * 1000, // 5 min fresh
    gcTime: THREE_DAYS_MS, // cached up to 3 days
  });
}

export function useGroupDetailQuery(groupId: string) {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groupDetail(groupId),
    queryFn: () => api<{ group: GroupDetail }>(`/v1/groups/${groupId}`),
    enabled: Boolean(isLoaded && isSignedIn && groupId),
    staleTime: 3 * 60 * 1000, // 3 min fresh
    gcTime: THREE_DAYS_MS,
  });
}

export function useGroupGamesQuery(groupId: string) {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groupGames(groupId),
    queryFn: () => api<{ games: GroupGame[] }>(`/v1/groups/${groupId}/games`),
    enabled: Boolean(isLoaded && isSignedIn && groupId),
    staleTime: 10 * 60 * 1000, // 10 min fresh (catalog rarely changes)
    gcTime: THREE_DAYS_MS, // 3 days in cache for instant offline rendering
  });
}

export function useGroupInterestQuery(groupId: string) {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groupInterest(groupId),
    queryFn: async () => {
      try {
        return await api<{ summary: UserVotingSummary }>(`/v1/groups/${groupId}/interest`);
      } catch {
        return null;
      }
    },
    enabled: Boolean(isLoaded && isSignedIn && groupId),
    staleTime: 60 * 1000,
    gcTime: ONE_DAY_MS,
  });
}

export function useEventsCalendarQuery() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => api<{ events: EventDetail[] }>("/v1/events"),
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 45 * 1000, // 45 seconds fresh
    gcTime: ONE_DAY_MS,
  });
}

export function useGroupEventsQuery(groupId: string) {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.groupEvents(groupId),
    queryFn: () => api<{ events: EventDetail[] }>(`/v1/groups/${groupId}/events`),
    enabled: Boolean(isLoaded && isSignedIn && groupId),
    staleTime: 45 * 1000,
    gcTime: ONE_DAY_MS,
  });
}

export function useEventDetailQuery(eventId: string) {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.eventDetail(eventId),
    queryFn: () => api<{ event: EventDetail }>(`/v1/events/${eventId}`),
    enabled: Boolean(isLoaded && isSignedIn && eventId),
    staleTime: 20 * 1000, // 20s fresh for dynamic RSVP updates
    gcTime: ONE_DAY_MS,
  });
}

export function useCollectionQuery() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.collection,
    queryFn: () => api<{ games: CollectionGame[] }>("/v1/collection"),
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 10 * 60 * 1000, // 10 min fresh
    gcTime: THREE_DAYS_MS, // 3 days in cache for instant offline rendering
  });
}

export function useBggProfileQuery() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.bggProfile,
    queryFn: async () => {
      try {
        return await api<{ bggUsername: string | null; lastBggSyncAt: string | null }>("/v1/user/bgg-profile");
      } catch {
        return { bggUsername: null, lastBggSyncAt: null };
      }
    },
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 30 * 60 * 1000, // 30 min fresh
    gcTime: THREE_DAYS_MS,
  });
}
