/**
 * Split decimal or combined bath counts into full + half baths.
 * e.g. 4.5 → { bathrooms: 4, half_bathrooms: 1 }
 */
export function splitBathrooms(bathrooms, halfBathrooms) {
  const halfHint = Number(halfBathrooms);
  const hasHalfHint = halfBathrooms !== "" && halfBathrooms != null && Number.isFinite(halfHint);

  if (bathrooms === "" || bathrooms == null) {
    return {
      bathrooms: undefined,
      half_bathrooms: hasHalfHint && halfHint > 0 ? halfHint : undefined,
    };
  }

  const n = Number(bathrooms);
  if (!Number.isFinite(n)) {
    return { bathrooms: undefined, half_bathrooms: hasHalfHint ? halfHint : undefined };
  }

  // Already separated (integer baths + explicit half field)
  if (hasHalfHint) {
    return {
      bathrooms: Math.floor(n),
      half_bathrooms: halfHint > 0 ? halfHint : undefined,
    };
  }

  // Decimal like 4.5 → 4 full + 1 half
  if (!Number.isInteger(n)) {
    const full = Math.floor(n);
    const half = Math.round((n - full) * 2);
    return {
      bathrooms: full,
      half_bathrooms: half > 0 ? half : undefined,
    };
  }

  return { bathrooms: n, half_bathrooms: undefined };
}
