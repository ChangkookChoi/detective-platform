export type StaffRole = "admin" | "reviewer";

export type StaffPrincipal = {
  actorId: string;
  role: StaffRole;
};

function parseUserIds(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function resolveStaffRole(
  userId: string,
  configuration: {
    adminUserIds?: string;
    reviewerUserIds?: string;
  } = {
    adminUserIds: process.env.CLERK_ADMIN_USER_IDS,
    reviewerUserIds: process.env.CLERK_REVIEWER_USER_IDS,
  },
): StaffRole | null {
  if (parseUserIds(configuration.adminUserIds).has(userId)) {
    return "admin";
  }

  if (parseUserIds(configuration.reviewerUserIds).has(userId)) {
    return "reviewer";
  }

  return null;
}
