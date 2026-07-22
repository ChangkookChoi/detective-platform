import { createHash } from "node:crypto";

type RegionType = "province" | "city" | "county" | "district";

type RegionSeedEntry = {
  id: string;
  slug: string;
  name: string;
  type: RegionType;
  parentId: string | null;
  displayOrder: number;
};

const seoulId = "10000000-0000-4000-8000-000000000001";
const gyeonggiId = "10000000-0000-4000-8000-000000000002";
const regionNamespace = "b7bce589-e0d9-5c8f-bab4-e93f760aa84f";

const preservedRegionIds: Record<string, string> = {
  seoul: seoulId,
  gyeonggi: gyeonggiId,
  "seoul-gangnam": "10000000-0000-4000-8000-000000000003",
  "gyeonggi-suwon": "10000000-0000-4000-8000-000000000004",
  "gyeonggi-suwon-paldal": "10000000-0000-4000-8000-000000000005",
  "gyeonggi-gapyeong": "10000000-0000-4000-8000-000000000006",
};

function stableRegionId(slug: string) {
  const preservedId = preservedRegionIds[slug];

  if (preservedId) {
    return preservedId;
  }

  const namespaceBytes = Buffer.from(regionNamespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(slug).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function region(
  slug: string,
  name: string,
  type: RegionType,
  parentId: string | null,
  displayOrder: number,
): RegionSeedEntry {
  return {
    id: stableRegionId(slug),
    slug,
    name,
    type,
    parentId,
    displayOrder,
  };
}

const seoulDistricts = [
  ["jongno", "종로구"],
  ["jung", "중구"],
  ["yongsan", "용산구"],
  ["seongdong", "성동구"],
  ["gwangjin", "광진구"],
  ["dongdaemun", "동대문구"],
  ["jungnang", "중랑구"],
  ["seongbuk", "성북구"],
  ["gangbuk", "강북구"],
  ["dobong", "도봉구"],
  ["nowon", "노원구"],
  ["eunpyeong", "은평구"],
  ["seodaemun", "서대문구"],
  ["mapo", "마포구"],
  ["yangcheon", "양천구"],
  ["gangseo", "강서구"],
  ["guro", "구로구"],
  ["geumcheon", "금천구"],
  ["yeongdeungpo", "영등포구"],
  ["dongjak", "동작구"],
  ["gwanak", "관악구"],
  ["seocho", "서초구"],
  ["gangnam", "강남구"],
  ["songpa", "송파구"],
  ["gangdong", "강동구"],
] as const;

const gyeonggiMunicipalities = [
  { slug: "gapyeong", name: "가평군", type: "county", districts: [] },
  {
    slug: "goyang",
    name: "고양시",
    type: "city",
    districts: [
      ["deogyang", "덕양구"],
      ["ilsandong", "일산동구"],
      ["ilsanseo", "일산서구"],
    ],
  },
  { slug: "gwacheon", name: "과천시", type: "city", districts: [] },
  { slug: "gwangmyeong", name: "광명시", type: "city", districts: [] },
  { slug: "gwangju", name: "광주시", type: "city", districts: [] },
  { slug: "guri", name: "구리시", type: "city", districts: [] },
  { slug: "gunpo", name: "군포시", type: "city", districts: [] },
  { slug: "gimpo", name: "김포시", type: "city", districts: [] },
  { slug: "namyangju", name: "남양주시", type: "city", districts: [] },
  { slug: "dongducheon", name: "동두천시", type: "city", districts: [] },
  {
    slug: "bucheon",
    name: "부천시",
    type: "city",
    districts: [
      ["wonmi", "원미구"],
      ["sosa", "소사구"],
      ["ojeong", "오정구"],
    ],
  },
  {
    slug: "seongnam",
    name: "성남시",
    type: "city",
    districts: [
      ["sujeong", "수정구"],
      ["jungwon", "중원구"],
      ["bundang", "분당구"],
    ],
  },
  {
    slug: "suwon",
    name: "수원시",
    type: "city",
    districts: [
      ["jangan", "장안구"],
      ["gwonseon", "권선구"],
      ["paldal", "팔달구"],
      ["yeongtong", "영통구"],
    ],
  },
  { slug: "siheung", name: "시흥시", type: "city", districts: [] },
  {
    slug: "ansan",
    name: "안산시",
    type: "city",
    districts: [
      ["sangnok", "상록구"],
      ["danwon", "단원구"],
    ],
  },
  { slug: "anseong", name: "안성시", type: "city", districts: [] },
  {
    slug: "anyang",
    name: "안양시",
    type: "city",
    districts: [
      ["manan", "만안구"],
      ["dongan", "동안구"],
    ],
  },
  { slug: "yangju", name: "양주시", type: "city", districts: [] },
  { slug: "yangpyeong", name: "양평군", type: "county", districts: [] },
  { slug: "yeoju", name: "여주시", type: "city", districts: [] },
  { slug: "yeoncheon", name: "연천군", type: "county", districts: [] },
  { slug: "osan", name: "오산시", type: "city", districts: [] },
  {
    slug: "yongin",
    name: "용인시",
    type: "city",
    districts: [
      ["cheoin", "처인구"],
      ["giheung", "기흥구"],
      ["suji", "수지구"],
    ],
  },
  { slug: "uiwang", name: "의왕시", type: "city", districts: [] },
  { slug: "uijeongbu", name: "의정부시", type: "city", districts: [] },
  { slug: "icheon", name: "이천시", type: "city", districts: [] },
  { slug: "paju", name: "파주시", type: "city", districts: [] },
  { slug: "pyeongtaek", name: "평택시", type: "city", districts: [] },
  { slug: "pocheon", name: "포천시", type: "city", districts: [] },
  { slug: "hanam", name: "하남시", type: "city", districts: [] },
  {
    slug: "hwaseong",
    name: "화성시",
    type: "city",
    districts: [
      ["manse", "만세구"],
      ["hyohaeng", "효행구"],
      ["byeongjeom", "병점구"],
      ["dongtan", "동탄구"],
    ],
  },
] as const satisfies ReadonlyArray<{
  slug: string;
  name: string;
  type: "city" | "county";
  districts: ReadonlyArray<readonly [string, string]>;
}>;

const seoulRegionSeed = seoulDistricts.map(([slug, name], index) =>
  region(`seoul-${slug}`, name, "district", seoulId, (index + 1) * 10),
);

const gyeonggiMunicipalitySeed = gyeonggiMunicipalities.map(
  (municipality, index) =>
    region(
      `gyeonggi-${municipality.slug}`,
      municipality.name,
      municipality.type,
      gyeonggiId,
      (index + 1) * 10,
    ),
);

const gyeonggiDistrictSeed = gyeonggiMunicipalities.flatMap((municipality) => {
  const municipalitySlug = `gyeonggi-${municipality.slug}`;
  const municipalityId = stableRegionId(municipalitySlug);

  return municipality.districts.map(([slug, name], index) =>
    region(
      `${municipalitySlug}-${slug}`,
      name,
      "district",
      municipalityId,
      (index + 1) * 10,
    ),
  );
});

export const regionSeed: ReadonlyArray<RegionSeedEntry> = [
  region("seoul", "서울특별시", "province", null, 10),
  region("gyeonggi", "경기도", "province", null, 20),
  ...seoulRegionSeed,
  ...gyeonggiMunicipalitySeed,
  ...gyeonggiDistrictSeed,
];

export const serviceCategorySeed = [
  {
    slug: "infidelity",
    name: "외도·배우자 문제",
    description: "배우자 외도 관련 사실 확인 등",
    displayOrder: 10,
  },
  {
    slug: "family",
    name: "가족 문제",
    description: "외도 분류를 제외한 가족 관계의 사실 확인 등",
    displayOrder: 20,
  },
  {
    slug: "people-search",
    name: "사람 찾기",
    description: "적법한 범위의 소재 확인과 사람 찾기",
    displayOrder: 30,
  },
  {
    slug: "evidence-fact-checking",
    name: "증거·사실 확인",
    description: "개인 분쟁과 관련된 적법한 사실 확인 및 자료 조사",
    displayOrder: 40,
  },
  {
    slug: "personal-safety",
    name: "개인 피해 대응",
    description: "스토킹·괴롭힘 등 개인 피해 상황의 적법한 사실 확인 지원",
    displayOrder: 50,
  },
] as const;
