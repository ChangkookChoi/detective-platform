# 웹 애플리케이션

탐정사무소 정보 플랫폼의 공개 웹, 관리자 화면, 초기 API를 제공하는 Next.js App Router 애플리케이션입니다.

현재는 공개 홈, 업체 목록·상세와 지역/업무 분야 필터, PostgreSQL 데이터 계층, Clerk 관리자 인증 경계, 검수 흐름과 상세 조회·전화 클릭의 개인정보 최소화 일별 집계가 구현된 상태입니다. 운영 Clerk 키와 관리형 데이터베이스 연결은 아직 준비되지 않았습니다. 운영 DB의 TLS·풀링·역할 분리 계약은 [`../../docs/operations/PRODUCTION_DATABASE.md`](../../docs/operations/PRODUCTION_DATABASE.md)를 따릅니다. 프로젝트 전체 진행 상황은 [`../../docs/STATUS.md`](../../docs/STATUS.md)를 기준으로 확인합니다.

## 개발 환경

- Next.js 16
- React 19
- TypeScript strict mode
- Tailwind CSS 4
- Clerk 7 관리자 인증

## 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm run lint
npm run build
npm run test:e2e
npm run db:check
npm run db:validate-seed
```

### 브라우저 E2E

`npm run test:e2e`는 production build를 만든 뒤 `localhost:3100`에 Next.js
서버를 시작하고, 설치된 Google Chrome으로 데스크톱과 모바일 에뮬레이션을
각각 실행합니다. 현재 묶음은 DB를 변경하거나 요구하지 않으며 다음 경계를
확인합니다.

- 홈의 핵심 안내, 업체 찾기 진입점과 푸터 정책 링크
- 이용 안내·개인정보 처리방침·광고 표시 정책의 고유 canonical과 핵심 내용
- 데스크톱·모바일의 가로 넘침과 브라우저 console/page 오류
- `robots.txt`의 공개 허용 및 관리자·API·로그인 경로 제외
- 로그아웃 관리자 접근의 307 로그인 리디렉션과 원래 경로 보존

다른 로컬 서버나 배포 환경을 검사할 때는 `PLAYWRIGHT_BASE_URL`에 대상
origin을 지정하고 `npx playwright test`를 직접 실행합니다. 실패 화면, trace와
HTML 보고서는 Git 제외된 `test-results`, `playwright-report`에 생성됩니다.

업체 목록·상세·전화 클릭·정정 요청과 로그인한 관리자 쓰기는 PostgreSQL
표본과 별도 인증 상태가 필요한 다음 E2E 단계입니다.

실제 PostgreSQL migration·seed·제약 통합 검증은 저장소 루트에서 실행합니다.

```bash
./scripts/verify-local-postgres.sh
```

## 데이터베이스

[`./.env.example`](.env.example)을 참고해 로컬 `.env.local`에 `DATABASE_URL`을 설정합니다. 실제 자격 증명은 Git에 커밋하지 않습니다. 운영에서는 pooled 최소 권한 `DATABASE_URL`과 신뢰된 배포 환경에만 두는 direct `DATABASE_MIGRATION_URL`을 분리하고, 인스턴스별 풀 상한을 `DATABASE_POOL_MAX`로 설정합니다.

관리자 기능에는 같은 파일의 Clerk 키와 역할별 사용자 ID allowlist도 필요합니다. 실제 값을 설정하기 전에 [`../../docs/operations/ADMIN_AUTH.md`](../../docs/operations/ADMIN_AUTH.md)의 역할과 운영 절차를 확인합니다.

공개 분석 이벤트에는 추가 환경변수가 필요하지 않습니다. 탭 세션 UUID는 서버에서 해시하고 단기 중복 방지 행과 일별 합계만 저장합니다. 이벤트 의미와 보존 기준은 [`../../docs/operations/ANALYTICS.md`](../../docs/operations/ANALYTICS.md)를 따릅니다.

```bash
npm run db:migrate
npm run db:seed
npm run db:validate-production-config:self-test
```

스키마를 변경한 경우 `npm run db:generate`로 SQL migration을 생성하고 내용을 검토한 뒤 커밋합니다. 운영 데이터베이스에는 `drizzle-kit push`를 사용하지 않습니다.

구현 전 루트 [`AGENTS.md`](../../AGENTS.md)와 이 디렉터리의 [`AGENTS.md`](AGENTS.md)를 확인합니다. 공개 핵심 콘텐츠는 React Server Component를 기본으로 구현하고, 브라우저 상호작용이 필요한 부분만 작은 Client Component로 분리합니다.
