import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  childIdsByParent,
  collectionWithChildIds,
  orderCollectionsForPicker,
  parentAssignmentError,
  type PickerCollection,
} from "./collection-hierarchy.ts";

const top = (id: string): { id: string; parent_id: null } => ({
  id,
  parent_id: null,
});
const sub = (id: string, parent: string) => ({ id, parent_id: parent });

describe("parentAssignmentError", () => {
  it("allows a top-level assignment (no parent)", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: "a",
        parentId: null,
        parent: null,
        childCount: 3,
      }),
      null,
    );
  });

  it("allows creating a sub under a top-level parent", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: null,
        parentId: "p",
        parent: top("p"),
        childCount: 0,
      }),
      null,
    );
  });

  it("allows moving an existing childless collection under a top-level parent", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: "a",
        parentId: "p",
        parent: top("p"),
        childCount: 0,
      }),
      null,
    );
  });

  it("rejects self-parenting", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: "a",
        parentId: "a",
        parent: top("a"),
        childCount: 0,
      }),
      "A collection cannot be its own parent.",
    );
  });

  it("rejects a parent that is itself a sub-collection (depth > 1)", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: null,
        parentId: "s",
        parent: sub("s", "p"),
        childCount: 0,
      }),
      "Collections can only nest one level deep. Choose a top-level collection as the parent.",
    );
  });

  it("rejects nesting a collection that has children of its own", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: "a",
        parentId: "p",
        parent: top("p"),
        childCount: 2,
      }),
      "This collection has sub-collections of its own, so it cannot be moved under a parent.",
    );
  });

  it("rejects a parent that was not found", () => {
    assert.equal(
      parentAssignmentError({
        collectionId: null,
        parentId: "ghost",
        parent: null,
        childCount: 0,
      }),
      "Parent collection not found in your workspace.",
    );
  });
});

describe("childIdsByParent", () => {
  it("groups children under their parents in input order", () => {
    const map = childIdsByParent([
      top("a"),
      sub("a1", "a"),
      top("b"),
      sub("a2", "a"),
      sub("b1", "b"),
    ]);
    assert.deepEqual(map.get("a"), ["a1", "a2"]);
    assert.deepEqual(map.get("b"), ["b1"]);
    assert.equal(map.has("a1"), false);
  });
});

describe("collectionWithChildIds", () => {
  const all = [top("a"), sub("a1", "a"), sub("a2", "a"), top("b"), sub("b1", "b")];

  it("returns the collection plus its direct children", () => {
    assert.deepEqual(collectionWithChildIds(all, "a"), ["a", "a1", "a2"]);
  });

  it("returns just the collection itself for a sub-collection", () => {
    assert.deepEqual(collectionWithChildIds(all, "a1"), ["a1"]);
  });
});

describe("orderCollectionsForPicker", () => {
  it("lists each top-level collection followed by its subs", () => {
    const cols: PickerCollection[] = [
      { ...top("a"), name: "Alpha" },
      { ...top("b"), name: "Beta" },
      { ...sub("b1", "b"), name: "Beta Match" },
      { ...sub("a1", "a"), name: "Alpha Training" },
    ];
    assert.deepEqual(orderCollectionsForPicker(cols), [
      { id: "a", name: "Alpha", depth: 0, parentName: null },
      { id: "a1", name: "Alpha Training", depth: 1, parentName: "Alpha" },
      { id: "b", name: "Beta", depth: 0, parentName: null },
      { id: "b1", name: "Beta Match", depth: 1, parentName: "Beta" },
    ]);
  });

  it("surfaces a child with a missing parent at the top level", () => {
    const cols: PickerCollection[] = [
      { ...sub("orphan", "gone"), name: "Orphan" },
      { ...top("a"), name: "Alpha" },
    ];
    assert.deepEqual(orderCollectionsForPicker(cols), [
      { id: "orphan", name: "Orphan", depth: 0, parentName: null },
      { id: "a", name: "Alpha", depth: 0, parentName: null },
    ]);
  });
});
