import type { Metadata } from "next";

import { idParam } from "~/lib/params";
import { NewRuleView } from "./new-rule-view";

export const metadata: Metadata = { title: "Add folder rule" };

export default async function NewRulePage({ params }: { params: Promise<{ id: string }> }) {
  return <NewRuleView libraryId={idParam((await params).id)} />;
}
