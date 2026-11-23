"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "./api";
import { queryKeys } from "./queries";
import type { CollectionGame, Game } from "@tablefolk/contracts";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THROTTLE_MS = 15 * 60 * 1000; // Run at most once every 15 minutes per browser session

export function useAutoEnrich(games: (Game | CollectionGame)[] | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const isRunningRef = useRef(false);
  const [isAutoEnriching, setIsAutoEnriching] = useState(false);

  useEffect(() => {
    if (!games || games.length === 0 || isRunningRef.current) return;

    try {
      const lastRun = Number(sessionStorage.getItem("tablefolk_last_auto_enrich_at") ?? "0");
      if (Date.now() - lastRun < THROTTLE_MS) {
        return;
      }
    } catch {
      // Ignore sessionStorage errors
    }

    const now = Date.now();
    const hasCandidates = games.some((g) => {
      if (!g.lastEnrichedAt) return true;
      const enrichedAt = new Date(g.lastEnrichedAt).getTime();
      const isStale = (now - enrichedAt) > SEVEN_DAYS_MS;
      const missingData =
        g.weight === null ||
        g.rating === null ||
        g.rating === undefined ||
        g.rank === null ||
        g.rank === undefined ||
        g.bestPlayers === null ||
        g.bestPlayers === undefined ||
        !g.coverUrl ||
        !g.coverUrl.startsWith("/v1/covers/");
      return missingData || isStale;
    });

    if (!hasCandidates) return;

    // Gentle 2.5s delay after page mount before initiating background sync
    const timer = setTimeout(async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      setIsAutoEnriching(true);

      try {
        const res = await api<{ enrichedCount: number; remainingCount: number; totalCandidates: number }>(
          "/v1/collection/enrich",
          { method: "POST" }
        );

        try {
          sessionStorage.setItem("tablefolk_last_auto_enrich_at", String(Date.now()));
        } catch {}

        if (res.enrichedCount > 0) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.collection }),
            queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
          ]);
        }
      } catch (err) {
        console.warn("Background auto-enrichment notice:", err);
      } finally {
        isRunningRef.current = false;
        setIsAutoEnriching(false);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [games, api, queryClient]);

  return { isAutoEnriching };
}
