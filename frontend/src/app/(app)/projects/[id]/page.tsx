import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import ProjectView from "./view";

// useParams needs a Suspense boundary: the project id is only known at request time.
export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1360px] px-4 py-8 sm:px-6 lg:px-8"><PageLoading /></div>}>
      <ProjectView />
    </Suspense>
  );
}
