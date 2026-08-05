import type { Metadata } from "next";
import Link from "next/link";

import {
  InformationList,
  InformationSection,
  PublicInformationPage,
} from "@/components/public-information-page";

export const metadata: Metadata = {
  title: "이용 안내",
  description:
    "탐정사무소 정보 플랫폼의 정보 확인 기준, 전화 연결, 면책과 정정 요청 방법을 안내합니다.",
  alternates: { canonical: "/guide" },
};

export default function GuidePage() {
  return (
    <PublicInformationPage
      eyebrow="SERVICE GUIDE"
      title="이용 안내"
      description="이 서비스는 서울·경기 탐정사무소의 공개 정보를 출처와 함께 비교할 수 있도록 돕는 정보 디렉터리입니다."
      updatedAt="2026-08-05"
    >
      <InformationSection title="1. 업체 정보 찾기">
        <InformationList>
          <li>검수된 실제 사무소 소재 지역과 업무 분야로 업체를 찾습니다.</li>
          <li>업체 상세에서 주소, 대표 전화, 업무 분야와 공개 출처를 확인합니다.</li>
          <li>최종 확인일을 보고 정보가 최근에도 유효한지 판단합니다.</li>
        </InformationList>
        <Link
          href="/offices"
          className="inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
        >
          업체 찾아보기
        </Link>
      </InformationSection>

      <InformationSection title="2. 전화 연결">
        <p>
          전화 버튼은 검수된 대표 번호 하나를 기기의 전화 기능으로 전달합니다.
          플랫폼은 연결 수수료를 부과하지 않지만 사용 중인 통신사의 통화 요금은
          발생할 수 있습니다.
        </p>
        <p>
          서비스는 통화 연결 성공 여부, 통화 내용이나 녹취를 수집하지 않습니다.
          전화 버튼 클릭은 개인정보 없는 일별 합계로만 집계합니다.
        </p>
      </InformationSection>

      <InformationSection title="3. 정보의 의미와 한계">
        <InformationList>
          <li>업체 노출은 적법성, 품질, 성과 또는 특정 조사 결과를 보증하지 않습니다.</li>
          <li>목록 순서는 추천, 별점이나 품질 순위가 아닙니다.</li>
          <li>출처가 공개한 홍보 문구를 검증된 사실처럼 그대로 게시하지 않습니다.</li>
          <li>정보는 변경될 수 있으므로 계약 전 업체와 최신 내용을 직접 확인해야 합니다.</li>
        </InformationList>
      </InformationSection>

      <InformationSection title="4. 정정 요청과 민감정보">
        <p>
          공개 정보가 잘못되었다면 업체 상세 페이지의 정보 수정 요청을 이용해
          주세요. 접수 내용은 검수 후보로만 저장되며 별도 확인 없이 공개 정보에
          반영되지 않습니다.
        </p>
        <p>
          서비스에는 사건 내용, 조사 대상자의 이름·연락처·위치, 상담 기록 또는
          다른 민감정보를 입력하지 마세요. 자세한 처리 원칙은
          <Link
            href="/privacy"
            className="ml-1 font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
          >
            개인정보 처리방침
          </Link>
          을 확인해 주세요.
        </p>
      </InformationSection>

      <InformationSection title="5. 긴급 상황과 법률 판단">
        <p>
          범죄 피해, 실종, 신변 위협 등 긴급한 상황에서는 이 서비스를 통한 업체
          탐색보다 경찰·소방 등 관계 기관에 먼저 연락해야 합니다. 서비스의 업체
          정보는 개별 사안에 대한 법률 자문을 대신하지 않습니다.
        </p>
      </InformationSection>
    </PublicInformationPage>
  );
}
