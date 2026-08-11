import { Suspense } from "react";
import { LicensePage } from "@/components/licenses/license-page";

export default function Home() {
  return (
    // A static page that uses useSearchParams through a Client Component needs
    // a Suspense boundary in Next.js 16 production builds.
    <Suspense fallback={null}>
      <LicensePage />
    </Suspense>
  );
}
