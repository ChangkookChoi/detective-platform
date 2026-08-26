import { createHash } from "node:crypto";

const maximumSlugLength = 80;
const genericOfficeTerms = [
  "private investigation",
  "detective agency",
  "탐정사무소",
  "탐정법인",
  "공인탐정",
  "사설탐정",
  "민간조사",
  "흥신소",
  "탐정",
  "사무소",
  "법인",
  "detective",
  "agency",
  "office",
] as const;
const corporateTerms = ["주식회사", "유한회사", "합자회사", "㈜", "(주)"] as const;
const koreanLetterNames = [
  ["더블유", "w"],
  ["에이치", "h"],
  ["에프", "f"],
  ["에스", "s"],
  ["엑스", "x"],
  ["와이", "y"],
  ["제트", "z"],
  ["에이", "a"],
  ["제이", "j"],
  ["케이", "k"],
  ["브이", "v"],
  ["비", "b"],
  ["씨", "c"],
  ["디", "d"],
  ["이", "e"],
  ["지", "g"],
  ["아이", "i"],
  ["엘", "l"],
  ["엠", "m"],
  ["엔", "n"],
  ["오", "o"],
  ["피", "p"],
  ["큐", "q"],
  ["알", "r"],
  ["티", "t"],
  ["유", "u"],
] as const;

const initials = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
] as const;
const vowels = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
] as const;
const finals = [
  "",
  "k",
  "k",
  "ks",
  "n",
  "nj",
  "nh",
  "t",
  "l",
  "lk",
  "lm",
  "lb",
  "ls",
  "lt",
  "lp",
  "lh",
  "m",
  "p",
  "ps",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "h",
] as const;

function transliterateKoreanLetterName(value: string) {
  const compact = value.replace(/[\s.·_-]+/gu, "");
  if (!compact) return null;
  let position = 0;
  let result = "";
  let tokenCount = 0;

  while (position < compact.length) {
    const token = koreanLetterNames.find(([name]) =>
      compact.startsWith(name, position),
    );
    if (!token) return null;
    result += token[1];
    position += token[0].length;
    tokenCount += 1;
  }

  return tokenCount >= 2 ? result : null;
}

function transliterateHangul(value: string) {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      if (code < 0xac00 || code > 0xd7a3) return character;
      const offset = code - 0xac00;
      const initial = Math.floor(offset / 588);
      const vowel = Math.floor((offset % 588) / 28);
      const final = offset % 28;
      return `${initials[initial]}${vowels[vowel]}${finals[final]}`;
    })
    .join("");
}

function normalizeSlugPart(value: string) {
  return transliterateHangul(value.normalize("NFKC"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
}

function trimSlug(value: string, maximum = maximumSlugLength) {
  return value.slice(0, maximum).replace(/-+$/u, "");
}

function brandSlug(name: string, regionNames: ReadonlyArray<string>) {
  let brand = name.normalize("NFKC").toLowerCase();
  for (const term of corporateTerms) brand = brand.replaceAll(term, " ");
  for (const term of genericOfficeTerms) brand = brand.replaceAll(term, " ");
  for (const term of regionNames) {
    brand = brand.replaceAll(term.normalize("NFKC").toLowerCase(), " ");
  }
  brand = brand.replace(/\s+/gu, " ").trim();
  const letterName = transliterateKoreanLetterName(brand);
  return normalizeSlugPart(letterName ?? brand) || "office";
}

export function createOfficeSlugBase(
  name: string,
  regionSlug: string,
  regionNames: ReadonlyArray<string> = [],
) {
  const normalizedRegion = normalizeSlugPart(regionSlug);
  const suffix = normalizedRegion ? `-detective-${normalizedRegion}` : "-detective";
  const maximumBrandLength = Math.max(1, maximumSlugLength - suffix.length);
  const brand =
    trimSlug(brandSlug(name, regionNames), maximumBrandLength) || "office";
  return trimSlug(`${brand}${suffix}`);
}

function collisionToken(stableKey: string, length: number) {
  return createHash("sha256").update(stableKey).digest("hex").slice(0, length);
}

export function suggestAvailableOfficeSlug(input: {
  name: string;
  regionSlug: string;
  unavailableSlugs: ReadonlyArray<string>;
  stableKey: string;
  regionNames?: ReadonlyArray<string>;
}) {
  const base = createOfficeSlugBase(
    input.name,
    input.regionSlug,
    input.regionNames,
  );
  const unavailable = new Set(
    input.unavailableSlugs.map((slug) => slug.trim().toLowerCase()),
  );
  if (!unavailable.has(base)) return base;

  for (const length of [6, 8, 10, 12]) {
    const suffix = `-${collisionToken(input.stableKey, length)}`;
    const candidate = `${trimSlug(base, maximumSlugLength - suffix.length)}${suffix}`;
    if (!unavailable.has(candidate)) return candidate;
  }

  for (let sequence = 2; sequence < 10_000; sequence += 1) {
    const suffix = `-${sequence}`;
    const candidate = `${trimSlug(base, maximumSlugLength - suffix.length)}${suffix}`;
    if (!unavailable.has(candidate)) return candidate;
  }

  throw new Error("office_slug_space_exhausted");
}
