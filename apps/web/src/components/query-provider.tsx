"use client";

import { QueryClient, isServer } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { type ReactNode, useMemo } from "react";

// Keep cached data up to 3 days to enable instant 0ms offline rendering & background revalidation
export const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;

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

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  const persister = useMemo(() => {
    return createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      key: "TABLEFOLK_OFFLINE_CACHE",
    });
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: THREE_DAYS_MS,
        buster: "v2",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Persist all successful queries to enable immediate 0ms rendering and PWA readiness
            return query.state.status === "success";
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
