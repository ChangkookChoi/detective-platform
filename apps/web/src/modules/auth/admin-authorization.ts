import "server-only";

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import {
  resolveStaffRole,
  type StaffPrincipal,
} from "@/modules/auth/admin-roles";

export async function requireReviewer(
  returnBackUrl?: string,
): Promise<StaffPrincipal> {
  const authentication = await auth();

  if (!authentication.userId) {
    return authentication.redirectToSignIn(
      returnBackUrl ? { returnBackUrl } : undefined,
    );
  }

  const role = resolveStaffRole(authentication.userId);

  if (!role) {
    notFound();
  }

  return { actorId: authentication.userId, role };
}

export async function requireAdmin(
  returnBackUrl = "/admin",
): Promise<StaffPrincipal> {
  const principal = await requireReviewer(returnBackUrl);

  if (principal.role !== "admin") {
    notFound();
  }

  return principal;
}
