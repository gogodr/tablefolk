"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import type { ApiError } from "@tablefolk/contracts";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class RequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function useApi() {
  const { getToken } = useAuth();
  return useCallback(async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getToken();
    if (!token) throw new RequestError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = (data as ApiError).error;
      throw new RequestError(response.status, error?.code ?? "REQUEST_FAILED", error?.message ?? "Could not complete that request.");
    }
    return data as T;
  }, [getToken]);
}

export async function publicApi<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (data as ApiError).error;
    throw new RequestError(response.status, error?.code ?? "REQUEST_FAILED", error?.message ?? "Could not load the invitation.");
  }
  return data as T;
}
