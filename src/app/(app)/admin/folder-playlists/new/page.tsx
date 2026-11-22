import type { Metadata } from "next";

import { NewRuleView } from "./new-rule-view";

export const metadata: Metadata = { title: "Add folder rule" };

export default async function NewRulePage({ searchParams }: { searchParams: Promise<{ library?: string }> }) {
  const library = Number((await searchParams).library);
  return <NewRuleView libraryId={Number.isInteger(library) && library > 0 ? library : null} />;
}
