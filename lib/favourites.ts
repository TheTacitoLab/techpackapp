/**
 * Split a picker's item list into the workspace's starred items and the rest,
 * preserving the incoming (name-sorted) order within each half. The pickers
 * render the `favourites` half as a pinned "Favourites" group ABOVE the full
 * list — partitioned, not duplicated, so an item never appears twice and
 * cmdk's per-item filtering keeps working unchanged.
 */
export function partitionFavourites<T extends { isFavourite: boolean }>(
  items: readonly T[],
): { favourites: T[]; rest: T[] } {
  const favourites: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (item.isFavourite ? favourites : rest).push(item);
  }
  return { favourites, rest };
}
