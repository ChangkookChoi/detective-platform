export const regionSeed = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "seoul",
    name: "서울특별시",
    type: "province" as const,
    parentId: null,
    displayOrder: 10,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "gyeonggi",
    name: "경기도",
    type: "province" as const,
    parentId: null,
    displayOrder: 20,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "seoul-gangnam",
    name: "강남구",
    type: "district" as const,
    parentId: "10000000-0000-4000-8000-000000000001",
    displayOrder: 10,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "gyeonggi-suwon",
    name: "수원시",
    type: "city" as const,
    parentId: "10000000-0000-4000-8000-000000000002",
    displayOrder: 10,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    slug: "gyeonggi-suwon-paldal",
    name: "팔달구",
    type: "district" as const,
    parentId: "10000000-0000-4000-8000-000000000004",
    displayOrder: 10,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    slug: "gyeonggi-gapyeong",
    name: "가평군",
    type: "county" as const,
    parentId: "10000000-0000-4000-8000-000000000002",
    displayOrder: 20,
  },
] as const;

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
