import type { Metadata } from "next";
import Link from "next/link";

import {
  InformationList,
  InformationSection,
  PublicInformationPage,
} from "@/components/public-information-page";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description:
    "탐정사무소 정보 플랫폼 개발 단계의 개인정보 최소화 원칙과 현재 처리 항목을 안내합니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicInformationPage
      eyebrow="PRIVACY"
      title="개인정보 처리방침"
      description="서비스는 업체 정보 탐색에 필요하지 않은 개인정보를 받지 않고, 이용 현황도 개인을 식별하지 않는 범위에서 최소한으로 집계합니다."
      updatedAt="2026-08-05"
      notice={
        <p>
          현재 개발 환경을 기준으로 작성한 공개 전 안내입니다. 운영 주체,
          개인정보 보호 문의 채널, 최종 보유 기간과 위탁·국외 이전 여부는 운영
          인프라 및 법무 검토 후 확정하여 공개 출시 전에 갱신합니다.
        </p>
      }
    >
      <InformationSection title="1. 공개 사용자에게 받지 않는 정보">
        <InformationList>
          <li>일반 사용자의 회원가입, 로그인 정보와 사용자 프로필</li>
          <li>사건 내용, 조사 대상자 정보와 상담 내용</li>
          <li>통화 성립 여부, 통화 내용과 녹취</li>
          <li>정정 요청자의 이름, 전화번호, 이메일과 자유 형식 사유</li>
        </InformationList>
        <p>
          긴급 상황이나 범죄 피해 신고를 이 서비스에 입력하지 말고 경찰 등 관계
          기관에 직접 문의해 주세요.
        </p>
      </InformationSection>

      <InformationSection title="2. 최소 이용 현황 집계">
        <p>
          공개된 업체의 상세 페이지 조회와 전화 버튼 클릭을 업체별·한국 날짜별
          합계로 집계합니다. 이는 탐색 기능을 개선하기 위한 내부 운영 지표이며
          통화 성립, 계약, 업체 품질 또는 추천 순위를 의미하지 않습니다.
        </p>
        <InformationList>
          <li>
            브라우저 탭의 세션 저장소에 임의 UUID를 두며, 서버에는 원문 대신
            SHA-256 해시가 포함된 중복 방지 키만 저장합니다.
          </li>
          <li>
            중복 방지 행은 48시간 뒤 삭제하며, 장기 데이터에는 업체·날짜별
            조회수와 전화 클릭 수만 남깁니다.
          </li>
          <li>
            원시 IP, User-Agent, Referrer, 전화번호, 검색어와 장기 브라우저
            식별자는 저장하지 않습니다.
          </li>
        </InformationList>
      </InformationSection>

      <InformationSection title="3. 업체 정보 정정 요청">
        <p>
          공개 업체 페이지의 정정 요청에서는 요청자 관계, 정정할 공개 필드 한
          개와 선택적인 공개 근거 URL만 받습니다. 요청 내용은 즉시 공개되지 않고
          관리자가 별도 공개 출처를 확인한 뒤 처리합니다.
        </p>
        <p>
          사건·상담·조사 대상자나 개인 연락처를 포함하지 않았다는 확인이
          필요합니다. 업체별 정정 경로는 각 업체 상세 페이지에서 제공합니다.
        </p>
      </InformationSection>

      <InformationSection title="4. 관리자 인증과 감사 기록">
        <p>
          공개 사용자는 계정이 필요하지 않습니다. 승인된 소수 운영자의 인증은
          Clerk를 사용하며, 검수와 공개 변경에는 Clerk 사용자 ID, 처리 대상,
          시각, 결정과 사유를 감사 정보로 기록합니다. 관리자 이메일이나 표시
          이름을 역할 판정 정보로 복제하지 않습니다.
        </p>
      </InformationSection>

      <InformationSection title="5. 공개 업체 정보와 정정">
        <p>
          업체명, 사업상 공개 대표 전화, 사무소 주소와 공식 출처 등 검수된 사업
          정보를 제공합니다. 공개 정보에 오류가 있다면 해당 업체의 정정 요청
          경로를 이용할 수 있습니다. 일반적인 서비스 이용 범위는
          <Link
            href="/guide"
            className="ml-1 font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4"
          >
            이용 안내
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </InformationSection>
    </PublicInformationPage>
  );
}
