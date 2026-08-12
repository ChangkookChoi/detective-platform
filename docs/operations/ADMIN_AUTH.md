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
- 운영 `NEXT_PUBLIC_SITE_URL`은 경로 없는 HTTPS custom domain이며
  `*.vercel.app`은 허용하지 않음
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
- Clerk 키가 없거나 배포 환경과 test/live 모드가 맞지 않으면 공개 경로는
  통과시키고 `/admin`·`/sign-in`·`/__clerk`만 503으로 닫는 fail-closed proxy
  경계를 추가했다. 미설정 Production 빌드와 공개 200·관리자 503 응답 헤더,
  정상 Development 키의 기존 production E2E 14건을 확인했다.
- Clerk Hobby Development의 실제 `test` 키 조합과 관리자 한 명의 역할 설정은 사전검증을 통과했다.
- Vercel Production에는 canonical origin과 로그인 경로를 설정했지만 Clerk
  live 키와 Production 인스턴스의 관리자 사용자 ID는 아직 없다. Clerk 공식
  Production 배포에는 소유하고 DNS를 변경할 수 있는 custom domain이 필요하며
  `*.vercel.app`은 사용할 수 없다. Development 사용자 ID는 별도 Production
  사용자 풀에 재사용하지 않는다.
- 도메인 연결부터 live 키 저장, 재배포와 실제 smoke 검증까지의 순서는
  [Production 출시 절차](PRODUCTION_RELEASE.md)를 따른다.
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
  `jsonld-v1` 보류 후보를 주소 결함 사유로 반려했다. 보류·반려 감사 작업의
  처리자 권한 유효를 확인했다. 이어 실제 로그인한 allowlist 관리자가 교정
  `jsonld-v2` 후보를 승인했으며, 승인 감사 처리자 권한 유효와 운영 업체
  `published` 1건을 확인했다.
- Clerk 공식 testing token과 실제 관리자용 일회성 sign-in token으로
  J&K·정의·원픽·엠디 본점·수원점 5건의 관리자 수동 등록을 실행했다. 모든
  후보의 제출자 allowlist가 유효하고 Server Action 권한 검사, 비공개
  `pending` 저장과 공개 업체 1건 유지가 확인됐다. 이 자동화는 Google 로그인
  UI나 관리자 Google 계정의 2단계 인증 수행 자체를 증명하지 않는다.
- 같은 공식 인증 경로에서 다섯 후보의 소재 지역·업무 분야·공식 웹사이트
  출처를 지정해 모두 승인했다. 각 `approved` 감사 작업의 처리자가 유효한
  관리자이고 공개 업체 6건, 다섯 신규 상세 HTTP 200과 브라우저 오류 0건을
  확인했다. 반복되는 짧은 테스트 세션은 실제 Google 로그인 UI 검증을
  대체하지 않으므로 해당 한계는 그대로 유지한다.
- 2026-08-10 최신 공식 원문을 통과한 지니·다해결·명가·반딧불·시몬·트래커·
  내일·김전일컴퍼니 서울지점 8건을 같은 Clerk testing token과 실제 allowlist
  관리자 세션으로 등록했다. 모두 `pending/new_office/high`, 제출자 권한 유효,
  감사 작업과 운영 업체 연결 0건이며 기존 공개 업체 6건은 변하지 않았다.
  이어 후보별 최하위 소재지·관리형 업무 분야·공식 웹사이트 출처를 원문과
  대조하고 같은 관리자 상세 화면과 Server Action에서 8건 모두 승인했다.
  독립 점검에서 수동 후보 13건 전체의 제출자·승인 처리자 권한과 감사 작업,
  공개 업체 14건 및 신규 상세 8건의 HTTP 200을 확인했다. SQL 직접 삽입이나
  인증·Server Action 권한 우회는 사용하지 않았다.
- 같은 날 다음 공식 출처 묶음에서 오앤·고려·진짜·디테일·한국사설탐정협회·
  VIP 6건을 testing token과 실제 allowlist 관리자 화면·Server Action으로
  등록했다. 모두 `pending/new_office/high`, 제출자 권한 유효, 감사 작업 0건,
  운영 업체 미연결이며 공개 업체 14건은 변하지 않았다. 이어 승인 직전 원문을
  재확인하고 같은 인증 경로에서 오앤·진짜·디테일·한국사설탐정협회·VIP 5건을
  승인해 공개했다. 협회는 공식 운영 주체명으로 수정 승인했고, 고려는 공식
  HTML 내부 주소 충돌을 이유로 보류했다. 다섯 승인 건의 유효한 감사 처리자,
  대표 출처·필드별 근거와 공개 상세 HTTP 200을 확인했으며 공개 업체는 19건이다.
  SQL 직접 삽입이나 Server Action 권한 우회는 사용하지 않았다.
- 다음 공식 출처 묶음에서 흥신소 굿탐정 화성 본사·굿파트너·한마음·착한탐정
  4건을 같은 testing token과 실제 allowlist 관리자 화면·Server Action으로
  등록했다. 모두 `pending/new_office/high`, 제출자 권한 유효, 감사 작업 0건,
  운영 업체 미연결이며 기존 공개 업체 19건은 변하지 않았다. 등록용 브라우저
  자동화는 정확한 제안값과 공개 업체 불변을 독립 DB 쿼리로 확인한 뒤 제거했다.
  SQL 직접 삽입이나 인증·Server Action 권한 우회는 사용하지 않았다.
- 인앱 Browser가 노출되지 않은 상태에서도 같은 Clerk 공식 testing token과
  관리자 sign-in token을 사용하는 저장소의 production Chrome 검증 경로로 네
  후보의 실제 관리자 상세 폼과 `approveReviewAction`을 실행했다. 모두 제안값
  그대로 `approved` 처리됐고 유효한 감사 처리자·대표 출처·필드별 근거, 공개
  상세 HTTP 200과 브라우저 오류 0건을 확인했다. 공개 업체는 23건이며 SQL 직접
  삽입이나 인증·Server Action 권한 우회는 사용하지 않았다.
- 다음 공식 출처 묶음의 DSI·에이원·넘버원 3건도 Clerk 공식 testing token과
  실제 allowlist 관리자 세션의 `/admin/reviews/new` 폼으로 등록했다. 모두
  `pending/new_office/high`, 유효한 제출자, 감사 작업·운영 업체 연결 0건이며
  공개 업체 23건 불변을 확인했다. 승인 권한은 실행하지 않았고 일회성 등록
  자동화는 검증 후 제거했다.
- 승인 직전 공식 원문과 분류를 다시 대조한 뒤 같은 인증 경로의 실제 관리자
  상세 폼과 `approveReviewAction`으로 세 후보를 제안값 그대로 승인했다. 각
  `approved` 감사 작업의 처리자가 유효한 관리자이며 대표 출처·필드별 근거와
  공개 상세 HTTP 200을 확인했다. 최종 수동 후보는 승인 24건·수정 승인 1건·
  보류 1건·대기 0건, 공개 업체는 26건이다. 공개 상세에서 Clerk 로그아웃 helper가
  로딩을 기다리다 제한시간을 초과한 1회 실행은 승인 결과와 분리해 읽기 전용
  DB·production Chrome 검증으로 재실행했고 1건이 통과했다.
- 다음 공식 출처 묶음의 PIS·전국명품탐정·탐정법인 루미노케이 서울본부·
  쌍용탐정사무소 4건을 같은 Clerk 공식 testing token과 실제 allowlist 관리자
  세션의 `/admin/reviews/new` 폼으로 등록했다. 네 건 모두
  `pending/new_office/high`, 유효한 제출자, `manual_admin/manual-v1`, 감사 작업
  0건·운영 업체 미연결이며 공개 업체 26건 불변을 확인했다. 첫 실행 중 개발
  세션 만료와 재로그인 상태 충돌을 각각 감지한 뒤 후보 URL 기준 재개 안전성을
  적용해 중복 없이 완료했으며, 일회성 자동화는 독립 DB 검증 후 제거했다.
- 같은 작업 범위에서 네 후보의 공식 원문과 보수적 업무 분야를 재확인하고 실제
  관리자 상세 폼과 `approveReviewAction`으로 모두 제안값 그대로 승인했다.
  감사 사유에 사용자 위임 일괄 승인임을 명시했으며, 각 후보의 유효한 처리자·
  대표 출처·필드별 근거와 공개 상세 HTTP 200·브라우저 오류 0건을 독립 확인했다.
  최종 수동 후보는 승인 28건·수정 승인 1건·보류 1건·대기 0건, 공개 업체는
  30건이다. 일회성 승인 자동화는 검증 후 제거했다.
