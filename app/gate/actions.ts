"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionValue,
} from "@/lib/auth/cookie";

export type GateState = { error: string } | null;

/** Only allow internal redirect targets ("/..." but not protocol-relative "//..."). */
function safeFrom(from: unknown): string {
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  return "/";
}

export async function unlock(
  _prevState: GateState,
  formData: FormData,
): Promise<GateState> {
  const submitted = String(formData.get("password") ?? "").trim();
  const expected = process.env.ACCESS_PASSWORD;

  if (!expected || submitted.length === 0 || submitted !== expected) {
    return { error: "Wrong password" };
  }

  const secret = process.env.COOKIE_SECRET;
  if (!secret) {
    return { error: "Server is misconfigured (COOKIE_SECRET missing)" };
  }

  const value = await createSessionValue(secret);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  redirect(safeFrom(formData.get("from")));
}
