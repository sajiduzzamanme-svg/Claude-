import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import Wizard from "./wizard";

// The wizard reads ?customer= from the URL, so it renders inside a Suspense boundary.
export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8"><PageLoading /></div>}>
      <Wizard />
    </Suspense>
  );
}
