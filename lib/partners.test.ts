import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  partnerAccessEnabled,
  primaryContact,
  resolvePartners,
} from "./partners.ts";
import type { Partner, PartnerContact, PartnerGrant } from "@/types";

function partner(over: Partial<Partner> & Pick<Partner, "id">): Partner {
  return {
    workspace_id: "ws-1",
    name: "Acme",
    type: "supplier",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function contact(
  over: Partial<PartnerContact> & Pick<PartnerContact, "id" | "partner_id">,
): PartnerContact {
  return {
    workspace_id: "ws-1",
    full_name: "Jane Doe",
    email: null,
    is_primary: false,
    access_enabled: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function grant(
  over: Partial<PartnerGrant> &
    Pick<PartnerGrant, "id" | "partner_id" | "subject_type" | "subject_id">,
): PartnerGrant {
  return {
    workspace_id: "ws-1",
    visibility_profile_id: "profile-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const lookups = {
  brandNames: new Map([["brand-1", "Northbound"]]),
  collectionNames: new Map([["col-1", "SS26"]]),
  productNames: new Map([["prod-1", "Field Jacket"]]),
  profileNames: new Map([["profile-1", "Factory Merchandiser"]]),
};

describe("resolvePartners", () => {
  it("attaches each partner's own contacts and grants", () => {
    const partners = [partner({ id: "p1" }), partner({ id: "p2", name: "Beta" })];
    const contacts = [
      contact({ id: "c1", partner_id: "p1", full_name: "Alice" }),
      contact({ id: "c2", partner_id: "p2", full_name: "Bob" }),
    ];
    const grants = [
      grant({
        id: "g1",
        partner_id: "p1",
        subject_type: "brand",
        subject_id: "brand-1",
      }),
    ];

    const resolved = resolvePartners(partners, contacts, grants, lookups);

    const p1 = resolved.find((p) => p.id === "p1")!;
    const p2 = resolved.find((p) => p.id === "p2")!;
    assert.equal(p1.contacts.length, 1);
    assert.equal(p1.contacts[0].full_name, "Alice");
    assert.equal(p1.grants.length, 1);
    assert.equal(p2.contacts.length, 1);
    assert.equal(p2.grants.length, 0);
  });

  it("resolves grant subject and profile display names by type", () => {
    const grants = [
      grant({ id: "g1", partner_id: "p1", subject_type: "brand", subject_id: "brand-1" }),
      grant({ id: "g2", partner_id: "p1", subject_type: "collection", subject_id: "col-1" }),
      grant({ id: "g3", partner_id: "p1", subject_type: "product", subject_id: "prod-1" }),
    ];
    const [p1] = resolvePartners([partner({ id: "p1" })], [], grants, lookups);
    assert.deepEqual(
      p1.grants.map((g) => g.subjectName),
      ["Northbound", "SS26", "Field Jacket"],
    );
    assert.equal(p1.grants[0].profileName, "Factory Merchandiser");
  });

  it("labels a grant whose subject was deleted rather than dropping it", () => {
    const grants = [
      grant({
        id: "g1",
        partner_id: "p1",
        subject_type: "product",
        subject_id: "gone",
      }),
    ];
    const [p1] = resolvePartners([partner({ id: "p1" })], [], grants, lookups);
    assert.equal(p1.grants.length, 1);
    assert.equal(p1.grants[0].subjectName, "(removed product)");
  });

  it("labels a grant whose profile was deleted", () => {
    const grants = [
      grant({
        id: "g1",
        partner_id: "p1",
        subject_type: "brand",
        subject_id: "brand-1",
        visibility_profile_id: "gone",
      }),
    ];
    const [p1] = resolvePartners([partner({ id: "p1" })], [], grants, lookups);
    assert.equal(p1.grants[0].profileName, "(removed profile)");
  });

  it("orders contacts primary-first, then by name", () => {
    const contacts = [
      contact({ id: "c1", partner_id: "p1", full_name: "Zara" }),
      contact({ id: "c2", partner_id: "p1", full_name: "Yusuf", is_primary: true }),
      contact({ id: "c3", partner_id: "p1", full_name: "Amir" }),
    ];
    const [p1] = resolvePartners([partner({ id: "p1" })], contacts, [], lookups);
    assert.deepEqual(
      p1.contacts.map((c) => c.full_name),
      ["Yusuf", "Amir", "Zara"],
    );
  });
});

describe("primaryContact", () => {
  it("returns the primary contact when one is flagged", () => {
    const [p1] = resolvePartners(
      [partner({ id: "p1" })],
      [
        contact({ id: "c1", partner_id: "p1", full_name: "Non" }),
        contact({ id: "c2", partner_id: "p1", full_name: "Prime", is_primary: true }),
      ],
      [],
      lookups,
    );
    assert.equal(primaryContact(p1)?.full_name, "Prime");
  });

  it("falls back to the first contact, then null", () => {
    const [withContacts] = resolvePartners(
      [partner({ id: "p1" })],
      [contact({ id: "c1", partner_id: "p1", full_name: "Only" })],
      [],
      lookups,
    );
    assert.equal(primaryContact(withContacts)?.full_name, "Only");

    const [none] = resolvePartners([partner({ id: "p2" })], [], [], lookups);
    assert.equal(primaryContact(none), null);
  });
});

describe("partnerAccessEnabled", () => {
  it("is true when any contact has access enabled", () => {
    const [p1] = resolvePartners(
      [partner({ id: "p1" })],
      [
        contact({ id: "c1", partner_id: "p1" }),
        contact({ id: "c2", partner_id: "p1", access_enabled: true }),
      ],
      [],
      lookups,
    );
    assert.equal(partnerAccessEnabled(p1), true);
  });

  it("is false when no contact has access", () => {
    const [p1] = resolvePartners(
      [partner({ id: "p1" })],
      [contact({ id: "c1", partner_id: "p1" })],
      [],
      lookups,
    );
    assert.equal(partnerAccessEnabled(p1), false);
  });
});
