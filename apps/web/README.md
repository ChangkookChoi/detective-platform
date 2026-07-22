# 웹 애플리케이션

탐정사무소 정보 플랫폼의 공개 웹, 관리자 화면, 초기 API를 제공하는 Next.js App Router 애플리케이션입니다.

현재는 공개 홈, 업체 목록·상세와 지역/업무 분야 필터, PostgreSQL 데이터 계층, Clerk 관리자 인증 경계와 검수 대기열·승인·보류·반려 흐름이 구현된 상태입니다. 운영 Clerk 키와 관리자 계정, 클릭 집계와 지속형 데이터베이스 연결은 아직 준비되지 않았습니다. 프로젝트 전체 진행 상황은 [`../../docs/STATUS.md`](../../docs/STATUS.md)를 기준으로 확인합니다.

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
npm run db:check
npm run db:validate-seed
```

실제 PostgreSQL migration·seed·제약 통합 검증은 저장소 루트에서 실행합니다.

```bash
./scripts/verify-local-postgres.sh
```

## 데이터베이스

[`./.env.example`](.env.example)을 참고해 로컬 `.env.local`에 `DATABASE_URL`을 설정합니다. 실제 자격 증명은 Git에 커밋하지 않습니다.

관리자 기능에는 같은 파일의 Clerk 키와 역할별 사용자 ID allowlist도 필요합니다. 실제 값을 설정하기 전에 [`../../docs/operations/ADMIN_AUTH.md`](../../docs/operations/ADMIN_AUTH.md)의 역할과 운영 절차를 확인합니다.

```bash
npm run db:migrate
npm run db:seed
```

스키마를 변경한 경우 `npm run db:generate`로 SQL migration을 생성하고 내용을 검토한 뒤 커밋합니다. 운영 데이터베이스에는 `drizzle-kit push`를 사용하지 않습니다.

구현 전 루트 [`AGENTS.md`](../../AGENTS.md)와 이 디렉터리의 [`AGENTS.md`](AGENTS.md)를 확인합니다. 공개 핵심 콘텐츠는 React Server Component를 기본으로 구현하고, 브라우저 상호작용이 필요한 부분만 작은 Client Component로 분리합니다.
