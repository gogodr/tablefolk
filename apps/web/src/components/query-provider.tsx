"use client";

import { QueryClient, isServer } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useAuth } from "@clerk/nextjs";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

// Keep cached data up to 3 days to enable instant 0ms offline rendering & background revalidation
export const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;
const LEGACY_CACHE_KEY = "TABLEFOLK_OFFLINE_CACHE";
const CACHE_KEY_PREFIX = "TABLEFOLK_OFFLINE_CACHE_";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Default staleTime: 2 minutes
        staleTime: 2 * 60 * 1000,
        // Keep inactive cache in storage for 3 days
        gcTime: THREE_DAYS_MS,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

function PersistWrapper({ userId, children }: { userId: string | null | undefined; children: ReactNode }) {
  const queryClient = getQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Remove legacy unscoped cache key so stale data from previous sessions never leaks
      window.localStorage.removeItem(LEGACY_CACHE_KEY);
    }

    if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
      // Clear in-memory cache on sign-out or account switch
      queryClient.clear();
    }
    prevUserIdRef.current = userId;
  }, [userId, queryClient]);

  const storageKey = userId ? `${CACHE_KEY_PREFIX}${userId}` : `${CACHE_KEY_PREFIX}anon`;

  const persister = useMemo(() => {
    return createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: storageKey,
    });
  }, [storageKey]);

  return (
    <PersistQueryClientProvider
      key={storageKey}
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: THREE_DAYS_MS,
        buster: "v2",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Only persist authenticated user data to localStorage
            return Boolean(userId) && query.state.status === "success";
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

function ClerkQueryProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  return <PersistWrapper userId={isLoaded ? userId : null}>{children}</PersistWrapper>;
}

export function QueryProvider({
  clerkEnabled = false,
  children,
}: {
  clerkEnabled?: boolean;
  children: ReactNode;
}) {
  if (clerkEnabled) {
    return <ClerkQueryProvider>{children}</ClerkQueryProvider>;
  }
  return <PersistWrapper userId={null}>{children}</PersistWrapper>;
}
