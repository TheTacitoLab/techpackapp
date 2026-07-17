import type {
  Partner,
  PartnerContact,
  PartnerGrant,
  ResolvedPartner,
  ResolvedPartnerGrant,
} from "@/types";

/**
 * Pure server-side assembly of the Settings → Partners view: fold a
 * workspace's partners, their contacts, and their grants into
 * `ResolvedPartner[]`, resolving each grant's polymorphic subject and its
 * visibility profile to display names via the passed lookup maps. Kept a pure
 * function (no Supabase) so it's unit-testable and the page just fetches +
 * calls it.
 *
 * A grant whose subject no longer exists (the brand/collection/product was
 * deleted after the grant was made — subject_id is FK-less by design) resolves
 * to a "(removed …)" label rather than being dropped, so the user can see and
 * revoke the stale grant instead of it silently vanishing.
 */
export function resolvePartners(
  partners: Partner[],
  contacts: PartnerContact[],
  grants: PartnerGrant[],
  lookups: {
    brandNames: Map<string, string>;
    collectionNames: Map<string, string>;
    productNames: Map<string, string>;
    profileNames: Map<string, string>;
  },
): ResolvedPartner[] {
  const contactsByPartner = new Map<string, PartnerContact[]>();
  for (const c of contacts) {
    const list = contactsByPartner.get(c.partner_id) ?? [];
    list.push(c);
    contactsByPartner.set(c.partner_id, list);
  }

  const grantsByPartner = new Map<string, ResolvedPartnerGrant[]>();
  for (const g of grants) {
    const list = grantsByPartner.get(g.partner_id) ?? [];
    list.push({
      ...g,
      subjectName: resolveSubjectName(g, lookups),
      profileName:
        lookups.profileNames.get(g.visibility_profile_id) ??
        "(removed profile)",
    });
    grantsByPartner.set(g.partner_id, list);
  }

  return partners.map((p) => ({
    ...p,
    contacts: sortContacts(contactsByPartner.get(p.id) ?? []),
    grants: grantsByPartner.get(p.id) ?? [],
  }));
}

function resolveSubjectName(
  grant: PartnerGrant,
  lookups: {
    brandNames: Map<string, string>;
    collectionNames: Map<string, string>;
    productNames: Map<string, string>;
  },
): string {
  const map =
    grant.subject_type === "brand"
      ? lookups.brandNames
      : grant.subject_type === "collection"
        ? lookups.collectionNames
        : lookups.productNames;
  return map.get(grant.subject_id) ?? `(removed ${grant.subject_type})`;
}

/** Primary contact first, then by name — the order the partner card shows. */
function sortContacts(contacts: PartnerContact[]): PartnerContact[] {
  return [...contacts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.full_name.localeCompare(b.full_name);
  });
}

/** The partner's primary contact, or the first, or null. */
export function primaryContact(partner: ResolvedPartner): PartnerContact | null {
  return (
    partner.contacts.find((c) => c.is_primary) ?? partner.contacts[0] ?? null
  );
}

/** Whether any of a partner's contacts have portal access enabled (P2 intent). */
export function partnerAccessEnabled(partner: ResolvedPartner): boolean {
  return partner.contacts.some((c) => c.access_enabled);
}
