import type { Metadata } from "next";

import { RuleView } from "./rule-view";
import { idParam } from "~/lib/params";

export const metadata: Metadata = { title: "Folder rule" };

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  return <RuleView id={idParam((await params).id)} />;
}
