import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { idParam } from "~/lib/params";
import { db } from "~/server/db";
import { folderRule } from "~/server/db/app-schema";

/**
 * A folder rule by its own number: the way to one for anything that knows the
 * rule but not its library (a playlist folder made by it, an old link). The
 * rule's page sits under its library, so this looks that up and goes there.
 */
export default async function RuleRedirect({ params }: { params: Promise<{ id: string }> }) {
  const id = idParam((await params).id);
  const [rule] = await db.select({ libraryId: folderRule.libraryId }).from(folderRule).where(eq(folderRule.id, id));
  if (!rule) notFound();
  redirect(`/admin/libraries/${rule.libraryId}/rules/${id}`);
}
