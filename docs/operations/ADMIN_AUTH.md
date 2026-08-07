# 관리자 인증 운영

## 1. 목적

Clerk로 관리자 신원과 세션을 확인하고, 서버 전용 allowlist로 검수자와 관리자 권한을 제한하는 초기 운영 절차를 정의한다. 인증 선택 근거는 [ADR-0005](../decisions/ADR-0005-clerk-admin-auth.md)를 따른다.

## 2. 역할

- `reviewer`: 검수 대기열 조회, 공식 출처 수동 후보 등록, 공개 승인,
  보류와 반려
- `admin`: `reviewer` 권한 포함. 향후 정책 예외, 광고와 대량 작업 권한을 추가할 수 있음

역할은 Clerk 사용자 ID로 판정한다. 이메일과 표시 이름은 역할 판정이나 감사 식별자로 사용하지 않는다.

## 3. 필요한 환경변수

| 이름 | 공개 범위 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | 브라우저 공개 가능 | Clerk 프런트엔드 초기화 |
| `CLERK_SECRET_KEY` | 서버 비밀 | 세션 검증과 Clerk 서버 연동 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | 브라우저 공개 가능 | 로그인 페이지 경로 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | 브라우저 공개 가능 | 로그인 후 기본 관리자 경로 |
| `CLERK_REVIEWER_USER_IDS` | 서버 전용 | 쉼표로 구분한 검수자 Clerk 사용자 ID |
| `CLERK_ADMIN_USER_IDS` | 서버 전용 | 쉼표로 구분한 관리자 Clerk 사용자 ID |

실제 값은 `.env.local` 또는 배포 환경의 비밀·환경설정에만 저장한다. `NEXT_PUBLIC_` 접두사가 없는 값을 브라우저 코드에 전달하거나 로그에 출력하지 않는다.

## 4. 초기 설정 절차

1. 개발·미리보기·운영 환경을 구분해 Clerk 애플리케이션과 키를 준비한다. 개발·미리보기에는 `pk_test_`·`sk_test_`, 운영에는 `pk_live_`·`sk_live_` 키를 같은 인스턴스에서 발급한다.
2. Clerk Dashboard의 Restrictions에서 sign-up mode를 `Restricted`로 설정한다. 공개 셀프 가입은 허용하지 않고 운영자가 초대하거나 직접 만든 계정만 사용한다.
3. Hobby 범위의 Google 소셜 로그인만 사용하고 Password, 이메일 코드·링크, Phone/SMS, Passkey와 Clerk MFA는 활성화하지 않는다.
4. 관리자 Google 계정에서 2단계 인증 또는 패스키를 활성화하고 복구 수단과 로그인 기기를 점검한다. 이 통제는 Google 계정 정책이며 Clerk나 애플리케이션이 수행 여부를 증명하지는 않는다.
5. Restricted 상태에서 관리자 Google 계정을 초대하고 로그인한다.
6. Clerk 사용자 ID를 역할별 allowlist에 추가한다. 같은 ID가 두 목록에 있으면 `admin`을 우선하지만 불필요한 중복 등록은 피한다.
7. 아래 사전검증을 통과한 뒤 개발 서버를 다시 시작한다.
8. `http://localhost:3000/sign-in` 로그인과 `/admin/reviews` 접근을 확인한다. Clerk Development에서는 `127.0.0.1` 대신 `localhost`를 사용한다.
9. 허용되지 않은 로그인 계정이 관리자 데이터에 접근하지 못하는지 확인한다.
10. 승인 전 파일럿 검수 상세에서 원문 URL·수집값·제안값을 비교한다.
11. 보류 또는 반려 같은 비공개 결정을 먼저 시험하고
    `review_actions.actor_id`에 Clerk 사용자 ID가 기록되는지 확인한다.
12. `/admin/reviews/new`에서 공식 출처 수동 후보를 등록할 때
    공식 운영 주체·정확한 단일 사무소와 민감정보 미포함을 필수 확인한다.
    `review_items.submitted_by_actor_id`에 같은 사용자 ID가 기록되고 운영
    업체가 생성되지 않는지 확인한다. 공개 승인은 별도 사람 검증 후 수행한다.

Restricted 설정과 Hobby 기능 범위는 [Clerk Restrictions 공식 문서](https://clerk.com/docs/guides/secure/restricting-access), [로그인 방식 공식 문서](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)와 [Clerk 요금표](https://clerk.com/pricing)를 기준으로 한다.

## 5. 환경 사전검증

설정 파일에는 키와 ID를 넣지 않고 `apps/web/.env.local` 또는 배포 환경 비밀을 사용한다. Clerk 키리스 실행이 만드는 `apps/web/.clerk`도 비밀을 포함할 수 있어 Git에서 제외한다.

검증기 자체의 합성 입력 테스트:

```bash
cd apps/web
npm run auth:validate-config:self-test
```

실제 개발 설정 검사:

```bash
cd apps/web
npm run auth:validate-config -- --environment=development
```

실제 allowlist 관리자 세션과 임시 PostgreSQL을 사용하는 자동 E2E:

```bash
./scripts/verify-admin-e2e-postgres.sh
```

이 검증은 Clerk의 공식 Playwright 테스트 토큰과 로그인 helper로 일회성 관리자
세션을 준비하고, 관리자 페이지·Server Action·역할 allowlist·감사 처리자 저장을
브라우저부터 DB까지 확인한다. 관리자 이메일은 `CLERK_ADMIN_USER_IDS`의 사용자
ID로 Clerk Backend에서 실행 중에만 조회하며 저장하거나 출력하지 않는다.
[Clerk Playwright 테스트 개요](https://clerk.com/docs/guides/development/testing/playwright/overview)와
[테스트 helper 문서](https://clerk.com/docs/guides/development/testing/playwright/test-helpers)를
구현 기준으로 사용한다.

미리보기와 운영은 각각 `preview`, `production`을 사용한다. 검사는 다음 계약을 값 출력 없이 확인한다.

- PostgreSQL DB를 가리키는 `DATABASE_URL`
- Clerk 공개·비밀 키 존재와 `test`/`live` 모드 일치
- 운영은 `live`, 개발·미리보기는 `test` 키 사용
- 로그인 경로 `/sign-in`, 로그인 후 경로 `/admin/reviews`
- 올바른 `user_` 형식과 중복 없는 역할 ID
- 최소 한 명의 `admin`

사전검증은 Clerk 네트워크에 접속하거나 키 활성 상태, Restricted mode, Google 로그인 설정·계정 2단계 인증과 실제 사용자를 확인하지 않는다. 이 항목은 Dashboard 확인과 실제 로그인 시험으로 별도 검증한다.

실제 개발 DB의 검수 결과를 확인할 때는 출처 이름을 명시한 읽기 전용 명령을
사용한다.

```bash
cd apps/web
npm run db:inspect-review-state -- \
  --source=mugunghwa-detective-official-pilot
```

이 명령은 검수·수집 실행 ID, 추출기 버전, 상태, 감사 작업 수, 처리자가 현재
역할 설정에 포함되는지와 상태별 업체 수만 출력한다. 수집값·제안값,
전화·주소와 Clerk 사용자 ID는 출력하지 않으며 데이터를 변경하지 않는다.

## 6. 권한 검사 위치

- `src/proxy.ts`: 요청에서 Clerk 인증 상태를 사용할 수 있게 한다. 단독 보안 경계로 사용하지 않는다.
- 관리자 Layout과 각 Page: 관리자 데이터 조회 전에 `reviewer` 이상인지 확인한다.
- 각 Server Action: 입력 처리와 데이터 변경 전에 다시 `reviewer` 이상인지 확인한다.
- 도메인 유스케이스: 처리자 ID, 상태, 동시성과 필수 검수 규칙을 트랜잭션에서 확인한다.

UI 메뉴 숨김이나 Layout 검사만으로 Server Action을 보호하지 않는다.

## 7. 운영 원칙

- 퇴사·역할 변경 시 Clerk 세션을 해지하고 allowlist에서 즉시 제거한다.
- 키 노출이 의심되면 환경별 키를 회전하고 관련 세션과 로그를 확인한다.
- 관리자 Google 계정은 2단계 인증 또는 패스키와 개인별 계정을 사용하며 공유 계정을 금지한다.
- 관리자 작업을 마친 공용·비신뢰 기기에서는 Clerk와 Google 세션을 로그아웃한다.
- 로그인 실패, 권한 거부와 비정상적인 대량 결정은 민감값 없이 모니터링한다.
- 역할 allowlist가 자주 바뀌거나 운영 인원이 늘면 Clerk 조직 역할 또는 애플리케이션 역할 테이블을 검토한다.

## 8. 현재 준비 상태

- 서버 전용 역할 판정, 관리자 Page·Server Action 중복 권한 검사와 감사 처리자 저장은 합성 ID로 검증했다.
- 환경 사전검증과 `.clerk` 비밀 제외 규칙을 준비했다.
- Clerk Hobby Development의 실제 `test` 키 조합과 관리자 한 명의 역할 설정은 사전검증을 통과했다.
- 실제 Google 로그인으로 관리자 대기열·상세에 접근하고 파일럿 후보를
  `on_hold`로 처리했다. 감사 이력의 처리자 ID가 로그인한 allowlist 관리자
  ID와 일치하고 운영 업체 0건을 유지함을 DB에서 확인했다.
- 실제 allowlist 관리자 테스트 세션으로 수동 후보 등록, 제출자 ID 저장,
  URL 해시 조각 중복 안내, 반려 감사 처리자·사유와 운영 업체 0건을
  production 브라우저와 임시 PostgreSQL에서 확인했다. 테스트 토큰은 Google
  로그인 화면과 관리자 Google 계정의 2단계 인증 수행 자체를 검증하지 않는다.
- 출처별 실제 검수 상태와 감사 처리자 권한 여부를 민감한 업체값·사용자 ID
  없이 재확인하는 읽기 전용 점검 명령을 준비했다.
- 지속형 개발 DB를 현재 migration에 맞춘 뒤 파일럿 출처 점검에서 기존
  `jsonld-v1` 보류 작업의 처리자 권한 유효, 교정 `jsonld-v2` 대기 유지와
  운영 업체 0건을 확인했다.
