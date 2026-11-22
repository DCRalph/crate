import type { Metadata } from "next";

import { RuleView } from "./rule-view";

export const metadata: Metadata = { title: "Folder rule" };

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  return <RuleView id={Number((await params).id)} />;
}
