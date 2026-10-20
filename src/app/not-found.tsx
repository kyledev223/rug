import Link from "next/link";
import { ScanForm } from "@/components/ScanForm";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <p className="label-num">error · 404</p>
      <h1 className="mt-3 text-4xl font-bold">Nothing at this address.</h1>
      <p className="mt-3 text-muted">The page doesn&apos;t exist, or the mint address in the URL isn&apos;t a valid Solana address.</p>
      <div className="mt-6">
        <ScanForm size="sm" />
      </div>
      <Link href="/" className="link mt-6 inline-block text-sm">
        ← back home
      </Link>
    </div>
  );
}
