import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * Portal-side rollup hook: finds all Partners the current user is a member of,
 * then finds all sub-brand (child) Partners. Returns the union of visible
 * partner names and a name→id map so properties can be tagged with their brand.
 *
 * @param {object} user - the current app user (from useCurrentUser — real or impersonated)
 */
export function usePortalPartnerRollup(user) {
  // 1. Find all Partners the current user is a member of (via portal_user_ids)
  const { data: myPartners = [] } = useQuery({
    queryKey: ["my-partners-rollup", user?.id],
    queryFn: () => base44.entities.Partner.filter({ portal_user_ids: { $in: [user.id] } }),
    enabled: !!user?.id,
  });

  const myPartnerIds = (myPartners || []).map(p => p.id);
  const primaryPartner = myPartners?.[0] || null;
  const primaryPartnerId = primaryPartner?.id || null;

  // 2. Find all child Partners where parent_partner_id matches any of myPartners
  const { data: childPartners = [] } = useQuery({
    queryKey: ["child-partners-rollup", myPartnerIds.join(",")],
    queryFn: async () => {
      if (myPartnerIds.length === 0) return [];
      const all = await base44.entities.Partner.list("-created_date", 500);
      return all.filter(p => p.parent_partner_id && myPartnerIds.includes(p.parent_partner_id));
    },
    enabled: myPartnerIds.length > 0,
  });

  // 3. Union → visiblePartners
  const visiblePartners = [...(myPartners || []), ...(childPartners || [])];
  const visiblePartnerNames = visiblePartners.map(p => p.partner_name).filter(Boolean);

  // name → id map (for brand tag augmentation)
  const partnerNameToId = {};
  const partnerNameToPartner = {};
  visiblePartners.forEach(p => {
    if (p.partner_name) {
      partnerNameToId[p.partner_name] = p.id;
      partnerNameToPartner[p.partner_name] = p;
    }
  });

  return {
    primaryPartner,
    primaryPartnerId,
    myPartners: myPartners || [],
    childPartners: childPartners || [],
    visiblePartners,
    visiblePartnerNames,
    partnerNameToId,
    partnerNameToPartner,
    hasSubBrands: (childPartners || []).length > 0,
  };
}