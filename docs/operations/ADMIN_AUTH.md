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

1. 개발·미리보기·운영 환경을 구분해 Clerk 애플리케이션과 키를 준비한다.
2. 공개 셀프 가입을 사용하지 않고 운영자가 허용한 계정만 로그인할 수 있게 설정한다.
3. 가능한 경우 관리자 계정에 다중 인증을 요구한다.
4. Clerk 사용자 ID를 역할별 allowlist에 추가한다. 같은 ID가 두 목록에 있으면 `admin`을 우선한다.
5. `/sign-in` 로그인과 `/admin/reviews` 접근을 확인한다.
6. 허용되지 않은 로그인 계정이 관리자 데이터에 접근하지 못하는지 확인한다.
7. 승인·보류·반려 후 `review_actions.actor_id`에 Clerk 사용자 ID가 기록되는지 확인한다.

## 5. 권한 검사 위치

- `src/proxy.ts`: 요청에서 Clerk 인증 상태를 사용할 수 있게 한다. 단독 보안 경계로 사용하지 않는다.
- 관리자 Layout과 각 Page: 관리자 데이터 조회 전에 `reviewer` 이상인지 확인한다.
- 각 Server Action: 입력 처리와 데이터 변경 전에 다시 `reviewer` 이상인지 확인한다.
- 도메인 유스케이스: 처리자 ID, 상태, 동시성과 필수 검수 규칙을 트랜잭션에서 확인한다.

UI 메뉴 숨김이나 Layout 검사만으로 Server Action을 보호하지 않는다.

## 6. 운영 원칙

- 퇴사·역할 변경 시 Clerk 세션을 해지하고 allowlist에서 즉시 제거한다.
- 키 노출이 의심되면 환경별 키를 회전하고 관련 세션과 로그를 확인한다.
- 로그인 실패, 권한 거부와 비정상적인 대량 결정은 민감값 없이 모니터링한다.
- 역할 allowlist가 자주 바뀌거나 운영 인원이 늘면 Clerk 조직 역할 또는 애플리케이션 역할 테이블을 검토한다.
