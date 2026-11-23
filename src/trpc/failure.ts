/** A failed request, as much of it as the app looks at. tRPC's errors fit. */
export type Failure = { message: string; data?: { code?: string } | null };

const finalCodes = new Set(["NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "BAD_REQUEST"]);

/** Whether asking again would get the same answer: the thing isn't there, or isn't this person's to see. */
export const isFinal = (error: Failure) => finalCodes.has(error.data?.code ?? "");
