import { ScanForm } from "@/components/ScanForm";
import { APP_NAME, DISCLAIMER } from "@/lib/config";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold">{APP_NAME}</h1>
      <p className="mt-2 text-muted">Paste a Solana token mint to get an evidence-backed risk report.</p>
      <div className="mt-6">
        <ScanForm autoFocus />
      </div>
      <p className="mt-6 text-xs text-red-dark">{DISCLAIMER}</p>
    </div>
  );
}
