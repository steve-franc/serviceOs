import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic page-level skeleton used as Suspense fallback and route-guard
 * loading states. Matches the typical content shape (header, stat row, list)
 * so swapping to real content feels seamless.
 */
export const PageSkeleton = () => (
  <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  </div>
);

export const InlineSkeleton = () => (
  <div className="min-h-[40vh] flex items-center justify-center w-full">
    <div className="space-y-3 w-full max-w-md px-4">
      <Skeleton className="h-6 w-1/2 mx-auto" />
      <Skeleton className="h-4 w-3/4 mx-auto" />
      <Skeleton className="h-4 w-2/3 mx-auto" />
    </div>
  </div>
);

export default PageSkeleton;
