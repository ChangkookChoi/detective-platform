# 웹 애플리케이션

탐정사무소 정보 플랫폼의 공개 웹, 관리자 화면, 초기 API를 제공하는 Next.js App Router 애플리케이션입니다.

현재는 공개 화면 골격과 PostgreSQL 스키마·migration·기준 데이터 seed가 구현된 상태입니다. 업체 목록·상세, 관리자 검수와 실제 데이터베이스 연결은 아직 구현되지 않았습니다. 프로젝트 전체 진행 상황은 [`../../docs/STATUS.md`](../../docs/STATUS.md)를 기준으로 확인합니다.

## 개발 환경

- Next.js 16
- React 19
- TypeScript strict mode
- Tailwind CSS 4

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

## 데이터베이스

[`./.env.example`](.env.example)을 참고해 로컬 `.env.local`에 `DATABASE_URL`을 설정합니다. 실제 자격 증명은 Git에 커밋하지 않습니다.

```bash
npm run db:migrate
npm run db:seed
```

스키마를 변경한 경우 `npm run db:generate`로 SQL migration을 생성하고 내용을 검토한 뒤 커밋합니다. 운영 데이터베이스에는 `drizzle-kit push`를 사용하지 않습니다.

구현 전 루트 [`AGENTS.md`](../../AGENTS.md)와 이 디렉터리의 [`AGENTS.md`](AGENTS.md)를 확인합니다. 공개 핵심 콘텐츠는 React Server Component를 기본으로 구현하고, 브라우저 상호작용이 필요한 부분만 작은 Client Component로 분리합니다.
