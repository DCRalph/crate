import type { Metadata } from "next";

import { idParam } from "~/lib/params";
import { RuleView } from "./rule-view";

export const metadata: Metadata = { title: "Folder rule" };

export default async function RulePage({ params }: { params: Promise<{ ruleId: string }> }) {
  return <RuleView id={idParam((await params).ruleId)} />;
}
