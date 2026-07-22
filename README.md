# 탐정사무소 정보 플랫폼

서울·경기 지역의 탐정사무소 정보를 신뢰 가능한 출처와 함께 제공하고, 개인 고객이 지역과 업무 분야에 맞는 업체를 찾아 무료로 전화 연결할 수 있도록 돕는 서비스입니다. 초기에는 약 100개 업체를 다루는 정보 디렉터리로 시작하며, 검증된 수요를 바탕으로 상담·견적·업체 참여 기능을 갖춘 플랫폼으로 확장합니다.

> 이 서비스는 업체 정보를 비교·탐색하기 위한 정보 제공 서비스입니다. 특정 업체의 서비스 품질이나 조사 결과를 보증하지 않으며, 긴급 상황이나 범죄 피해는 경찰 등 관계 기관에 문의해야 합니다.

## 현재 단계

현재 저장소는 **핵심 MVP 기능 구현 단계**입니다. PostgreSQL 초기 스키마·migration·seed, 공개 업체 검색·상세, 관리자 검수, 개인정보 최소화 일별 분석 집계와 정책 기반 Python 수집기 기반을 구현했습니다. 실제 출처·업체 데이터, 지속형 개발·운영 DB와 운영 배포는 아직 준비 전입니다. 최신 진행 상황은 [docs/STATUS.md](docs/STATUS.md)를 기준으로 확인합니다.

## MVP

- 서울·경기 탐정사무소 약 100곳
- 지역 및 업무 분야별 탐색
- 업체 기본 정보, 출처 URL, 최종 확인일 제공
- 전화번호 노출 및 무료 전화 연결 버튼
- 업체별 상세 조회와 전화 버튼 클릭 집계
- Python 수집기의 후보 정보 수집 및 변경 감지
- 관리자의 검수·승인을 거친 정보만 공개
- 광고 및 업체용 강화 상품을 초기 수익 모델로 검증

MVP에는 사용자 회원가입, 사건 접수, 채팅, 결제, 후기, 별점, 업체 순위, 전화 연결 과금, 통화 내용·녹취 저장이 포함되지 않습니다. 상세 범위는 [MVP_SCOPE.md](docs/product/MVP_SCOPE.md)를 참고합니다.

## 저장소 구조

```text
.
├── apps/web/              # Next.js App Router 공개 웹·관리자·초기 API
├── services/collector/    # Python 3.13 + uv 기반 수집·변경 감지
├── docs/
│   ├── product/           # PRD, MVP 범위, 사용자 흐름
│   ├── architecture/      # 시스템, 데이터, API 설계
│   ├── operations/        # 수집, 검증, SEO, 보안 정책
│   └── decisions/         # Architecture Decision Record
├── infra/                 # 로컬·운영 인프라 설정(도입 시)
└── scripts/               # 개발·운영 보조 스크립트
```

## 기술 방향

- 웹·관리자·초기 API: Next.js App Router 모듈형 모놀리스
- 데이터베이스: PostgreSQL
- 수집기: Python 3.13, `uv`
- 렌더링: 공개 핵심 콘텐츠는 서버 생성 HTML에 포함
- 검색: 초기에는 PostgreSQL의 필터·인덱스로 해결
- 공개 원칙: 자동 수집 결과는 관리자 승인 전까지 비공개

세부 내용은 [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md)와 [ADR](docs/decisions/)에서 관리합니다.

## 로컬 실행

### 웹

```bash
cd apps/web
npm install
npm run dev
```

검증:

```bash
cd apps/web
npm run lint
npm run build
```

PostgreSQL 17 이상이 설치된 환경에서는 저장소 루트에서 임시 DB 통합 검증을 실행할 수 있습니다.

```bash
./scripts/verify-local-postgres.sh
```

### 수집기

```bash
cd services/collector
uv sync
uv run python main.py validate-config --config sources.example.toml
```

실제 출처 등록과 실행은 [수집기 운영 절차](docs/operations/COLLECTOR_RUNBOOK.md)를 따릅니다. 비밀값은 커밋하지 않고 필요한 키는 `.env.example`에 이름과 설명만 추가합니다.

## 문서 안내

- 제품: [PRD](docs/product/PRD.md), [MVP 범위](docs/product/MVP_SCOPE.md), [사용자 흐름](docs/product/USER_FLOWS.md)
- 설계: [아키텍처](docs/architecture/ARCHITECTURE.md), [데이터 모델](docs/architecture/DATA_MODEL.md), [API 규칙](docs/architecture/API_CONVENTIONS.md)
- 운영: [수집 정책](docs/operations/DATA_COLLECTION_POLICY.md), [수집기 절차](docs/operations/COLLECTOR_RUNBOOK.md), [검증 정책](docs/operations/DATA_VERIFICATION_POLICY.md), [관리자 인증](docs/operations/ADMIN_AUTH.md), [최소 분석](docs/operations/ANALYTICS.md), [지역 seed](docs/operations/REGION_SEED.md), [로컬 PostgreSQL](docs/operations/LOCAL_DATABASE.md), [SEO](docs/operations/SEO_POLICY.md), [보안](docs/operations/SECURITY.md)
- 결정: [ADR-0001](docs/decisions/ADR-0001-monorepo.md), [ADR-0002](docs/decisions/ADR-0002-nextjs-monolith.md), [ADR-0003](docs/decisions/ADR-0003-postgresql.md), [ADR-0004](docs/decisions/ADR-0004-drizzle-orm.md), [ADR-0005](docs/decisions/ADR-0005-clerk-admin-auth.md), [ADR-0006](docs/decisions/ADR-0006-privacy-minimal-analytics.md), [ADR-0007](docs/decisions/ADR-0007-python-collector-foundation.md)

## 작업 원칙

작업 전 루트 [AGENTS.md](AGENTS.md)를 읽고 문서에 정의된 범위와 결정 사항을 따릅니다. 구조나 핵심 기술 선택을 바꿀 때는 구현보다 ADR을 먼저 작성합니다.
