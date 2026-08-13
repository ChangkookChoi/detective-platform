# 프로젝트 상태

- 기준일: 2026-08-13
- 단계: 핵심 MVP 기능 구현·출시 준비
- 배포 상태: 최신 `main` Vercel Production `Ready`, custom domain·Clerk
  Production·정책 확정 전 공개 출시 차단
- 데이터 상태: 실제 파일럿 결함 후보 `rejected` 1건·교정 `approved` 1건·
  공식 출처 수동 후보 `approved` 29건·`approved_with_edits` 1건·`on_hold`
  1건·`pending` 0건, 지속형 개발 DB·Production Neon 공개 업체 각각 31건

## 현재 요약

서울·경기 약 100개 탐정사무소를 대상으로 하는 정보 디렉터리 MVP의
공개 탐색과 관리자 검수 흐름을 구현하고 있습니다. 데이터 계층,
홈·목록·상세, Clerk 인증 검수, 개인정보 최소화 일별 집계, 정책 기반
Python 수집기와 신규·변경·정정 후보 승인을 구현했습니다. 실제 Clerk
Google 로그인으로 파일럿 후보의 대기열·상세를 확인하고 `on_hold` 결정을
저장했으며, 2026-08-08 주소 결함 사유로 최종 반려했습니다. 주소 지역명
중복 정규화를 `jsonld-v2`로 교정해 최소 권한 재수집을 실행한 뒤 공식 원문,
소재지와 업무 분야를 사람이 대조해 승인했습니다. 감사 처리자 권한, 대표
출처·필드 근거 7건, 공개 업체 1건과 공개 상세 HTTP 200을 확인했습니다. 추가 공식
홈페이지 후보를 다섯 차례에 걸쳐 추가 조사했고, 남은 10곳을 2026-08-10
현재 원문으로 다시 확인해 8곳을 고위험 비공개 수동 후보로 등록했습니다.
각 공식 업무 안내를 관리형 분류에 보수적으로 매핑하고 최하위 소재지와 대표
출처를 검수해 모두 승인·공개했습니다. 현재 접근에 실패한 다해 화성 본사와
공식 HTML 내부 주소가 충돌하는 명진은 재확인 후에도 등록하지 않고
`deferred`로 유지했습니다. 이어 신규 공식 홈페이지 10곳을 조사해 오앤·고려·
진짜·디테일·한국사설탐정협회·VIP 6곳을 비공개 고위험 후보로 등록했습니다.
승인 직전 공식 원문을 다시 대조해 오앤·진짜·디테일·VIP는 제안값 그대로,
협회 서비스는 공식 운영 주체명 `한국사설탐정협회`로 수정해 공개했습니다.
고려는 같은 현재 HTML의 주소가 `a동 720`과 `B동 720호`로 충돌해 운영 업체를
만들지 않고 보류했습니다. 실제 Clerk 관리자 화면·Server Action과 공개
상세를 통과해 당시 공개 업체는 19곳이 됐습니다. 이어 공식 홈페이지 6곳을 조사해
흥신소 굿탐정 화성 본사·굿파트너·한마음·착한탐정 4곳을 같은 관리자 경로로
비공개 고위험 후보 등록했습니다. 승인 직전 원문을 다시 대조하고 제안값
그대로 지역·업무 분야·공식 출처를 연결해 모두 공개했습니다. 현재 공개 업체는
23곳입니다. 충남 천안 소재 공존과 같은 공식 도메인에서 운영 법인·사업자번호가
충돌하는 LIRA는 등록하지 않았습니다.
이어 새 공식 출처를 조사해 탐정사무소 DSI·에이원흥신소·넘버원 탐정사무소
3곳의 서울 단일 사무소와 대표번호를 현재 원문에서 확인하고 실제 Clerk 관리자
등록 경로로 비공개 후보를 만들었습니다. 승인 직전 원문을 다시 대조하고
최하위 소재지·업무 분야·공식 출처를 지정해 세 곳 모두 공개했습니다. 같은
운영 주체인 바른기획·VIP의 별도
브랜드 도메인, 인천 소재 리셋과 만료 화면이 유지된 호시탐탐은 등록하지
않았습니다. 이어 PIS·전국명품탐정·탐정법인 루미노케이 서울본부·
쌍용탐정사무소의 공개 접근 정책과 현재 공식 최소 사실 필드를 확인하고 실제
Clerk 관리자 등록 경로로 비공개 후보 4건을 추가했습니다. 수동 후보는 총
30건입니다. 같은 작업 범위에서 승인 직전 원문과 업무 안내를 다시 확인하고
사용자 위임 일괄 승인임을 감사 사유에 명시해 네 곳을 모두 공개했습니다.
대기 후보는 0건, 공개 업체는 30곳입니다.
J&K 별도 도메인의 AI 접근 차단·기존 업체 중복, 무궁화 도메인을 가리키는
별도 사이트, 소나무 DNS 실패와 호시탐탐 호스팅 만료는 등록하지 않았습니다. 인증
운영자가 공식 URL과 최소 사실 필드만 고위험 비공개 후보로 등록하는 수동
유입 경로를 구현하고 J&K·정의·원픽·엠디탐정 본점·수원점 5건의 원문,
소재지와 관리형 업무 분야를 대조해 승인·공개했습니다. 이용 안내·개인정보
처리방침 초안·광고 표시 정책과
canonical·robots·공개 상태 기반 sitemap·업체 상세 구조화 데이터의 출시 전
SEO 기반을 구현했습니다. production 서버의 데스크톱·모바일 Chrome에서 공개
안내·canonical·robots와 로그아웃 관리자 리디렉션을 반복 검증하는 Playwright
E2E 기반도 추가했습니다. 임시 PostgreSQL의 합성 공개 업체로 필터 목록·상세·
조회 및 전화 클릭 집계·정정 요청 저장까지 브라우저/API/DB 경계를 검증했습니다.
Clerk 공식 테스트 토큰으로 실제 allowlist 관리자 세션을 준비해 수동 후보
등록·중복 안내·반려·보류·승인 공개 결정과 제출자·감사 처리자 저장, 업체·
출처·필드 근거 생성과 공개 상세 노출까지 브라우저/Server Action/DB 경계에서
자동 검증했습니다. 같은 Clerk 사용자를 별도 production 서버에서 reviewer로만
매핑해 검수 화면 접근과 `검수자` 역할 표시도 확인했습니다. 공개 전 경로에는
기본 보안 응답 헤더와 키보드 본문 건너뛰기를 추가했고 데스크톱·모바일 Chrome
출시 E2E 14건을 통과했습니다.
2026-08-13 다음 공식 출처 9개를 조사해 접근 차단·DNS/TLS 장애·주소 충돌 후보는
등록하지 않았고, 기존 공개 업체인 다해결·반딧불도 중복 등록하지 않았습니다.
신규로 확인된 럭스탐정사무소 서울 본사는 승인 직전 공식 원문과 robots를 다시
대조한 뒤 실제 Clerk 관리자 등록·승인 흐름으로 공개했습니다. 서울 서초와 가족
문제·증거·사실 확인·개인 피해 대응만 보수적으로 연결하고 유효한 감사 처리자,
대표 출처와 필드 근거 6건, 공개 상세 HTTP 200·브라우저 오류 0건을 확인했습니다.
지속형 개발 DB와 Production Neon의 공개 업체는 모두 31곳입니다.
비어 있지 않은 운영 DB에는 기존 공개 그래프를 덮어쓰지 않고 신규 공개 레코드만
추가하는 증분 승격 명령을 구현했습니다. 대상 30건·신규 1건 같은 명시적 예상
수량, serializable 잠금, dry-run rollback, 기존 그래프 완전 일치와 ID·slug 충돌
검사를 요구합니다. 격리 PostgreSQL 17에서 신규 추가·무변경 재실행·충돌 및
불일치 rollback·비공개 데이터 격리와 최초 bootstrap 회귀를 통과했습니다.
최신 실제 Neon 암호화 backup run `31667893789` 성공을 확인하고 owner direct
자격 증명을 실행 중에만 주입해 dry-run에서 신규 업체 1건·출처 1건·필드 근거
6건·업무 분야 연결 3건을 검증·rollback했습니다. 같은 예상 수량으로 실제
30→31 원자 반영을 완료하고, 대상 31건·신규 0건 재실행에서 전체 공개 그래프
일치와 무변경을 확인했습니다. Vercel Production의 럭스 상세도 배포 보호를
유지한 요청에서 HTTP 200, 서버 생성 업체명·slug·정보 출처 포함, 서버 오류
표시 없음으로 확인했습니다.
Next.js와 ESLint 설정을 16.3.0으로 올리고 전체 회귀 검증을 통과해 production
의존성 보안 감사도 0건으로 정리했습니다. PostgreSQL 합성 논리 백업·복구
리허설은 자동화했습니다. 추가 비용 없는 Neon Free를 출시 리허설 후보로
비교하고 pooled 런타임·direct migration 역할 분리, TLS·풀 상한과 실제 권한
검증 명령을 준비했습니다. Vercel `sin1` 설정, runtime·read-only backup 역할
구성과 `age` 암호화 일일 GitHub Actions artifact·수동 격리 복원 자동화를
추가하고 합성 암호화 복원을 통과했습니다. Vercel Hobby 프로젝트와 Neon Free
Singapore 리소스를 생성해 실제 migration·seed를 적용했습니다. 최소 권한
runtime·read-only backup 역할을 분리해 권한과 TLS를 검증하고 공개 30곳과 공개
근거만 빈 Neon DB로 원자적으로 승격했습니다. Vercel Production과 GitHub
Actions에 역할별 연결 정보를 저장하고 임시 owner 연결을 제거했습니다.
새 `age` 키쌍의 암·복호화 왕복을 검증하고 공개 recipient와 비공개 identity를
GitHub repository variable·Actions secret에 분리 저장한 뒤 로컬 임시 키를
폐기했습니다. 실제 Neon 암호화 artifact를 빈 PostgreSQL 17에 복원해 공개 업체
30건과 schema·migration·제약·seed·출처 무결성을 확인했습니다. 최신 `main`의
Vercel Production 리허설도 `Ready`지만 custom domain과 Clerk Production이
없어 아직 공개 출시 상태는 아닙니다.
최소 권한 runtime·backup 자격 증명을 다시 회전해 Vercel Production과 GitHub
Actions secret을 갱신하고 역할·TLS·권한을 재검증했습니다. 5분 30초 DB 유휴 뒤
Neon 첫 연결·조회 1,808.2ms와 즉시 후속 새 연결·조회 524.6ms를 측정했으며 둘 다
공개 업체 30건을 반환했습니다. public GitHub repository의 Actions 정책과
계정 전체 Actions 0원 초과 사용 중지·포함 사용량 알림을 확인했습니다. 실제
Neon 백업 artifact는 60,965바이트, 14일 보존으로 생성했고 복구 지점 0.11시간,
순수 복원 2초와 전체 검증 1분 6초를 기록했습니다.
수정 PR #2를 병합한 뒤 `main`에서도 60,965바이트 백업과 공개 업체 30건 복원을
재통과했습니다. 첫 자동 예약 백업도 모든 단계를 통과해 현재 artifact는
3개·총 182,895바이트가 됐습니다. 저장량·보존 guard를 적용한 실제 수동
백업까지 통과해 현재 artifact는 4개·총 243,860바이트입니다.
repository Actions는 GitHub 소유 action만 허용하고 전체 40자리 SHA 고정을
필수화했습니다. 기본 token은 read-only·PR 승인 불가이고 artifact·log 기본
보존은 정책과 같은 14일로 낮췄습니다.
백업 client와 격리 복원 service의 Docker Official Image도 PostgreSQL 17 Alpine
multi-arch digest로 고정했습니다.
PR과 `main`에 Production 비밀 없이 실행되는 기본 quality workflow를 추가해
Node.js 24 웹 self-test·lint·webpack build와 Python 3.13 수집기 compileall·
단위 테스트를 분리 실행합니다. GitHub action·runner·권한·container digest
정책도 저장소 스크립트로 회귀 검사합니다.
첫 GitHub PR 실행에서 수집기 job 11초·웹 job 59초로 모두 통과했습니다. `main`은
PR과 최신 base 기준 두 job 성공·대화 해결을 요구하고 force-push·삭제를 막는
branch protection을 적용했습니다.
전체 작업 브랜치의 PR #1을 `main`에 병합했고 새 `main` quality job도 수집기
9초·웹 52초로 통과했습니다. Vercel Preview의 기본 Next.js production build와
배포도 성공했습니다. Preview는 Vercel SSO 보호로 공개 경로도 비로그인
요청에서 302 인증 이동을 반환합니다.
2026-08-12 사전검증에서 기존 Production 리허설 배포의 Clerk publishable key
누락 500을 확인하고, Clerk 미설정 시 공개 경로는 유지하되 관리자·로그인
경로만 503으로 닫는 fail-closed 경계를 반영했습니다. 2026-08-13 PR #4 병합 후
최신 `main` Production 배포가 `Ready`이며 Vercel 인증 우회 smoke에서 홈 200,
관리자·로그인 503을 확인했습니다. custom domain은 0개이고 live 키·Production
관리자 ID는 아직 없습니다. Production 인증 사전검증은 이제 `*.vercel.app`을
거부하며, 도메인 연결부터 live 키 저장·재배포·smoke 검증까지의 출시 절차를
별도 runbook으로 고정했습니다. 공개 정정 요청은 정상 접수에 더해 민감정보
확인 누락·위험 URL·동일 요청 중복·업체별 24시간 10건 한도 화면과 DB 불변을
임시 PostgreSQL·Production Chrome에서 자동 검증합니다. 보호된 Vercel 배포의
공개·SEO·인증 경로 상태와 fail-closed 헤더도 한 명령으로 점검합니다.

## 완료

- 모노레포 디렉터리 골격 생성
- `apps/web` Next.js App Router 기본 프로젝트 생성
- `services/collector` Python 3.13 및 `uv` 기본 프로젝트 생성
- 제품 범위, 사용자 흐름, 아키텍처, 데이터/API 원칙 문서화
- 데이터 수집·검증·SEO·보안 정책 문서화
- 모노레포, Next.js 모놀리스, PostgreSQL 선택 ADR 작성
- 업체·지역·업무 분야의 MVP 데이터 모델 결정
- 합성 표본으로 복수 지점·공유 대표번호·가변 깊이 지역 계층 예외 검증
- Drizzle ORM, `node-postgres`, Drizzle Kit migration 도구 선정 및 ADR 작성
- 12개 초기 테이블, enum, 외래키, check와 조회용 index migration 생성
- 서울 25개 자치구, 경기 31개 시·군과 일반구 24개 및 다섯 업무 분야의 멱등 seed 구현
- PostgreSQL 17.10 임시 클러스터에서 migration, seed 2회 실행과 핵심 제약 통합 검증
- 임시 PostgreSQL 생성·검증·정리를 자동화한 로컬 통합 스크립트 구현
- 공식 지방자치단체·행정안전부 자료를 기준으로 지역 seed 출처와 갱신 절차 문서화
- 공개 상태 업체의 자체 필수 필드를 강제하는 DB check migration 추가
- 공개 전 필수 필드·활성 지역·업무 분야·대표 출처·필드별 근거·검수 항목·동시성을 확인하는 트랜잭션 유스케이스 구현
- 공개 상태만 반환하는 업체 목록·상세 repository와 상위 지역·업무 분야 필터 구현
- 합성 데이터로 공개 거부·승인·감사 이력·필터·상세 출처·동시성 충돌 통합 검증
- 공개 홈과 업체 목록·상세 Server Component 화면 구현
- 사무소 소재 지역·업무 분야 GET 필터, 빈 결과 안내와 잘못된 필터·비공개 slug 404 처리
- 대표 전화 `tel:` 연결, 출처·최종 확인일·비추천/비보증·통신 요금 안내 표시
- 공개 출처 URL을 HTTP(S)로 제한하고 합성 데이터로 위험한 URL 공개 거부 검증
- 실제 개발 서버 HTML에서 홈, 목록, 필터, 빈 결과, 상세, 전화·출처 링크와 404 응답 검증
- 관리자 인증 공급자로 Clerk를 선택하고 역할·비밀 관리·재검토 조건을 ADR-0005로 기록
- 서버 전용 Clerk 사용자 ID allowlist 기반 `reviewer`·`admin` 역할 판정 구현
- Next.js 16 `proxy.ts`, 관리자 Page와 모든 Server Action의 중복 인증·권한 검사 경계 구현
- 위험도·생성 시각 순 검수 대기열과 현재값·제안값·수집값·출처·감사 이력 상세 화면 구현
- 공개 승인, 보류와 반려 Server Action을 트랜잭션 유스케이스에 연결
- 합성 데이터로 역할 우선순위·미허용 사용자·대기열 필터·보류 후 재검토·반려·동시성·감사 이력 검증
- 상세 표시와 목록·상세 전화 링크의 이벤트 기록을 작은 Client Component로 연결
- 같은 출처 JSON POST, 공개 업체·허용 이벤트 검사와 본문 크기 제한 구현
- 탭 세션 UUID의 서버 해시, 한국 날짜별 중복 제거와 세션당 50건 속도 제한 구현
- 48시간 단기 이벤트 정리와 업체별 상세 조회·전화 클릭 일별 집계 트랜잭션 구현
- 합성 HTTP 요청과 PostgreSQL로 Origin·입력·비공개 거부·중복·보존·속도 제한·집계 검증
- 분석 최소화·보존·비순위 원칙을 ADR-0006과 운영 정책으로 기록
- HTTPX와 Psycopg 기반 수집기, 동기식 순차 실행과 Drizzle migration 공유 결정을 ADR-0007로 기록
- 출처별 TOML에 정책·robots 확인자와 확인일, HTTPS host/path, 필드, 속도, timeout·재시도·redirect·응답 크기 제한을 필수화
- redirect 단계별 URL·공개 IP 검증, 조건부 요청, streaming byte 제한과 일시 오류만의 지수형 재시도 구현
- JSON-LD 업체 상세에서 허용된 상호·전화·주소·설명 필드와 주소 하위 키만 추출하고 정규화·canonical hash 생성
- 출처 URL로 기존 업체를 정확히 매칭하고 신규 업체·필드 변경만 위험도별 검수 후보로 생성
- 수집 레코드와 검수 후보를 같은 PostgreSQL 트랜잭션에 적재하고 운영 업체 행은 수정하지 않는 경계 구현
- ETag와 Last-Modified 저장 migration, 출처 등록·실행·중단 수집기 운영 절차 문서화
- 고정 JSON-LD, mock HTTP와 임시 PostgreSQL로 재시도·URL 거부·최소 필드·변경·중복 억제·운영값 불변 통합 검증
- 신규 수집 후보에 slug, 최하위 활성 지역, 관리형 업무 분야와 출처 유형을 지정하는 관리자 승인 폼 구현
- 신규 업체·업무 분야·대표 출처·필드 근거·검수 연결·감사 이력·공개 상태를 한 트랜잭션에서 생성
- 기존 업체의 제안 필드만 그대로 승인하거나 수정 후 승인하고 최종 편집 스냅샷을 감사 이력에 저장
- 검수 항목과 업체의 변경 시각을 함께 확인해 오래된 화면의 승인 차단
- 합성 신규·변경 후보로 제안값 승인, 수정 후 승인, 실패 전체 롤백, 중복 실행 차단과 공개 조회 통합 검증
- 공개 업체 상세의 정보 수정 요청 진입점과 업체명·대표 전화·주소·소개 단일 필드 정정 폼 구현
- 요청자 연락처·자유 형식 사유 없이 관계 유형, 제안 공개값과 선택적 공개 근거 URL만 받으며 민감정보 미포함 확인 적용
- 공개 업체 서버 재확인, 업체 단위 트랜잭션 잠금, 24시간 동일 요청 중복 제거와 업체당 전체 10건 속도 제한 구현
- `correction_request`를 기존 검수 대기열에 연결하고 제안 URL과 운영자 확인 출처를 분리
- 운영자가 직접 확인한 공개 출처를 요구해 승인 필드 근거·최종 확인일·감사 이력과 운영값을 한 트랜잭션에서 갱신
- 합성 정정 요청으로 비공개 거부, 민감정보 확인, 중복·속도 제한, 위험 URL 롤백, 미검증 제안 URL 비신뢰와 수정 후 승인 검증
- 공식 업체 홈페이지 후보 네 곳의 이용 조건 표시, robots와 JSON-LD 구조를 2026-07-23 기준으로 비교하고 허용·보류 근거를 출처 등록부에 기록
- robots 전체 허용과 유효한 `ProfessionalService` JSON-LD를 함께 만족하는 공식 홈페이지 한 곳을 단일 URL 파일럿으로 등록
- 상호·사업상 공개 대표전화·주소만 허용하고 소개·본문·이미지·상담 입력·게시판을 제외하는 최소 수집 정책 적용
- 동시성 1, 10초 간격, 100KB 응답, 2회 시도, redirect 1회와 명시적 연락 URL User-Agent 설정
- 정책 HTTP 클라이언트로 실제 페이지 HTTP 200·37KB·단일 후보와 허용 필드만 비저장 추출하고 정규화 최소 조건 검증
- Git 제외 경로에 유지되는 PostgreSQL 17 로컬 개발 클러스터의 초기화·시작·중지·상태 확인과 멱등 migration·seed 자동화
- 수집기에 업체·출처 조회와 실행·레코드·검수 후보 적재만 허용하고 업체 수정·검수 조회/삭제·schema 생성을 거부하는 전용 DB 역할 적용
- 임시 PostgreSQL에서 수집기 허용·거부 권한과 기존 수집 파이프라인의 최소 권한 실행 회귀 검증
- 등록 파일럿을 최소 권한 역할로 실제 개발 DB에 한 번 실행해 발견·수집 1건, 실패 0건과 `pending/new_office/high` 검수 1건 확인
- 파일럿 적재 후 운영 업체 0건을 확인해 자동 생성·공개가 일어나지 않는 경계 검증
- Clerk 개발·미리보기·운영 키 모드 일치, 로그인 경로와 `user_` 역할 ID, 최소 관리자 존재를 비밀값 출력 없이 확인하는 인증 환경 사전검증 추가
- 합성 인증 설정 self-test와 Clerk 키리스 로컬 설정 `/.clerk` Git 제외 적용
- Clerk Hobby Development의 실제 `test` 키 조합과 관리자 한 명 역할 설정 사전검증 통과
- 공개 홈·로그인 200 응답과 로그아웃 `/admin/reviews`의 로그인 경로 307 리디렉션 확인
- Clerk 자체 유료 MFA 대신 Restricted·Google 로그인과 관리자 Google 계정 2단계 인증을 사용하는 무과금 MVP 운영 정책 결정
- 실제 관리자 로그인 직전 파일럿 출처의 robots·공개 접근과 정책 설정을 재확인하고 최소 권한 조건부 수집에서 변경 없음 1건·신규 검수 0건·실패 0건 확인
- 실제 Clerk Google 로그인으로 관리자 대기열과 파일럿 상세를 확인하고
  `on_hold` 결정을 저장
- 파일럿 검수 상태·보류 감사 이력 한 건·로그인한 allowlist 관리자 처리자
  ID 일치와 운영 업체 0건을 PostgreSQL에서 확인
- JSON-LD 주소에서 우편번호는 유지하고 전체 도로명 주소에 이미 포함된
  지역명 중복을 제거하도록 정규화를 수정하고 `jsonld-v2`로 버전 갱신
- 추출기 버전이 바뀌면 이전 버전의 ETag·콘텐츠 해시를 재사용하지 않도록
  조건부 요청 기준을 버전별로 분리
- 경기 공식 홈페이지 후보 다섯 곳의 사업자 표기·robots·JSON-LD 지원
  여부를 비교하고 자동 수집 보류 근거를 출처 등록부에 추가
- 인증 운영자가 공식 출처 URL, 상호, 대표 전화와 주소만 입력하는
  `/admin/reviews/new` 수동 신규 후보 등록 화면과 Server Action 구현
- 수동 후보를 `manual_admin/manual-v1`, `new_office/high/pending`으로
  저장하고 제출자 Clerk ID를 감사 정보로 기록하는 트랜잭션 구현
- 같은 공식 출처 URL·주소의 `pending`·`on_hold` 신규 후보 중복 방지와
  입력 검증, 제출만으로 운영 업체가 생성되지 않는 경계를 PostgreSQL에서 검증
- `review_items.submitted_by_actor_id` migration과 수동 제출 감사 정보
  상세 표시 구현
- 파일럿 출처의 HTTP 200과 `robots.txt` 전체 허용을 재확인하고 최소 권한
  역할로 `jsonld-v2` 교정 실행 완료
- `jsonld-v2` 실행에서 발견 1건·수집 1건·신규 검수 1건·실패 0건과
  정규화·제안 주소의 교정 기대값 일치 확인
- 기존 `jsonld-v1` 후보 `on_hold`·감사 이력 1건을 보존하면서 교정
  `pending/new_office/high` 후보 1건을 별도 생성하고 운영 업체 0건 확인
- 같은 공식 출처 URL·주소의 중복 수동 등록 시 기존 검수 ID를 반환하고 새
  후보를 만들지 않은 채 해당 상세 화면으로 안내하도록 개선
- URL 해시 조각이 달라도 같은 출처·주소로 정규화되어 중복 차단되는지
  PostgreSQL 통합 검증 추가
- 로그아웃 상태로 하위 관리자 경로에 접근하면 로그인 후 원래 경로로
  복귀하도록 관리자 Layout 인증 리디렉션 개선
- 실제 `/admin/reviews/new` 요청의 307 로그인 리디렉션과 복귀 URL 보존
  확인
- 서울·경기 공식 홈페이지 후보 5곳을 추가로 조사해 사업자 표기, 한 개의
  사무소 소재지, 대표 전화, robots와 JSON-LD 구조를 비교
- 대용량 Imweb 응답, 현재 응답 한도 초과, `OnlineStore`·`Organization`
  유형 또는 JSON-LD 부재 사이트를 자동 수집 설정에서 제외
- 기존 후보를 포함해 공식 최소 사실 필드는 확인했지만 자동 수집이 부적합한
  초기 9곳을 `manual_candidate`로 분리하고 입력 직전 재확인 조건을 문서화
- 수동 후보 등록에서 공식 운영 주체·정확한 한 개 사무소와 민감정보 미포함
  확인을 HTML뿐 아니라 서버 도메인 규칙으로 강제하고 누락 거부 검증 추가
- `manual_candidate` 중 리앤장·호시탐탐의 단일 사무소와 대표번호를 공식
  페이지에서 재확인해 최소 사실 필드 수동 입력 준비 후보로 좁힘
- 전국 지점과 서로 다른 대표번호가 한 페이지에 섞인 디텍티브코리아·정암은
  업체 1건·사무소 1곳 원칙에 맞지 않아 `deferred`로 되돌리고 등록 금지
- 실제 출처별 검수 상태·감사 작업 수·처리자 역할 유효성과 업체 상태별
  건수를 민감값 없이 출력하는 읽기 전용 DB 점검 명령 추가
- 지속형 개발 DB에 누락됐던 `submitted_by_actor_id` migration을 기존 데이터
  보존 상태로 적용하고 멱등 seed·수집기 최소 권한 재적용 완료
- 읽기 전용 점검에서 `jsonld-v1`은 `on_hold`·감사 1건·권한 유효,
  `jsonld-v2`는 `pending`·감사 0건, 운영 업체 0건임을 재확인
- 서울·경기 공식 후보 8곳을 추가 조사해 robots, TLS, 응답 크기, JSON-LD,
  단일·복수 지점과 다른 업체 정보 혼입 여부를 비교
- 추가 조사 후보를 `manual_candidate` 4곳, `deferred` 3곳, TLS 인증서
  만료 `blocked` 1곳으로 분류하고 자동 수집 설정에는 추가하지 않음
- 같은 공식 페이지에 주소가 다른 본점·지점이 있으면 사무소별 후보 등록을
  허용하고 같은 URL·주소 조합만 중복 차단하도록 수동 등록 규칙 보완
- PostgreSQL MVP 복구 목표를 RPO 24시간·RTO 4시간으로 정하고 자동 백업,
  migration 전 논리 백업, 암호화·접근·보존과 운영 복구 절차 문서화
- 합성 업체·수집·검수·감사 데이터를 `pg_dump` custom archive로 백업하고
  빈 DB에 복원한 뒤 migration·seed·관계·제약을 확인하는 리허설 자동화
- 2026-07-29 실제 Clerk 개발 설정과 파일럿 검수 상태를 읽기 전용으로
  재확인해 `jsonld-v1 on_hold`, `jsonld-v2 pending`, 운영 업체 0건 유지
- J&K·정의·원픽과 엠디탐정 본점·수원점의 공식 원문을 2026-07-30 다시
  확인하고 다섯 사무소의 수동 입력 준비 완료
- 정의의 전국지사는 주소 없는 협업 연락망이므로 별도 지점 후보에서 제외하고,
  J&K 협력자 정보·원픽 홍보 콘텐츠·엠디탐정 본점 직통번호 등 비필수 필드를
  입력하지 않도록 출처별 경계 보완
- 경기 공식 후보 네 곳과 기존 소나무 후보를 추가 조사해 다해 화성 본사만
  `manual_candidate`, 오케이·백두산·소나무는 접근 불안정 `deferred`,
  윈윈은 AI 사용자 에이전트 명시 차단 `blocked`로 분류
- 다해의 인천 하위 도메인명과 다른 지역 자산을 사무소 소재지로 사용하지 않고
  공식 푸터의 화성 본사 한 곳만 수동 재확인하도록 출처 경계 기록
- 2026-08-05 Clerk 개발 설정의 `test` 키 조합·관리자 1명을 값 노출 없이
  재검증하고, 파일럿 `jsonld-v1 on_hold`·`jsonld-v2 pending`·운영 업체
  0건과 기존 감사 처리자 권한 유효 상태 유지 확인
- 서울 공식 후보 다섯 곳을 추가 조사해 내일·명진·김전일 서울지점을
  `manual_candidate`, 더PIA를 접근 정책 불명확 `deferred`, 베테랑을 AI
  사용자 에이전트 명시 차단 `blocked`로 분류
- 명진 주소 호수의 최근 색인·현재 원문 불일치와 김전일 부산 본점·서울 지점
  분리 조건을 기록하고 입력 직전 추가 근거 확인 대상으로 지정
- 이용 안내, 개발 단계 개인정보 처리방침과 광고 표시 정책을 공개 Server
  Component 페이지로 추가하고 모든 공개 화면 푸터에서 접근 가능하게 연결
- canonical 기준 origin 환경변수와 홈·목록·상세·안내 페이지 canonical,
  필터 결과·정정 폼의 `noindex` 정책 구현
- 관리자·API·로그인 경로를 제외하는 `robots.txt`, 공개 업체와 정적 안내
  페이지만 포함하는 동적 `sitemap.xml` 구현
- 업체 상세에 화면에서 확인 가능한 상호·전화·주소·소개만 사용하는
  `LocalBusiness` JSON-LD를 추가하고 `<` 문자를 이스케이프해 삽입
- Playwright Test와 설치된 Google Chrome 기반 데스크톱·모바일 프로젝트,
  production build·서버 자동 실행, 실패 screenshot·trace 보존 설정 추가
- 홈·안내 페이지 3종의 HTTP 200·핵심 내용·canonical·가로 넘침·browser 오류,
  robots 공개/제외 규칙과 로그아웃 관리자 307·복귀 경로를 12개 E2E
  시나리오로 구현
- 모바일 production E2E 6건과 개발 서버에서 먼저 통과한 데스크톱 5건,
  production으로 재확인한 데스크톱 홈 1건을 통과해 모든 시나리오의 성공
  근거 확보. 초기 개발 서버 병렬 컴파일의 transient manifest 오류를 확인해
  production build와 단일 worker를 기본 실행 경계로 고정
- Next.js와 `eslint-config-next`를 16.2.11에서 16.3.0으로 업데이트하고 기존
  `proxy.ts`·비동기 요청 API·ESLint CLI·Turbopack 설정이 호환됨을 확인해
  별도 codemod 없이 lint·production build·E2E 12건을 재통과
- Next.js 업데이트로 production 경로의 간접 `postcss`·`sharp` 취약점을 해소해
  2026-08-06 `npm audit --omit=dev` 0건 확인
- PostgreSQL 17 임시 클러스터의 migration·seed·production 서버·Chrome을
  한 명령으로 준비하고 성공·실패 시 모두 자동 정리하는 공개 웹 DB E2E 추가
- 합성 공개 업체로 강남·가족 필터 목록, 상세 필드·공식 출처, 상세 조회와
  전화 클릭 API `204`, 일별 집계 1건씩, 정정 폼 성공 화면과 `pending/high`
  검수 후보 저장, 승인 전 공개 주소 불변을 브라우저/API/DB에서 통과
- 기존 DB 비의존 production E2E 12건도 재통과해 전체 회귀 범위 유지
- Clerk 공식 Playwright helper와 Backend SDK를 추가하고 allowlist 관리자
  이메일은 테스트 실행 중에만 조회해 저장·로그 출력 없이 세션 준비
- 실제 관리자 세션으로 수동 후보 등록, 제출자 ID, URL 해시 조각 중복 차단,
  반려 감사 처리자·사유, 운영 업체 0건과 로그아웃 후 307 리디렉션을
  production Chrome·임시 PostgreSQL에서 통과
- 강제 수정 없이 개발 의존성의 `js-yaml`과 `brace-expansion` 호환 패치를
  적용해 전체 감사의 높음 취약점을 0건으로 정리하고 production 감사 0건 유지
- 실제 로그인한 allowlist 관리자가 `jsonld-v1` 주소 중복 결함 후보를
  `on_hold`에서 `rejected`로 전환하고, 브라우저 Server Action 성공과 감사
  결정 순서 `on_hold,rejected`, 반려 사유, 처리자 권한 유효를 확인
- 반려 후에도 교정 `jsonld-v2 pending` 1건과 운영 업체 0건이 유지됨을
  지속형 개발 PostgreSQL에서 재확인
- 파일럿 공식 홈페이지를 2026-08-08 다시 확인해 HTTP 200, 37,614 byte,
  `ProfessionalService` 1건과 제안 상호·전화·주소 일치, robots 전체 허용 유지 확인
- 실제 로그인한 allowlist 관리자가 `jsonld-v2` 교정 후보를 승인해
  `approved` 감사 상태와 처리자 권한 유효, 대표 출처 1건·필드 근거 7건,
  서울 강북구·업무 분야 4개를 연결한 `published` 업체 1건 확인
- 공개 상세 `/offices/mugunghwa-detective-gangbuk`의 HTTP 200과 상세 조회
  분석 요청 HTTP 204를 실제 개발 서버에서 확인
- 신규 업체 승인 폼의 소재 지역을 `시·도`와 `시·군·구` 두 단계로 분리하고
  경기도 일반구를 `시 / 구`로 표시하도록 변경. 대표 출처 유형은 중첩된
  셀렉트 대신 기본값이 명확한 5개 라디오 선택지로 변경하고 PostgreSQL 옵션
  통합 검증·lint·production build를 통과
- 리앤장·호시탐탐 수동 등록 직전 출처를 재검증한 결과, 리앤장은 DNS
  `NXDOMAIN`, 호시탐탐은 호스팅 `사이트 기간 만료`와 복수 사무소 주소가
  확인돼 두 후보를 `deferred`로 전환하고 관리자 등록·DB 변경을 중단
- J&K·정의·원픽·엠디탐정 공식 홈페이지의 HTTP 응답·robots·상호·대표번호·
  사무소별 주소를 2026-08-09 재확인하고 J&K·정의·원픽·엠디 본점·수원점
  5건을 실제 Clerk 관리자 세션과 Server Action으로 수동 등록
- 등록 결과 5건 모두 `manual_admin/manual-v1`, `pending/new_office/high`,
  제출자 allowlist 유효, 감사 작업 0건·운영 업체 연결 없음이며 공개 업체
  1건이 유지됨을 독립 DB 점검으로 확인
- 정상적인 8자리 전국 대표번호 `15xx`·`16xx`·`18xx`가 수동 후보 서버
  검증에서 거부되던 결함을 수정하고 `1800-6624` 정규화와 기존 전화번호·
  중복·복수 지점·미공개 경계를 PostgreSQL 회귀 검증으로 확인
- J&K·정의·원픽·엠디 본점·수원점의 최하위 소재 지역과 공식 페이지에
  명시된 관리형 업무 분야만 보수적으로 연결하고 대표 출처 유형을
  `official_website`로 지정해 실제 Clerk 관리자 UI에서 5건 모두 승인
- 다섯 검수 항목의 `approved` 감사 처리자 권한, 필드·업무 분야별 출처 근거,
  `published` 운영 업체 6건과 다섯 공개 상세 HTTP 200, 브라우저 오류 0건을
  UI·Server Action·독립 DB 점검으로 확인
- 등록 단계와 승인 단계의 전화번호 규칙이 달라 전국 대표번호 승인이
  실패하던 결함을 공통 국내 전화번호 정규화 함수로 통합하고 승인 회귀 추가
- 같은 공식 URL을 주소가 다른 복수 지점이 공유할 때 두 번째 승인을 막던
  전역 출처 차단을 제거해 현재 데이터 모델의 업체별 URL 고유 범위와
  일치시켰으며, 동일 URL·별도 주소 두 사무소 연속 승인 회귀를 추가
- 남은 `manual_candidate` 10곳의 정규 홈페이지와 robots 응답, 공식 상호·
  대표번호·한 개 사무소 주소를 2026-08-10 다시 확인하고 지니·다해결·명가·
  반딧불·시몬·트래커·내일·김전일컴퍼니 서울지점 8곳의 입력값을 확정
- 다해 화성 본사는 공식 페이지와 robots 재접속이 timeout이고, 명진은 현재
  HTML의 관악구 구조화 주소와 동작구 푸터 주소가 충돌해 두 곳 모두 수동
  등록하지 않고 `deferred`로 전환
- Clerk 공식 테스트 세션과 실제 allowlist 관리자 화면·Server Action으로
  8건을 `manual_admin/manual-v1`, `pending/new_office/high` 비공개 후보로 등록
- 독립 DB 점검에서 신규 8건의 제출자 권한 유효·감사 작업 0건·운영 업체 연결
  없음, 기존 수동 승인 5건과 `published` 업체 6건 불변을 확인
- 지니·다해결·명가·반딧불·시몬·트래커·내일·김전일컴퍼니 서울지점의
  최하위 소재지와 공식 페이지에 명시된 관리형 업무 분야만 연결하고 대표
  출처 유형을 `official_website`로 지정해 실제 Clerk 관리자 UI에서 8건 승인
- 신규 8건 각각의 `approved` 감사 작업 1건, 제출자·처리자 권한, 필드·업무
  분야별 출처 근거와 운영 업체 연결을 확인하고 공개 업체 총 14건과 신규
  공개 상세 8건의 HTTP 200을 독립 점검으로 확인
- 다해 화성 본사의 홈페이지·robots는 다음 순위 재확인에서도 timeout이었고,
  명진은 HTTP 200이지만 관악구 구조화 주소와 동작구 푸터 주소가 계속 충돌해
  두 후보 모두 `deferred`와 미등록 상태를 유지
- 신규 공식 홈페이지 10곳의 robots·HTTP 상태·운영 주체·서울/경기 사무소·
  사업상 대표번호와 주소를 조사하고 6곳을 수동 입력 가능 후보로 확정
- 오앤·고려·진짜·디테일·한국사설탐정협회·VIP 6곳을 Clerk testing token과
  실제 allowlist 관리자 화면·Server Action으로 `pending/new_office/high` 등록
- 독립 DB 점검에서 신규 6건의 제출자 권한 유효·감사 작업 0건·운영 업체
  미연결, 전체 수동 후보 19건과 `published` 업체 14건 불변을 확인
- 승인 시점의 여섯 공식 페이지가 모두 HTTP 200인지 다시 확인하고, 오앤·진짜·
  디테일·한국사설탐정협회·VIP의 최하위 소재지와 원문에 직접 명시된 관리형
  업무 분야만 연결해 대표 출처 유형을 `official_website`로 지정
- 한국사설탐정협회 후보는 제안된 합성 명칭 대신 공식 푸터의 운영 주체명으로
  `approved_with_edits` 처리하고, 나머지 네 승인 후보는 `approved` 처리
- 고려 공식 HTML은 같은 소재지를 `a동 720`과 `B동 720호`로 동시에 표시해
  고위험 주소를 확정할 수 없으므로 사유와 관리자 처리자를 남겨 `on_hold` 처리
- 실제 Clerk testing token과 allowlist 관리자 화면·`approveReviewAction`·
  `holdReviewAction`을 사용했으며 SQL 직접 삽입이나 권한 우회 없이 5곳 공개
- 독립 DB 점검에서 다섯 승인 후보별 감사 작업 1건, 유효한 관리자 처리자,
  대표 출처 1건, 이름·전화·주소·업무 분야별 근거와 공개 상세 HTTP 200을 확인.
  수동 후보는 `approved` 17건·`approved_with_edits` 1건·`on_hold` 1건,
  `published` 업체는 총 19건
- 별도 J&K 도메인은 robots의 GPTBot 명시 차단 확인 즉시 추가 접근을 중단하고
  기존 승인 업체와 중복되어 미등록, 별도 무궁화 연결 사이트는 운영 주체가
  혼재해 미등록, 소나무 DNS 실패와 호시탐탐 만료 페이지도 보류 유지
- 다음 공식 홈페이지 6곳의 현재 HTTP·robots·운영 주체·최소 사실 필드를
  비교하고 흥신소 굿탐정 화성 본사·굿파트너·한마음·착한탐정 4곳을 실제
  Clerk 관리자 화면·Server Action으로 `pending/new_office/high` 등록
- 독립 읽기 전용 DB 점검에서 신규 4건의 제출자 권한 유효·감사 작업 0건·
  운영 업체 미연결, 전체 수동 후보 23건과 `published` 업체 19건 불변을 확인
- 공존은 충남 천안 소재라 MVP 범위 밖으로, LIRA는 같은 공식 도메인의 현재·
  이전 페이지가 운영 법인과 사업자번호를 다르게 표시해 `deferred`로 미등록
- 승인 직전 네 공식 홈페이지 HTTP 200과 상호·대표전화·주소·업무 안내를 다시
  대조하고 흥신소 굿탐정은 경기 화성 동탄, 굿파트너는 서울 중랑, 한마음은
  서울 노원, 착한탐정은 서울 은평의 최하위 소재 지역으로 지정
- 공식 원문에 직접 명시된 관리형 업무 분야만 보수적으로 연결하고 대표 출처를
  `official_website`로 지정해 실제 Clerk 관리자 폼·`approveReviewAction`에서
  네 후보를 모두 제안값 그대로 승인·공개
- 독립 DB 점검에서 각 승인 건의 감사 처리자·대표 출처 1건·이름·전화·주소와
  모든 업무 분야의 근거를 확인하고 공개 상세 4건의 HTTP 200·브라우저 오류
  0건을 production Chrome에서 확인. 수동 후보는 `approved` 21건·
  `approved_with_edits` 1건·`on_hold` 1건, 공개 업체는 총 23건
- 새 공식 출처 묶음의 robots와 현재 홈페이지를 다시 확인해 탐정사무소 DSI·
  에이원흥신소·넘버원 탐정사무소 3곳의 서울 단일 사무소·사업상 대표번호를
  실제 Clerk 관리자 폼으로 `pending/new_office/high` 후보 등록
- 신규 3건의 제출자 권한 유효, 감사 작업·운영 업체 연결 0건과 전체 수동 후보
  26건·공개 업체 23건 불변을 production Chrome과 독립 DB 쿼리로 확인하고
  일회성 등록 자동화 제거
- 바른기획은 기존 공개 VIP와 대표자·사업자번호·마포 주소가 같은 별도 브랜드라
  중복 미등록, 리셋은 인천 소재라 MVP 밖, 호시탐탐은 실제 홈페이지 만료 화면이
  유지돼 보류
- 승인 직전 세 공식 홈페이지·robots HTTP 200과 등록된 최소 사실 필드·업무
  안내를 재확인하고, DSI는 서울 중랑과 5개 관리형 업무 분야, 에이원은 서울
  강남과 가족·사람 찾기·증거·사실 확인·개인 피해 대응, 넘버원은 서울 서초와
  가족·사람 찾기·증거·사실 확인으로 분류
- 실제 Clerk 관리자 상세 폼의 제안값 그대로 승인·공개를 실행하고, 세 후보의
  유효한 감사 처리자·대표 출처·필드별 근거와 공개 상세 HTTP 200·브라우저 오류
  0건을 확인. 수동 후보 `approved` 24건·`approved_with_edits` 1건·`on_hold`
  1건·`pending` 0건, 공개 업체 총 26건
- 다음 공식 도메인 6곳의 robots를 홈페이지보다 먼저 확인하고, 접근 가능한
  PIS·전국명품탐정·루미노케이·쌍용의 운영 주체·사업상 대표번호·서울/경기의
  한 개 사무소 주소를 현재 공식 원문에서 대조. DNS가 해석되지 않은 위너는
  미등록하고, 기존 무궁화 도메인을 sitemap으로 가리키는 별도 사이트는 기존
  중복·운영 관계가 확정될 때까지 `deferred` 유지
- 실제 Clerk allowlist 관리자와 `/admin/reviews/new` Server Action으로 4건을
  `manual_admin/manual-v1`, `pending/new_office/high`로 등록. 독립 DB 점검에서
  유효한 제출자, 감사 작업 0건, 운영 업체 미연결과 정확한 제안값을 확인하고
  공개 업체 26건 불변·수동 후보 총 30건을 확인. 재실행 안전성을 확인한 일회성
  등록 자동화는 제거
- 승인 직전 PIS·전국명품탐정·루미노케이·쌍용의 robots와 공식 원문 HTTP 200,
  최소 사실 필드와 업무 안내를 재확인. PIS는 서울 강남의 가족·증거·개인 피해,
  전국명품탐정은 서울 강남의 가족·개인 피해, 루미노케이 서울본부는 서울 송파의
  5개 관리형 업무 분야, 쌍용은 경기 고양 일산동의 외도·증거로 보수적 분류
- 실제 Clerk 관리자 상세 폼과 `approveReviewAction`으로 4건을 제안값 그대로
  사용자 위임 일괄 승인. 감사 사유에 위임 방식을 명시하고, 독립 DB에서 유효한
  감사 처리자·대표 출처·이름/전화/주소/업무 분야별 근거를 확인. production
  Chrome 공개 상세 4건의 HTTP 200·표시값·출처 링크·브라우저 오류 0건을 확인해
  공개 업체 30건, 수동 후보 `approved` 28건·`approved_with_edits` 1건·
  `on_hold` 1건·`pending` 0건으로 마감
- 다음 공식 출처 9곳의 robots·DNS·TLS와 현재 원문을 조사해 차단 1곳, robots
  403 1곳, DNS 실패 2곳, TLS 만료 1곳, 공식 주소 충돌 1곳을 미등록 처리하고
  다해결·반딧불 2곳은 기존 공개 데이터 중복임을 확인
- 럭스 서울 본사의 공식 상호·전국 대표번호·단일 주소와 업무 안내를 승인 직전
  재확인하고 실제 Clerk 관리자 후보 등록→제안값 승인·공개를 한 작업에서 완료.
  유효한 제출자·감사 처리자, 대표 출처, 필드 근거 6건과 공개 상세 HTTP 200·
  브라우저 오류 0건을 독립 검증해 지속형 개발 DB 공개 업체 31건, 수동 후보
  `approved` 29건·`approved_with_edits` 1건·`on_hold` 1건·`pending` 0건 확인
- 기존 공개 운영 DB의 레코드를 덮어쓰지 않고 검수 DB의 신규 `published` 그래프만
  추가하는 `db:promote-public-data` 명령 구현. source·target 분리, owner direct·
  TLS·채널 바인딩, 명시적 확인 문자열과 대상/신규 예상 수량을 강제하고 dry-run은
  실제 삽입·전체 검증 뒤 rollback
- 격리 PostgreSQL 17에서 예상 수량 오류·dry-run rollback, 신규 1건 원자적 추가,
  재실행 0건, 기존 공개 그래프 불일치·대상 전용 공개 업체·slug 충돌 전체 rollback,
  비공개 검수·수집 데이터 불변과 빈 대상 bootstrap 회귀를 통과
- 모든 경로에 HSTS, MIME sniffing·framing 차단, referrer·브라우저 기능 제한,
  최소 CSP와 opener 정책의 출시 기본 보안 헤더를 적용하고 production 응답을
  데스크톱·모바일 Chrome에서 확인
- 루트 레이아웃에 첫 키보드 포커스로 노출되는 `본문으로 건너뛰기` 링크와
  포커스 가능한 본문 대상을 추가하고 양쪽 Chrome 프로젝트에서 이동을 검증
- 실제 Clerk 관리자 E2E를 반려뿐 아니라 보류와 승인·공개까지 확장해 검수
  상태·감사 작업·운영 업체·대표 출처·필드 근거 4건·공개 상세를 임시
  PostgreSQL과 production 서버에서 검증
- 동일 Clerk 사용자를 테스트 서버에서 reviewer allowlist로만 매핑해 검수
  대기열·수동 후보 화면 HTTP 200과 `검수자` 역할 표시를 실제 세션으로 검증
- 관리자 E2E 정리 범위를 전체 수동 후보에서 고정 합성 URL·slug와 그 분석
  이벤트·일별 집계로 제한해 지속형 DB를 대상으로 잘못 실행해도 기존 검수
  데이터를 일괄 삭제하지 않도록 안전 경계 보강
- 공개·관리자 DB E2E의 production 빌드를 각 격리 실행당 한 번으로 통합하고,
  공개 출시 14건·DB 사용자 흐름 1건·Clerk 관리자 4건·reviewer 2건을 통과
- Neon Free와 Supabase Free의 최신 공식 용량·비활성 동작·pooling·백업 조건을
  비교하고, 비용 없는 출시 리허설 후보는 Neon Free로 제안하되 6시간 복원
  이력이 14일 백업 정책에 미달하므로 공개 운영 확정과 분리
- 웹 runtime pooled `DATABASE_URL`, 신뢰된 배포 환경의 direct
  `DATABASE_MIGRATION_URL`, 별도 수집기 자격 증명과 Production·Preview 분리
  계약을 운영 PostgreSQL runbook과 제안 ADR로 문서화
- `node-postgres` 풀을 인스턴스당 기본 5개·연결 5초·idle 30초·수명 5분으로
  제한하고 지원 서버의 채널 바인딩과 idle client 오류 처리를 추가
- 비밀값을 출력하지 않고 Production URL의 TLS·역할/DB 분리·pool 상한·HTTPS
  origin을 검사하는 사전검증과, 실제 PostgreSQL 17·TLS·migration·최소 권한을
  읽기 전용으로 확인하는 연결 검증 명령 추가
- Vercel Hobby의 단일 Function 리전을 Neon Singapore 후보와 맞추는 `sin1`
  프로젝트 설정 추가
- migration 소유자 자격 증명으로 runtime 최소 DML 역할과 별도 read-only
  backup 역할을 멱등 생성·비밀번호 회전하고 `public` schema 생성 권한을
  회수하는 운영 역할 구성 명령 추가
- 운영 설정·연결 검증을 runtime·migration뿐 아니라 backup direct URL과 역할
  분리, 모든 현재 테이블의 read-only·DML 부재 확인까지 확장
- GitHub Actions에서 매일 02:23 KST에 PostgreSQL 17 custom dump를 `age`
  공개키로 암호화하고 SHA-256 manifest와 함께 14일 보존하는 예약 workflow,
  24시간 이내 artifact만 빈 격리 DB로 복원하는 수동 workflow 추가
- 암호화 archive를 15MiB에서 차단해 14개가 모두 상한이어도 약 210MiB로
  GitHub Free 500MB 공유 한도에 여유를 두고 예상 밖 과금을 조기 차단
- 공식 `age` v1.3.1 macOS ARM64 archive의 SHA-256을 대조한 임시 바이너리로
  합성 custom dump 44,876바이트를 암호화·복호화하고 빈 PostgreSQL 17에 0초
  복원한 뒤 migration·seed·관계·제약 검증 통과
- Vercel Hobby `detective-platform` 프로젝트를 GitHub 저장소와 연결하고
  Next.js Root Directory `apps/web`, Function 리전 `sin1` 설정 확인
- Vercel Marketplace에서 카드 없는 Neon Free `free_v3` Singapore 리소스를
  생성하고 direct 연결로 PostgreSQL migration 8.4초·seed 8.1초 실행 완료
- 로컬 검수 DB의 `published` 업체만 빈 운영 DB로 옮기는 초기 승격 명령 추가.
  지역·업무 분야는 안정 slug로 대상 seed에 매핑하고 업체 30건·출처 30건·
  필드 근거 185건·업무 분야 연결 95건을 한 트랜잭션으로 복사
- 격리 PostgreSQL에서 공개 데이터 승격 성공, 검수·수집·분석·광고 데이터
  0건 유지, 두 번째 실행 거부와 테스트 DB 정리를 확인
- PostgreSQL 17 비수퍼유저 `CREATEROLE`의 멱등 비밀번호 회전에서 수퍼유저
  전용 속성을 재지정하지 않도록 역할 구성기를 교정하고, runtime·backup 역할의
  superuser·role/database 생성·replication·RLS 우회 권한 부재를 실제 Neon에서 확인
- Neon Proxy가 client TLS를 종료해 backend `pg_stat_ssl`에 암호화 상태가
  표시되지 않는 경우를 지원하도록 TLS 검증을 client socket까지 확장. 실제
  direct·pooled 연결에서 암호화, 인증서 승인과 peer 인증서를 확인
- `detective_runtime` pooled URL과 인스턴스당 풀 상한 5를 Vercel Production
  sensitive 변수로 저장하고 `detective_backup` direct URL을 GitHub Actions
  `PRODUCTION_DATABASE_BACKUP_URL` secret으로 저장
- 실제 빈 Neon DB에 공개 업체 30건·출처 30건·필드 근거 185건·업무 분야 연결
  95건을 원자적으로 승격하고 검수·수집·분석·광고 테이블 0건 유지 확인
- 최종 runtime 역할로 PostgreSQL 17, 공개 업체 30건, 최소 권한과 인증서 TLS를
  재확인하고 활성 compute 기준 연결·조회 590ms 측정
- runtime·backup 비밀번호를 다시 회전하고 실제 Neon에서 역할 분리·TLS·최소
  권한을 재검증한 뒤 Vercel Production과 GitHub Actions의 최소권한 secret 갱신.
  Vercel Sensitive 값은 `env pull`에서 `[SENSITIVE]`로 비공개 처리된다는 운영
  주의를 기록하고 임시 owner 연결을 다시 제거
- DB 접근 5분 30초 중단 후 runtime pooled 첫 연결·공개 30건 조회 1,808.2ms,
  즉시 후속 새 연결·동일 조회 524.6ms 측정. 활성 표본은 593.6ms였으며 실제
  Vercel Function 왕복 지연과 구분
- GitHub repository가 public이고 Actions 활성임을 확인. 표준
  `ubuntu-24.04` runner 실행 시간은 무료지만 artifact는 Actions·Packages
  500MB 공유 한도를 사용하므로 계정 Actions 예산을 0원 초과 사용 중지로
  설정하고 포함 사용량 알림 `On`·billable usage 0원을 확인
- repository Actions를 GitHub 소유 action만 허용하는 `selected` 정책으로
  제한하고 전체 40자리 commit SHA 고정을 필수화. 현재 action 4개가 모두
  `actions/*`와 SHA 고정을 충족하고 기본 `GITHUB_TOKEN`은 read-only·PR 승인
  불가임을 확인. artifact·log repository 기본 보존은 90일에서 14일로 축소
- 백업 client와 격리 복원 service의 Docker Official Image
  `postgres:17-alpine`을 Linux amd64·arm64 포함 multi-arch OCI digest로 고정해
  tag 이동에 따른 무검토 실행 변경 차단. workflow YAML·action SHA·image 참조
  정적 검증과 로컬 PostgreSQL 17 합성 암호화 백업 44,870바이트→빈 DB 0초
  복원·`db:verify`를 재통과했으며 실제 GitHub backup·restore에서도 고정 digest
  image pull과 실행을 확인
- PR과 `main` push용 비밀 없는 quality workflow 추가. Node.js 24 lockfile 설치,
  인증·Production DB 설정 self-test, lint, webpack production build와 Python
  3.13 `uv` lockfile 설치·compileall·단위 테스트 16건을 별도 standard runner
  job으로 구성하고 로컬 동일 명령 통과
- GitHub Actions 정책 회귀 스크립트를 추가해 모든 workflow의 명시적 권한,
  `actions/*` 전체 SHA 고정, `ubuntu-24.04` standard runner, PostgreSQL image
  digest와 `pull_request_target` 금지를 검사. checkout credential 저장도 비활성화
- PR #1 커밋 `e7681b3`의 첫 `Quality checks`에서 collector unit tests 11초,
  web self-test·lint·build 59초로 실제 GitHub standard runner 통과
- `main` branch protection에 PR 경유, 최신 base 기준 GitHub Actions 앱의
  `Web lint, self-tests, and build`·`Collector unit tests`, 대화 해결을 필수화하고
  force-push·branch 삭제 차단. 현재 1인 운영에 맞춰 승인 0명·관리자 우회 허용
- Vercel Development의 `NEON_OWNER_*` 18개와 Marketplace 프로젝트 연결을
  제거하고, Neon Free 리소스 자체는 `Available`로 보존. owner/runtime 임시
  환경 파일과 일회성 검증 스크립트 삭제 확인
- 공식 `age` v1.3.1 macOS ARM64 archive의 SHA-256을 다시 대조하고 새 X25519
  키쌍의 암·복호화 왕복과 identity 파일 권한 `0600`을 확인. 공개 recipient는
  GitHub variable `DATABASE_BACKUP_AGE_RECIPIENT`, 비공개 identity는 Actions
  secret `DATABASE_BACKUP_AGE_IDENTITY`에 값 노출 없이 저장하고 로컬 임시
  바이너리·키·평문·암호문을 모두 폐기
- 전체 작업 브랜치를 `main` 대상으로 한 GitHub PR #1로 만들고 병합 가능 상태
  `MERGEABLE/CLEAN`과 Vercel Preview 배포 `Ready`를 확인. 제한 없는 Vercel
  빌드 환경에서 기본 Next.js production build를 통과했으며 Preview 경로는
  Vercel SSO 보호에 따라 비로그인 HTTP 요청에 302를 반환
- Vercel 배포 기록을 재점검해 작업 브랜치 `1f37e7c`의 Production 리허설 배포
  `Ready`와 public alias를 확인. 런타임 로그에서 전체 500 원인이 Clerk
  publishable key 누락임을 특정하고 `NEXT_PUBLIC_SITE_URL`, 로그인 경로와
  fallback 경로를 Production 비민감 변수로 추가
- Clerk 키가 없거나 배포 환경에 맞는 test/live 쌍이 아니면 공개 경로는 계속
  제공하고 `/admin`·`/sign-in`·`/__clerk`만 503으로 닫는 fail-closed proxy
  경계 추가. Clerk 미설정 production build, 공개 홈·안내·robots HTTP 200,
  관리자·로그인 503과 `no-store`·`Retry-After`·`noindex` 헤더를 확인하고 정상
  Development test 키의 production E2E 14건도 재통과
- PR #1을 merge commit `a3bc11b`로 `main`에 병합하고 push 기반 quality
  workflow의 수집기 9초·웹 52초 성공 확인
- 최초 실제 Neon backup 과정에서 PostgreSQL 17 컨테이너의 시스템 CA 누락,
  공급자 관리 `neon_auth` 포함과 Drizzle migration table·sequence 최소 권한
  누락을 확인해 시스템 CA 사용, `public`·`drizzle` schema 한정과 read-only
  권한 계약으로 교정. 임시 Neon owner 연결과 파일은 권한 적용 직후 제거
- 실제 backup run `31608256000`에서 60,965바이트 `age` 암호화 artifact를
  생성하고 2026-08-26 만료를 확인. restore run `31608856556`에서 복구 지점
  0.11시간, 순수 복원 2초·전체 workflow 1분 6초로 빈 PostgreSQL 17 복원,
  schema·migration·제약·seed와 공개 업체 30건의 대표 출처·필드 근거·업무
  분야 연결 무결성을 통과
- 수정 PR #2를 `main`에 merge commit `9419059`로 반영하고 병합 후 quality
  수집기 13초·웹 46초 통과. `main` backup run `31609500182` 44초와 restore
  run `31609617458` 41초에서 recovery point 0.02시간·순수 복원 1초·공개 업체
  30건을 재확인하고 artifact 2개·총 121,930바이트 확인
- PR #4를 `main`에 merge commit `5af0d43`으로 반영하고 병합 후 quality run
  `31611761927` 성공과 Vercel Production `Ready`, Function `sin1`·Node.js 24를
  확인. Production 환경변수 이름을 값 노출 없이 점검해 DB·canonical·로그인
  경로 5개는 존재하고 Clerk live 키·Production 역할 ID는 없음을 확인
- Vercel 인증 우회 smoke에서 최신 Production 홈 HTTP 200, `/admin/reviews`와
  `/sign-in` HTTP 503 확인. 연결된 custom domain 0개를 확인하고 외부 DNS나
  공개 alias는 변경하지 않음
- Production 인증 사전검증에 경로 없는 HTTPS 소유 custom domain 계약을
  추가해 `*.vercel.app`을 거부하고 합성 live 키 성공·Vercel 도메인 실패를
  self-test로 고정. 도메인·Clerk·환경변수·배포·smoke·롤백 순서를
  `docs/operations/PRODUCTION_RELEASE.md`에 추가
- 정정 요청 DB E2E를 정상 접수, 민감정보 확인 누락·위험 URL 서버 검증, 동일
  요청 중복, 업체별 24시간 10건 제한 4개 Production Chrome 시나리오로 확대.
  오류 시 추가 검수 후보 0건, 중복 1건 유지, 한도 초과 10건 유지와 브라우저
  오류 0건을 확인하고 실패 후 worker 재시작에도 합성 fixture가 멱등하도록 교정
- DB E2E 실행기의 `npm --prefix ... exec` 작업 디렉터리 오인을 CI와 같은
  `npm run build -- --webpack`으로 교정해 migration·seed·Production build·
  Chrome 4건을 한 번에 재통과
- `verify-vercel-production-smoke.sh`를 추가해 배포 보호를 유지한 채 실제 최신
  Production의 홈·목록·robots·sitemap HTTP 200, 관리자·로그인 HTTP 503과
  `Retry-After: 3600`·`X-Robots-Tag: noindex, nofollow`를 자동 검증
- 실제 Clerk 관리자 E2E에 공개 정정 접수→관리자 확인 출처 입력→승인→공개
  상세 반영 흐름을 추가. 관리자 5건·reviewer 2건을 통과하고 요청자 제안 URL
  미저장, 운영자 확인 비대표 출처·이름 필드 근거, 감사 처리자와 출처 스냅샷,
  공개 상호 변경을 임시 PostgreSQL·Production Chrome에서 확인
- 관리자 E2E 실행기도 잘못된 `npm --prefix ... exec` 빌드 경계를 CI와 같은
  `npm run build -- --webpack`으로 교정해 재현 가능한 작업 디렉터리를 사용
- 첫 자동 예약 backup run `31626377060`이 2026-08-13 `main` commit
  `c15ba10`에서 모든 단계를 통과. 02:23 KST 예약은 GitHub에서 03:11 KST에
  시작해 약 1분 뒤 완료됐고, 60,101바이트 암호화 archive를 포함한
  60,965바이트 artifact를 14일 보존으로 업로드. 현재 artifact는 3개·총
  182,895바이트이며 신규 artifact 만료는 2026-08-26 18:11 UTC
  (2026-08-27 03:11 KST)로 확인
- 예약 백업에 read-only GitHub artifact API 저장량 guard를 추가. 실행 전 활성
  백업 총량에 최대 16MiB 한 건을 예약해 400MiB repository 백업 상한을 넘으면
  DB 접근 전에 중단하고, 업로드 후 현재 run·attempt artifact가 정확히 한 건인지,
  양의 크기와 13~15일 보존인지 확인. 만료·무관 artifact 제외, 저장량 초과·
  재실행·보존기간 오류 self-test를 기본 quality workflow에 추가
- PR #9를 `main` merge commit `51dc014`로 반영하고 quality run
  `31667874403` 성공 확인. 실제 수동 backup run `31667893789`에서 사전 guard가
  기존 3개·182,895바이트를 확인한 뒤 read-only dump를 수행하고, 사후 guard가
  신규 60,965바이트 artifact의 14일 보존과 전체 4개·243,860바이트를 확인.
  신규 artifact는 2026-08-27 04:42 UTC(2026-08-27 13:42 KST) 만료 예정

## 다음 작업 후보

1. 저장량·보존 guard가 적용된 후속 02:23 KST 예약 백업의 연속 성공과 실제
   시작 지연을 추적한다. 첫 artifact의 2026-08-26 만료와 첫 14일간 artifact
   수·총 용량을 확인한다.
2. 소유한 custom domain을 준비해 Clerk Production 환경과 Google OAuth를
   구성하고 live 키·Production 관리자 ID를 Vercel에 저장한다. 최신 수정의
   Production 배포 후 보안 헤더·robots·sitemap·JSON-LD·로그인·공개/관리자
   핵심 흐름을 smoke 검증
3. 개인정보 처리방침의 운영 주체·문의 채널·보유 기간·위탁/국외 이전 여부를
   실제 인프라와 법무 검토 결과에 맞춰 확정
4. 초기 업체 약 100곳 확대를 계속한다. 공식 운영 주체·한 개 사무소·최소
   사실 필드와 업무 분야를 모두 확인한 건은 같은 위임 작업 안에서 등록→승인→
   공개 검증까지 완료하고 불확실한 건만 보류. 개발 DB의 신규 공개분은 별도
   최소 권한 Production 데이터 승격 작업에서 Neon에 반영
5. 고려 공식 사이트의 `a동 720`·`B동 720호` 주소 충돌이 정정되는지 나중에
   재확인하고, 하나의 공식 주소가 추가 근거와 일치할 때만 보류 후보 재검수
6. 다해 화성 본사의 접속 복구와 명진 공식 주소 정합성을 나중에 재확인하고,
   복구·정정된 경우에만 최소 사실 필드를 처음부터 다시 검수
7. 리앤장 DNS와 호시탐탐 홈페이지 복구 여부를 나중에 재확인하고, 복구된
   경우에만 운영 주체·대표번호·사무소별 주소를 처음부터 다시 검수

## 확정된 초기 데이터 모델

- 공개 업체 한 건은 하나의 실제 사무소 또는 지점이며 복수 지점은 별도 항목으로 관리
- 소재 지역 한 개와 대표 전화번호 한 개를 업체에 저장
- 주소는 표시 문자열과 검색용 지역 참조로 시작
- 지역 검색은 서비스 가능 지역이 아닌 검수된 소재지 기준
- 업무 분야는 개인 고객 중심의 다섯 가지 관리형 초기 분류 사용
- 업체 출처와 함께 필드별 출처 근거를 기록
- `draft`, `published`, `suspended`, `closed_suspected`, `archived` 공개 상태 사용

## 아직 하지 않는 일

- 사용자 회원가입 및 사용자 프로필
- 사건 내용 접수 또는 조사 대상자 정보 수집
- 채팅, 결제, 후기, 별점, 업체 순위
- 전화 연결 과금, 통화 내용 또는 녹취 저장
- Elasticsearch/OpenSearch, Spring Boot, 마이크로서비스 도입
- 관리자 승인 없는 자동 공개

## 주요 리스크

| 리스크 | 대응 |
| --- | --- |
| 정보가 오래되거나 잘못될 수 있음 | 출처·확인일을 저장하고 중요 변경은 관리자 재검수 |
| 공개 정보의 이용 조건이 서로 다름 | 출처별 접근 정책과 이용 조건을 확인하고 최소 필드만 수집 |
| 민감한 상담 내용이 유입될 수 있음 | 사건 접수 입력란을 만들지 않고 로그·분석 데이터도 최소화 |
| 광고가 순위로 오인될 수 있음 | 광고/강화 상품을 명확히 표시하고 기본 정렬과 분리 |
| 전화 클릭 지표가 품질 보증으로 오인될 수 있음 | 내부 운영 지표로만 사용하고 공개 순위를 제공하지 않음 |
| 개발 의존성 및 프레임워크 간접 패키지 취약점 | 강제 자동 수정 없이 영향과 상위 호환 패치를 추적하고 배포 전 재점검 |

## 현재 검증 제한

- migration과 seed는 PostgreSQL 17.10 임시·지속형 로컬 클러스터와 Neon Free
  Singapore에서 검증했다. runtime pooled·migration direct 연결과 독립 암호화
  백업 방식을 적용해 실제 첫 artifact 복원과 첫 자동 예약 실행까지 검증했다.
  첫 artifact의 실제 14일 만료와 두 번 이상의 연속 예약 실행은 아직 검증
  전이다. 지속형 로컬 DB는 Git 제외 개발 데이터이며 백업 대상이 아니다.
- Clerk Hobby Development 키와 실제 관리자 역할 설정, Google 로그인 세션,
  관리자 대기열·상세 접근과 보류 감사 처리는 확인했다. Clerk Hobby는
  애플리케이션 수준 MFA를 제공하지 않으므로 관리자 Google 계정의 2단계
  인증·패스키 활성화를 운영 통제로 사용하며 Clerk가 해당 수행 여부를
  기술적으로 증명하지는 않는다.
- 등록 파일럿 한 곳은 실제 이용 조건 표시·robots·구조를 확인하고 최소 권한
  로컬 개발 DB에 비공개 검수 후보를 적재했지만 사이트 운영자의 별도
  서면 허락은 받지 않았다. 최초 `jsonld-v1` 후보는 주소 지역명이 중복되어
  보류 후 반려했고 교정된 `jsonld-v2` 후보는 사람이 원문을 대조해 승인·공개했다.
  운영 DB 자격 증명·TLS·최소 권한과 첫 예약 실행은 검증했지만 두 번 이상의
  예약 실행 연속성과 알림 담당은 아직 검증하지 않았다.
- 분석 Client Component의 상세 표시·전화 클릭 네트워크 요청과 PostgreSQL
  집계는 합성 공개 업체의 production Chrome E2E로 검증했다. 의도적으로 수집하지
  않는 통화 앱 실행 성공과 실제 통화 성립은 검증 범위가 아니다.
- 공개 정정 폼의 정상 제출·성공 화면·검수 후보 저장과 승인 전 운영값 불변,
  민감정보 확인 누락·위험 URL·중복·속도 제한 화면은 production Chrome E2E로
  검증했다. 실제 Clerk 관리자 세션의 확인 출처 입력·정정 승인, 미검증 제안
  URL 미저장과 공개 상세 반영도 자동 브라우저·DB 경계에서 통과했다.
- 공식 출처 수동 후보 등록·중복 안내·반려 결정은 실제 allowlist 관리자 테스트
  세션과 production Chrome·임시 PostgreSQL에서 통과했다. 지속형 개발 DB의 실제
  수동 후보 31건은 testing token과 일회성 sign-in token으로 지역 2단계 선택·
  출처 유형·업무 분야·승인 또는 보류·공개 상세까지 통과했다. 최근 5건은
  사용자 위임 방식을 승인 사유에 명시했고 공개 상세까지 재검증했다. 이는 Google 로그인
  UI와 관리자 Google 계정의 2단계 인증 수행 자체를 증명하지 않는다. reviewer
  역할은 같은 실제 Clerk 사용자를 테스트 서버에서 reviewer allowlist로만
  매핑해 화면 접근과 역할 표시를 확인했으며, 별도 운영 reviewer 계정은 아직 없다.
- 수동 후보는 과거 확인만으로 등록하지 않는다. 2026-08-08 리앤장은 DNS
  `NXDOMAIN`, 호시탐탐은 사이트 기간 만료로 등록 직전 공식 원문 검증에
  실패해 두 후보를 만들지 않았다. DNS·호스팅 복구만으로 즉시 등록하지 않고
  최소 사실 필드와 호시탐탐의 본사·상담실 구분을 다시 확인해야 한다.
- 2026-08-10 추가 등록 후보 중 다해 화성 본사는 공식 페이지·robots 직접
  재접속이 timeout이고, 명진은 현재 공식 HTML의 관악구 구조화 주소와 동작구
  푸터 주소가 충돌해 다음 순위 재확인에서도 등록하지 않았다. 신규 8건은
  소재지·업무 분야·대표 출처를 별도 검수해 승인·공개했지만, 이 결과가 업체의
  서비스 품질이나 홍보 문구를 보증하지는 않는다.
- 같은 날 추가 조사한 10곳 중 6곳은 현재 공식 원문의 최소 사실 필드로 비공개
  후보를 만들고 별도 승인 검수를 수행했다. 5곳은 소재 지역·관리형 업무 분야·
  대표 출처를 확인해 공개했고, 고려 1건은 공식 HTML 내부 주소 충돌 때문에
  `on_hold` 상태다. 이 결과는 업체의 서비스 품질이나 홍보 문구를 보증하지 않는다.
- 다음 6곳 조사에서는 서울·경기와 공식 최소 사실 필드를 충족한 4곳만 비공개
  후보로 등록했다. 충남 소재 1곳과 공식 도메인 내 운영 주체가 충돌한 1곳은
  미등록했다. 신규 4건은 소재지·업무 분야·대표 출처를 별도 검수해 승인·
  공개했지만 이 결과가 업체의 서비스 품질이나 홍보 문구를 보증하지는 않는다.
- 2026-08-13 추가 공식 출처 조사에서는 접근 정책을 확인할 수 없거나 명시적으로
  차단된 사이트, DNS·TLS 장애, 공식 주소 충돌을 등록하지 않았고 기존 다해결·
  반딧불도 중복 생성하지 않았다. 럭스 서울 본사 1건만 공식 최소 사실과 업무
  분야를 최신 원문에서 확인해 Clerk 관리자 흐름으로 승인·공개했다. 지속형 개발
  DB의 31번째 업체이며 기존 Production 공개 그래프와 완전 일치를 확인한 증분
  승격으로 Neon에도 반영했다.
- 논리 백업·복구 리허설은 PostgreSQL 17 임시 클러스터와 합성 데이터에서
  통과했지만 운영 공급자의 자동 백업·시점 복구·암호화 키·네트워크 통제와
  실제 데이터 규모의 RPO·RTO는 아직 검증하지 않았다.
- Vercel Hobby와 Neon Free Singapore에서 migration·seed, 최소 권한
  runtime·backup 역할, 인증서 TLS, Production/GitHub 비밀 저장과 공개 30곳
  승격을 확인했다. 로컬 개발 장비에서 활성 593.6ms, 5분 30초 유휴 뒤 첫 요청
  1,808.2ms, 즉시 후속 요청 524.6ms를 측정했지만 실제 Vercel Function 왕복
  지연과 다중 표본의 분포를 대신하지 않는다.
- 실제 Neon에는 공개 필드와 근거만 승격했고 검수·감사·수집·분석 데이터는
  복사하지 않았다. 따라서 배포 직후 관리자 검수 대기열은 비어 있으며 향후
  수집기 운영 자격 증명과 Production 관리자 흐름은 별도로 준비해야 한다.
- GitHub Actions 암호화 백업·복원 workflow와 역할 구성은 구현했고 합성
  PostgreSQL 17 복원을 통과했다. 실제 Neon read-only URL, `age` recipient와
  identity를 GitHub secret·variable에 역할별로 저장했다. identity는 GitHub
  Actions에서만 사용할 수 있고 로컬 사본은 보존하지 않는다. 실제 artifact의
  복구 지점 0.11시간·순수 복원 2초로 현재 RPO·RTO 목표는 통과했지만, 키 회전
  시 새 키의 실제 복원을 다시 검증해야 한다. `main` 후속 백업·복원과 첫 자동
  예약 백업도 통과했지만, 두 번 이상의 예약 실행과 첫 artifact의 실제 14일
  만료를 확인하기 전에는 연속 운영 보존 달성으로 보고하지 않는다.
  repository 백업 artifact 400MiB guard는 Packages, 다른 repository와 GitHub
  계정 전체 공유 사용량을 합산하지 않으므로 계정의 0원 초과 사용 중지와 포함
  사용량 알림을 대체하지 않는다.
- 최신 `main`의 Vercel Production 배포는 `Ready`이고 Vercel 인증 우회 요청에서
  공개 홈 200, 관리자·로그인 경로 503을 반환해 fail-closed 수정이 실제 배포에
  반영됐음을 확인했다. 다만 배포 보호가 유지되고 custom domain이 0개이며
  Clerk live 키·Production 사용자 ID도 없어 공개 출시 상태는 아니다. 도메인
  구매·DNS와 Clerk Production 설정 뒤 실제 custom domain에서 전체 smoke를
  다시 통과해야 한다.
- 공개 안내·SEO 기술 기반은 lint와 production build를 통과했지만 개인정보
  처리방침의 운영 주체·문의 채널·최종 보유 기간·위탁 및 국외 이전 여부는 운영
  인프라와 법무 검토 후 확정해야 한다. production canonical origin 설정과 실제
  배포 URL의 robots·sitemap·JSON-LD 검색 도구 검증도 남아 있다.
- Playwright E2E는 DB 비의존 공개·SEO·보안 헤더·키보드 접근·로그아웃 인증
  14건, 임시 PostgreSQL 기반 공개 사용자 전체 흐름 1건, Clerk setup과 실제
  관리자 반려·보류·승인 공개 4건, reviewer 역할 2건을 production 서버에서
  검증한다. 관리자 테스트 토큰은 Clerk 세션·쿠키와
  애플리케이션 권한 경계를 검증하지만 Google 로그인 UI나 Google 계정의
  2단계 인증 수행 자체를 증명하지 않는다.
- 기본 quality workflow는 비밀 없는 정적·단위·build 게이트이며 실제
  PostgreSQL·Clerk 세션·Chrome 사용자 흐름이나 Production 배포를 대신하지
  않는다. 이 통합 검증은 기존 로컬 리허설과 출시 smoke 절차로 분리한다.
- 2026-08-12 로컬 검증 환경에서 기본 Turbopack build는 CSS 처리 워커의 로컬
  포트 바인딩 권한 제한으로 중단됐지만 같은 소스의 webpack production build·
  TypeScript·정적 페이지 생성과 모든 production E2E는 통과했다. 이후 제한
  없는 Vercel Preview 환경의 기본 Next.js production build와 배포가 성공해
  소스 결함이 아닌 로컬 샌드박스 제한임을 재확인했다. Preview의 화면·HTTP
  smoke는 Vercel SSO 인증이 가능한 브라우저 세션에서 추가 확인해야 한다.
- 2026-08-07 `npm audit` 기준 production 의존성은 0건이고 전체 의존성은
  중간 4건·높음 0건이다. 남은 중간 4건은 Drizzle Kit의 구형 `esbuild`
  개발 도구 경로이며 수정 제안이 호환되지 않는 0.18.1 하향이라 적용하지
  않았다.

## 상태 갱신 규칙

기능 범위, 구현 단계, 배포 상태 또는 핵심 위험이 달라질 때 이 문서를 갱신합니다. 완료 여부는 코드 존재가 아니라 검증 가능한 사용자 흐름과 운영 준비 상태를 기준으로 판단합니다.
