# Production 출시 절차

## 1. 목적과 현재 차단 상태

도메인, Clerk Production, Vercel 환경설정과 실제 배포 검증을 한 순서로 묶어
부분 설정 상태가 공개 출시로 오인되지 않게 한다. 데이터베이스 준비와 백업은
[운영 PostgreSQL 준비](PRODUCTION_DATABASE.md)와
[데이터베이스 백업·복구 정책](DATABASE_BACKUP.md)을 함께 따른다.

2026-08-13 현재 `main`의 최신 Vercel Production 배포는 `Ready`이고 Vercel
인증 우회 점검에서 공개 홈 HTTP 200, 관리자와 로그인 경로 HTTP 503을
반환했다. 즉 공개 데이터 경로는 동작하지만 Clerk가 없는 관리 경로는
fail-closed 상태다. 연결된 custom domain은 0개이며 Production 환경에는 다음
항목이 아직 없다.

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_ADMIN_USER_IDS`
- 선택적인 `CLERK_REVIEWER_USER_IDS`

Vercel 기본 도메인은 Clerk Production 도메인으로 사용할 수 없다. 소유권과
DNS 변경 권한이 있는 custom domain, Clerk Production의 live 키와 별도로 만든
Production 사용자 ID가 모두 준비되기 전에는 공개 출시로 전환하지 않는다.

## 2. 출시 게이트

아래 조건을 모두 통과해야 한다.

1. 소유한 custom domain과 DNS 변경 권한을 확인한다.
2. Vercel 프로젝트에 apex 또는 `www` 도메인을 연결하고 TLS 발급을 확인한다.
3. Clerk Production 인스턴스에 같은 도메인을 등록하고 Google 로그인과
   Restricted 가입 정책을 확인한다.
4. Production 인스턴스에서 관리자 계정을 새로 만들고 `user_` ID를 확인한다.
   Development 사용자 ID를 재사용하지 않는다.
5. Vercel Production에 live 키, 관리자 ID와 실제 canonical origin을 저장한다.
6. 환경 사전검증과 최신 `main` quality check를 통과한다.
7. 새 Production 배포에서 공개·SEO·인증·관리자 핵심 흐름을 smoke 검증한다.
8. 개인정보 처리방침의 실제 운영 정보와 장애·보안 연락 담당을 확정한다.

도메인 등록, DNS 변경, Clerk Production 생성과 공개 alias 전환은 외부 상태를
바꾸므로 실제 값과 대상을 확인한 뒤 수행한다.

## 3. 설정 순서

Vercel 연결 정보가 있는 `apps/web`에서 실행한다. 비밀값을 명령 인자, shell
history, 로그나 Git 파일에 넣지 않는다.

```bash
cd apps/web
npx vercel domains add example.com detective-platform
npx vercel domains inspect example.com
```

등록기관에서 Vercel이 안내한 DNS를 설정하고 검증이 끝난 뒤 다음 Production
환경변수를 저장한다.

| 이름 | 값의 기준 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://example.com` 형식의 실제 canonical origin |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 같은 Production 인스턴스의 `pk_live_` 키 |
| `CLERK_SECRET_KEY` | 같은 Production 인스턴스의 `sk_live_` 키 |
| `CLERK_ADMIN_USER_IDS` | Production에서 새로 확인한 최소 한 명의 `user_` ID |
| `CLERK_REVIEWER_USER_IDS` | 별도 검수자가 있을 때만 쉼표로 구분한 `user_` ID |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/admin/reviews` |

환경변수 변경은 기존 배포에 소급 적용되지 않으므로 저장 후 새 Production
배포가 필요하다. 배포 전에 Vercel이 주입한 값을 파일로 내려받지 않고 process
환경에서 검증한다.

```bash
cd apps/web
npx vercel env run -e production -- npm run auth:validate-config -- --environment=production
npm run lint
npm run build
npx vercel --prod
```

인증 사전검증기는 Production에서 live 키 쌍, 최소 한 명의 관리자, 로그인
경로와 소유 custom domain을 요구한다. `*.vercel.app` canonical origin은
Clerk Production 준비 완료로 인정하지 않는다.

## 4. 배포 후 smoke 검증

먼저 배포 자체와 보호된 배포 경계를 확인한다.

```bash
cd apps/web
npx vercel inspect https://deployment.example.vercel.app
npx vercel curl / --deployment https://deployment.example.vercel.app
npx vercel curl /admin/reviews --deployment https://deployment.example.vercel.app
```

반복 가능한 사전검증은 저장소 스크립트로 실행한다. Clerk Production 설정
전에는 공개·SEO 경로의 200과 관리자·로그인 경로의 503, `Retry-After`와
`noindex` fail-closed 헤더를 함께 검사한다.

```bash
./scripts/verify-vercel-production-smoke.sh \
  --deployment=https://deployment.example.vercel.app \
  --auth-mode=unconfigured
```

Clerk live 키와 Production 관리자를 설정한 뒤에는 `--auth-mode=configured`로
실행해 로그아웃 관리자 경로의 로그인 이동과 로그인 페이지 200을 검사한다.
이 스크립트는 Vercel 배포 보호를 해제하지 않고 `vercel curl`의 임시 bypass를
사용하며 외부 상태나 운영 데이터를 변경하지 않는다.

그다음 실제 custom domain에서 다음을 확인한다.

- 홈·업체 목록·업체 상세 표본이 HTTP 200이고 공개 업체 30건을 조회할 수 있음
- canonical이 custom domain을 가리킴
- `robots.txt`와 `sitemap.xml`의 origin과 공개 URL이 일치함
- 공개 상세 JSON-LD의 상호·전화·주소가 화면과 일치함
- 로그아웃 사용자의 관리자 경로가 로그인으로 이동함
- Production 관리자 Google 로그인 후 `/admin/reviews` 접근 가능
- allowlist 밖 계정은 관리자 데이터와 변경 동작에 접근 불가
- 보안 헤더, 브라우저 console 오류와 Vercel Function 오류 로그 이상 없음

로그인과 관리자 쓰기 검증은 테스트 후보 또는 명시적으로 선택한 비공개 후보로
수행한다. 승인 없이 운영 업체를 생성하거나 공개 상태를 바꾸지 않는다.

## 5. 중단과 롤백

다음 중 하나라도 발생하면 custom domain 공개 전환을 중단한다.

- live 키 모드 또는 Clerk 도메인 검증 실패
- 관리자 allowlist가 비었거나 허용되지 않은 계정 접근 가능
- 공개 경로 5xx, DB 연결 실패 또는 공개 업체 snapshot 불일치
- canonical·robots·sitemap이 서로 다른 origin을 가리킴
- 개인정보 처리방침과 실제 운영자·처리자 정보 불일치

배포 회귀는 직전 정상 Production deployment로 롤백하되 DB migration이 포함된
경우 애플리케이션 롤백만 안전하다고 가정하지 않는다. 먼저 migration의
하위 호환성과 데이터 변경 여부를 확인한다. Clerk 또는 DB 비밀 노출이
의심되면 단순 롤백 대신 키·비밀번호 회전과 세션 해지를 함께 수행한다.
