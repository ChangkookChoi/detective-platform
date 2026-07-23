# 관리자 인증 운영

## 1. 목적

Clerk로 관리자 신원과 세션을 확인하고, 서버 전용 allowlist로 검수자와 관리자 권한을 제한하는 초기 운영 절차를 정의한다. 인증 선택 근거는 [ADR-0005](../decisions/ADR-0005-clerk-admin-auth.md)를 따른다.

## 2. 역할

- `reviewer`: 검수 대기열 조회, 공개 승인, 보류와 반려
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
3. Multi-factor에서 TOTP 등 사용할 방식을 활성화하고 `Require multi-factor authentication`을 켠다.
4. 관리자 계정을 초대하거나 직접 만들고 MFA 등록을 완료한다.
5. Clerk 사용자 ID를 역할별 allowlist에 추가한다. 같은 ID가 두 목록에 있으면 `admin`을 우선하지만 불필요한 중복 등록은 피한다.
6. 아래 사전검증을 통과한 뒤 개발 서버를 다시 시작한다.
7. `/sign-in` 로그인과 `/admin/reviews` 접근을 확인한다.
8. 허용되지 않은 로그인 계정이 관리자 데이터에 접근하지 못하는지 확인한다.
9. 승인 전 파일럿 검수 상세에서 원문 URL·수집값·제안값을 비교한다.
10. 보류 또는 반려 같은 비공개 결정을 먼저 시험하고 `review_actions.actor_id`에 Clerk 사용자 ID가 기록되는지 확인한다. 공개 승인은 별도 사람 검증 후 수행한다.

Restrictions와 MFA 설정은 [Clerk Restrictions 공식 문서](https://clerk.com/docs/authentication/allowlist)와 [Clerk MFA 공식 문서](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)를 기준으로 한다.

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

미리보기와 운영은 각각 `preview`, `production`을 사용한다. 검사는 다음 계약을 값 출력 없이 확인한다.

- PostgreSQL DB를 가리키는 `DATABASE_URL`
- Clerk 공개·비밀 키 존재와 `test`/`live` 모드 일치
- 운영은 `live`, 개발·미리보기는 `test` 키 사용
- 로그인 경로 `/sign-in`, 로그인 후 경로 `/admin/reviews`
- 올바른 `user_` 형식과 중복 없는 역할 ID
- 최소 한 명의 `admin`

사전검증은 Clerk 네트워크에 접속하거나 키 활성 상태, Restricted mode, MFA 설정과 실제 사용자를 확인하지 않는다. 이 항목은 Dashboard 확인과 실제 로그인 시험으로 별도 검증한다.

## 6. 권한 검사 위치

- `src/proxy.ts`: 요청에서 Clerk 인증 상태를 사용할 수 있게 한다. 단독 보안 경계로 사용하지 않는다.
- 관리자 Layout과 각 Page: 관리자 데이터 조회 전에 `reviewer` 이상인지 확인한다.
- 각 Server Action: 입력 처리와 데이터 변경 전에 다시 `reviewer` 이상인지 확인한다.
- 도메인 유스케이스: 처리자 ID, 상태, 동시성과 필수 검수 규칙을 트랜잭션에서 확인한다.

UI 메뉴 숨김이나 Layout 검사만으로 Server Action을 보호하지 않는다.

## 7. 운영 원칙

- 퇴사·역할 변경 시 Clerk 세션을 해지하고 allowlist에서 즉시 제거한다.
- 키 노출이 의심되면 환경별 키를 회전하고 관련 세션과 로그를 확인한다.
- 로그인 실패, 권한 거부와 비정상적인 대량 결정은 민감값 없이 모니터링한다.
- 역할 allowlist가 자주 바뀌거나 운영 인원이 늘면 Clerk 조직 역할 또는 애플리케이션 역할 테이블을 검토한다.

## 8. 현재 준비 상태

- 서버 전용 역할 판정, 관리자 Page·Server Action 중복 권한 검사와 감사 처리자 저장은 합성 ID로 검증했다.
- 환경 사전검증과 `.clerk` 비밀 제외 규칙을 준비했다.
- 실제 Clerk 프로젝트·키, Restricted mode, MFA와 관리자 계정은 아직 준비되지 않았다.
- 실제 인증 전까지 파일럿 검수 후보는 `pending`·비공개로 유지한다.
