/**
 * Pure helpers for the one-level collection hierarchy (migration 0042).
 *
 * The depth rule — a collection may have a parent, but a collection that has
 * a parent can never itself be a parent — is enforced in three places: the
 * server actions (friendly errors, via `parentAssignmentError`), a DB trigger
 * (hard backstop), and the pickers (which only offer valid parents). This
 * module is dependency-free so it runs under Node type-stripping for tests.
 */

export type CollectionRef = {
  id: string;
  parent_id: string | null;
};

/**
 * Validate assigning `parentId` to a collection. Returns a user-facing error
 * string, or null when the assignment is allowed.
 *
 * `collectionId` is null when creating a new collection. `parent` is the
 * fetched row for `parentId` (null when not found in the caller's workspace).
 * `childCount` is how many sub-collections the edited collection already has
 * (always 0 when creating).
 */
export function parentAssignmentError(input: {
  collectionId: string | null;
  parentId: string | null;
  parent: CollectionRef | null;
  childCount: number;
}): string | null {
  if (!input.parentId) return null;
  if (input.collectionId !== null && input.parentId === input.collectionId) {
    return "A collection cannot be its own parent.";
  }
  if (!input.parent) {
    return "Parent collection not found in your workspace.";
  }
  if (input.parent.parent_id !== null) {
    return "Collections can only nest one level deep. Choose a top-level collection as the parent.";
  }
  if (input.childCount > 0) {
    return "This collection has sub-collections of its own, so it cannot be moved under a parent.";
  }
  return null;
}

/** Map of parent collection id → its direct children's ids (input order). */
export function childIdsByParent(
  collections: readonly CollectionRef[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const col of collections) {
    if (!col.parent_id) continue;
    const children = map.get(col.parent_id);
    if (children) children.push(col.id);
    else map.set(col.parent_id, [col.id]);
  }
  return map;
}

/**
 * The collection's own id plus its direct children's ids — the id set used
 * everywhere a parent view "includes sub-collections" (roll-up counts,
 * progress, covers, product filters).
 */
export function collectionWithChildIds(
  collections: readonly CollectionRef[],
  id: string,
): string[] {
  const ids = [id];
  for (const col of collections) {
    if (col.parent_id === id) ids.push(col.id);
  }
  return ids;
}

export type PickerCollection = CollectionRef & { name: string };

export type PickerOption = {
  id: string;
  name: string;
  /** 0 = top-level, 1 = sub-collection. */
  depth: 0 | 1;
  parentName: string | null;
};

/**
 * Flatten collections for a picker: top-level collections in input order,
 * each immediately followed by its sub-collections (input order). A child
 * whose parent is missing from the list is surfaced at the top level rather
 * than dropped, so no collection is ever unselectable.
 */
export function orderCollectionsForPicker(
  collections: readonly PickerCollection[],
): PickerOption[] {
  const byParent = childIdsByParent(collections);
  const byId = new Map(collections.map((c) => [c.id, c]));
  const out: PickerOption[] = [];

  for (const col of collections) {
    if (col.parent_id && byId.has(col.parent_id)) continue; // emitted under its parent
    out.push({ id: col.id, name: col.name, depth: 0, parentName: null });
    for (const childId of byParent.get(col.id) ?? []) {
      const child = byId.get(childId);
      if (!child) continue;
      out.push({
        id: child.id,
        name: child.name,
        depth: 1,
        parentName: col.name,
      });
    }
  }
  return out;
}
