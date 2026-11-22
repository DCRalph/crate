/** Every action the activity log records, with how it reads in the table. */
export const activityActions = {
  "auth.sign_in": { label: "Signed in", tone: "ok" },
  "auth.sign_in_failed": { label: "Sign-in failed", tone: "bad" },
  "auth.subsonic_failed": { label: "App sign-in failed", tone: "bad" },
  "auth.subsonic_locked": { label: "App sign-ins throttled", tone: "bad" },
  "user.created": { label: "User added", tone: "neutral" },
  "user.updated": { label: "User changed", tone: "neutral" },
  "user.disabled": { label: "User disabled", tone: "warn" },
  "user.enabled": { label: "User enabled", tone: "ok" },
  "user.password_reset": { label: "Password reset", tone: "warn" },
  "user.deleted": { label: "User deleted", tone: "warn" },
  "access.changed": { label: "Access changed", tone: "neutral" },
  "app_password.created": { label: "App password added", tone: "neutral" },
  "app_password.revoked": { label: "App password revoked", tone: "warn" },
  "library.created": { label: "Library added", tone: "neutral" },
  "library.deleted": { label: "Library removed", tone: "warn" },
  "library.scanned": { label: "Library scanned", tone: "neutral" },
  "folder_rule.created": { label: "Folder rule added", tone: "neutral" },
  "folder_rule.deleted": { label: "Folder rule removed", tone: "warn" },
} as const satisfies Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }>;

export type ActivityAction = keyof typeof activityActions;
