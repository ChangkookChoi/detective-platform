export type RegionSuggestionGroup = {
  slug: string;
  name: string;
  regions: ReadonlyArray<{ slug: string; label: string }>;
};

const provinceAliases: Readonly<Record<string, ReadonlyArray<string>>> = {
  seoul: ["서울특별시", "서울"],
  gyeonggi: ["경기도", "경기"],
  incheon: ["인천광역시", "인천"],
};

function compact(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

export function suggestRegionSlugFromAddress(
  addressText: string,
  regionGroups: ReadonlyArray<RegionSuggestionGroup>,
) {
  const address = compact(addressText);
  if (!address) return "";

  const group = regionGroups.find((candidate) => {
    const aliases = provinceAliases[candidate.slug] ?? [candidate.name];
    return aliases.some((alias) => address.startsWith(compact(alias)));
  });
  if (!group) return "";

  const matches = group.regions
    .map((region) => ({
      ...region,
      parts: region.label
        .split("/")
        .map((part) => compact(part))
        .filter(Boolean),
    }))
    .filter(
      (region) =>
        region.parts.length > 0 &&
        region.parts.every((part) => address.includes(part)),
    )
    .sort(
      (left, right) =>
        right.parts.length - left.parts.length ||
        right.label.length - left.label.length,
    );

  const best = matches[0];
  if (!best) return "";
  const equallySpecific = matches.filter(
    (match) =>
      match.parts.length === best.parts.length &&
      match.label.length === best.label.length,
  );
  return new Set(equallySpecific.map((match) => match.slug)).size === 1
    ? best.slug
    : "";
}

export function regionNameTermsForSlug(
  regionSlug: string,
  regionGroups: ReadonlyArray<RegionSuggestionGroup>,
) {
  const group = regionGroups.find((candidate) =>
    candidate.regions.some((region) => region.slug === regionSlug),
  );
  const region = group?.regions.find((candidate) => candidate.slug === regionSlug);
  if (!group || !region) return [];

  const administrativeNames = [group.name, ...region.label.split("/")].map(
    (name) => name.trim(),
  );
  const shortenedNames = administrativeNames.map((name) =>
    name.replace(
      /(?:특별자치도|특별자치시|특별시|광역시|도|시|군|구)$/u,
      "",
    ),
  );
  const slugNames = regionSlug.split("-").filter((name) => name.length >= 3);

  return [
    ...new Set(
      [...administrativeNames, ...shortenedNames, ...slugNames].filter(
        (name) => name.length >= 2,
      ),
    ),
  ].sort((left, right) => right.length - left.length);
}
