import type { Metadata } from "next";
import { SectionLabel } from "@/components/ui";
import { AccountSections } from "./AccountSections";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <SectionLabel n="00">Account</SectionLabel>
      <h1 className="mt-3 text-4xl font-bold">Your wallet &amp; tier</h1>
      <AccountSections />
    </div>
  );
}
