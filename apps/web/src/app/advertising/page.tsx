import type { Metadata } from "next";

import {
  InformationList,
  InformationSection,
  PublicInformationPage,
} from "@/components/public-information-page";

export const metadata: Metadata = {
  title: "광고 표시 정책",
  description:
    "탐정사무소 정보 플랫폼의 광고·강화 상품 표시와 일반 검색 결과 분리 원칙을 안내합니다.",
  alternates: { canonical: "/advertising" },
};

export default function AdvertisingPage() {
  return (
    <PublicInformationPage
      eyebrow="ADVERTISING"
      title="광고 표시 정책"
      description="유료 노출을 일반 업체 정보와 명확히 구분하고, 광고 구매가 추천이나 품질 보증으로 오인되지 않도록 하는 기준입니다."
      updatedAt="2026-08-05"
      notice={<p>현재 개발 단계에서는 광고·강화 상품을 노출하지 않습니다.</p>}
    >
      <InformationSection title="1. 명확한 광고 표시">
        <p>
          광고 또는 강화 상품을 운영하게 되면 노출 영역 가까이에
          <strong className="mx-1 font-bold text-slate-950">광고</strong>
          또는 같은 의미의 명확한 표시를 제공합니다. 색상이나 위치만으로 광고
          여부를 구분하도록 만들지 않습니다.
        </p>
      </InformationSection>

      <InformationSection title="2. 일반 결과와 분리">
        <InformationList>
          <li>일반 업체 목록의 기본 정렬을 광고 구매 여부로 바꾸지 않습니다.</li>
          <li>광고 영역과 일반 검색 결과를 시각적·구조적으로 구분합니다.</li>
          <li>광고를 추천, 인기, 최고, 품질 순위로 표현하지 않습니다.</li>
        </InformationList>
      </InformationSection>

      <InformationSection title="3. 동일한 정보 검수 기준">
        <p>
          광고 업체도 일반 업체와 같은 공개 정보 검수 기준을 통과해야 합니다.
          광고 계약은 상호, 주소, 대표 전화, 업무 분야나 영업 상태가 정확하다는
          근거가 되지 않습니다.
        </p>
      </InformationSection>

      <InformationSection title="4. 성과 지표와 계약 종료">
        <p>
          향후 광고 노출·클릭을 측정할 경우 일반 상세 조회·전화 클릭과 분리된
          지표로 관리합니다. 클릭은 통화 성립이나 계약을 의미하지 않습니다.
          광고 기간이 끝나도 기본 업체 정보는 공개·검수 정책에 따라 별도로
          유지하거나 변경합니다.
        </p>
      </InformationSection>
    </PublicInformationPage>
  );
}
