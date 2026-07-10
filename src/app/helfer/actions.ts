"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HELFER_COOKIE } from "@/lib/auth/helferSession";

export async function beenden() {
  (await cookies()).delete(HELFER_COOKIE);
  redirect("/");
}
