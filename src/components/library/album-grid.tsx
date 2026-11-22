import Link from "next/link";

import { Skeleton } from "~/components/ui/skeleton";
import { Cover } from "./cover";

export type AlbumTile = { id: number; name: string; artistName: string; year: number | null };

const grid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6";

/** Albums as cover tiles. `showArtist` is off on an artist's own page. */
export function AlbumGrid({ albums, showArtist = true }: { albums: AlbumTile[]; showArtist?: boolean }) {
  return (
    <ul className={grid}>
      {albums.map((album) => (
        <li key={album.id} className="min-w-0">
          <Link href={`/albums/${album.id}`} className="group block rounded-md outline-none">
            <Cover type="album" id={album.id} size={400} className="group-focus-visible:ring-ring/50 w-full group-focus-visible:ring-[3px]" />
            <p className="mt-2 truncate text-[13px] font-medium group-hover:underline">{album.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {[showArtist ? album.artistName : null, album.year].filter(Boolean).join(" · ")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Static placeholders in the grid's shape while albums load. */
export function AlbumGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={grid}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
