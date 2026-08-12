# AGENTS.md

## 1. 프로젝트 개요

이 저장소는 탐정사무소 정보 제공 서비스에서 시작해 장기적으로 상담·견적·업체 참여 기능을 갖춘 플랫폼으로 확장하기 위한 프로젝트다.

초기 범위:

- 서울·경기 탐정사무소 약 100곳
- 외도·가족 문제 등 개인 고객 중심
- 지역 및 업무 분야별 업체 탐색
- 업체 상세 정보 제공
- 무료 전화 연결
- 정보 출처와 최종 확인일 표시
- 업체별 조회 및 버튼 클릭 데이터 수집
- 자동 수집 결과는 관리자 검수 후 반영

초기 제외 범위:

- 사용자 회원가입
- 사건 내용 접수
- 채팅
- 결제
- 후기와 별점
- 업체 순위
- 전화 연결 과금
- 통화 내용 및 녹취 저장

## 2. 저장소 구조

- `apps/web`: Next.js App Router 웹 애플리케이션
- `services/collector`: Python 기반 업체 정보 수집 및 변경 감지
- `docs/product`: 제품 요구사항과 사용자 흐름
- `docs/architecture`: 시스템 및 데이터 설계
- `docs/operations`: 수집·검증·SEO·보안 정책
- `docs/decisions`: Architecture Decision Record
- `infra`: 로컬 및 운영 인프라 설정
- `scripts`: 개발 및 운영 보조 스크립트

## 3. 작업 시작 전 필수 절차

코드나 문서를 수정하기 전에 반드시 다음 순서로 확인한다.

1. 루트 `README.md`
2. `docs/STATUS.md`
3. 작업과 관련된 `docs/product` 문서
4. 작업과 관련된 `docs/architecture` 문서
5. 관련 ADR
6. 현재 Git 상태와 변경 파일

수정하기 전에 다음을 간단히 정리한다.

- 현재 프로젝트 단계
- 이번 작업 범위
- 수정할 파일
- 검증할 명령
- 범위 밖으로 남겨둘 항목

## 4. 아키텍처 원칙

- 초기 시스템은 모듈형 모놀리스로 유지한다.
- 웹, 관리자 화면, 초기 API는 Next.js App Router에서 구현한다.
- 기본 데이터베이스는 PostgreSQL을 사용한다.
- 업체 정보 수집과 변경 감지는 Python으로 구현한다.
- Spring Boot 도입 전 ADR을 작성한다.
- 마이크로서비스 전환 전 ADR을 작성한다.
- 초기에는 Elasticsearch 또는 OpenSearch를 도입하지 않는다.
- 자동 수집 결과를 관리자 승인 없이 공개하지 않는다.
- 외부 서비스 의존성은 실제 필요성이 확인된 뒤 추가한다.

## 5. 데이터 및 개인정보 원칙

- 사건 내용과 조사 대상자 정보를 수집하지 않는다.
- 통화 내용과 녹취를 저장하지 않는다.
- 공개된 정보라고 해서 무조건 자유롭게 저장하거나 게시하지 않는다.
- 업체 정보에는 가능한 경우 출처 URL과 확인 시각을 저장한다.
- 실제 개인정보나 운영 비밀을 테스트 데이터로 사용하지 않는다.
- 비밀키와 토큰은 Git에 커밋하지 않는다.
- 환경변수 예시는 `.env.example`에 작성한다.
- 로그에 개인정보와 환경변수 값을 출력하지 않는다.

## 6. 웹 개발 원칙

- TypeScript strict mode를 유지한다.
- React Server Component를 기본으로 사용한다.
- 클릭, 상태, 브라우저 API가 필요한 영역만 Client Component로 만든다.
- Client Component의 범위를 작게 유지한다.
- 공개 핵심 콘텐츠는 서버가 생성한 HTML에 포함한다.
- 사용자 입력과 외부 데이터는 검증한다.
- Route Handler는 얇게 유지하고 비즈니스 로직을 모듈로 분리한다.
- 데이터베이스 스키마 변경은 migration으로 관리한다.
- `npm audit fix --force`는 명시적 승인 없이 실행하지 않는다.

## 7. Python 수집기 원칙

- Python 3.13과 `uv`를 사용한다.
- 모든 주요 함수에 타입 힌트를 작성한다.
- 외부 페이지 요청에는 timeout과 재시도 제한을 둔다.
- 사이트별 접근 정책과 요청 빈도를 준수한다.
- 원문 전체 복제보다 필요한 필드 추출과 변경 감지에 집중한다.
- 추출값과 운영값을 분리한다.
- 수집 실패가 기존 운영 데이터를 삭제하게 만들지 않는다.
- 전화번호, 주소, 상호, 폐업 후보는 관리자 검수 대상으로 둔다.

## 8. Git 원칙

- `main`은 항상 실행 가능한 상태로 유지한다.
- 기능 작업은 Issue 기반 브랜치에서 진행한다.
- 브랜치 예시:
  - `feat/12-office-domain`
  - `fix/24-phone-normalization`
  - `docs/8-update-prd`
- Conventional Commit 형식을 사용한다.
  - `feat`
  - `fix`
  - `docs`
  - `refactor`
  - `test`
  - `chore`
- 명시적 요청 없이 commit, push, merge, force-push를 하지 않는다.
- 공개된 Git 이력을 임의로 재작성하지 않는다.

## 9. 검증 원칙

웹 코드 변경 후 가능한 범위에서 실행한다.

```bash
cd apps/web
npm run lint
npm run build

echo "Project documents were written successfully."
```

Python 코드 변경 후 가능한 범위에서 실행한다.

```bash
cd services/collector
uv run python -m compileall .
```

문서만 변경한 경우 링크, 빈 파일, 후행 공백과 `git diff --check`를 확인한다. 검증하지 못한 항목은 완료한 것처럼 표현하지 않는다.

## 10. 문서 관리 원칙

- `docs/STATUS.md`를 현재 구현 상태의 기준으로 유지한다.
- 요구사항 변경은 PRD와 MVP 범위, 사용자 흐름에 함께 반영한다.
- 아키텍처의 중요한 선택이나 변경은 ADR로 남긴다.
- 정책 문서는 실제 운영 동작과 일치시킨다.
- 날짜와 상태는 확인한 사실만 기록한다.
- 상대 링크를 사용하고 문서 간 용어를 일관되게 유지한다.

### 문서 우선순위

현재 구현 기준은 다음 순서로 판단한다.

1. `docs/STATUS.md`
2. `docs/product/MVP_SCOPE.md`
3. `docs/product/PRD.md`
4. 작업과 관련된 ADR

`docs/archive/PRODUCT_PLAN_V1_2026-07-21.md`를 포함한 `docs/archive` 아래 문서는 초기 기획안 원본을 보존하기 위한 참고 자료이며 현재 구현 기준으로 사용하지 않는다.

archive 문서와 현재 기준 문서가 충돌하면 archive 내용을 그대로 구현하거나 현재 문서를 덮어쓰지 않는다. 필요한 내용이 있다고 판단되면 현재 상태와 MVP 범위, PRD, 관련 ADR에 맞게 반영하고 다음을 작업 결과에 보고한다.

- 충돌한 내용
- 우선 적용한 현재 기준 문서와 결정
- 현재 문서에 반영한 내용 또는 반영하지 않은 이유
- 추가 ADR이나 사용자 결정이 필요한 항목
