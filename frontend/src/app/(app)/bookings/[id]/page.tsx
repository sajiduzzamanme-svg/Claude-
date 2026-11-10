import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import BookingView from "./view";

// The booking id comes from the URL at request time, so the view sits inside Suspense.
export default function BookingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8"><PageLoading /></div>}>
      <BookingView />
    </Suspense>
  );
}
