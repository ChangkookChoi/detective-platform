# 업체 데이터 확대 운영 절차

## 1. 목적

서울·경기 공개 업체를 약 100곳까지 확대할 때 후보 발굴, 중복 검사, 정책
사전검증, 관리자 등록·승인과 결과 검증을 반복 가능한 배치로 수행한다. 자동
수집 또는 운영 스크립트가 관리자 승인 없이 업체를 공개하지 않는 기존 경계는
유지한다.

이 문서와 `AGENTS.md`의 업체 데이터 확대 운영 원칙, `preflight-batch` 명령,
Clerk 관리자 배치 브라우저 실행은 하나의 운영 계약이다. 절차를 개선하면 네
부분과 관련 테스트를 같은 변경에서 갱신한다.

## 2. 배치 기본값

1. 공식 출처 신규 도메인을 한 번에 20곳 이상 발굴한다.
2. 기존 `SOURCE_REGISTRY.md`와 개발 DB의 이름·전화·주소·출처를 먼저 대조한다.
3. 중복·기승인·차단 후보를 제외한 뒤 서로 다른 host를 최대 4개까지 병렬로
   사전검증한다. 같은 host는 순차 처리한다.
4. 각 host의 `robots.txt`를 공식 페이지보다 먼저 확인한다. 명시적 AI 접근
   차단, 401·403·429, 위험한 redirect, 사설 IP 해석은 즉시 중단한다.
5. 원문 전체를 저장하지 않고 상호, 사업상 대표 전화, 정확한 한 사무소 주소,
   직접 뒷받침되는 관리형 업무 분야만 manifest에 기록한다.
6. 기본 목표는 한 배치에 10~15곳 공개다. 통과 후보가 부족하면 적은 수로
   종료하며 근거 기준을 낮추지 않는다.
7. 실제 후보 등록과 승인은 `/admin/reviews/batch`에서 manifest·preflight를 한
   번 제출하고, 표에서 정상 건을 선택해 한 번 승인한다. Clerk 인증, 기존 승인
   트랜잭션과 업체별 감사 사유는 그대로 사용한다.
8. 배치 전체 공개 상세 HTTP 200, 표시값, 대표 출처, 필드 근거와 감사 처리자를
   확인한 뒤 문서·커밋·PR을 한 번만 갱신한다.
9. Production 승격은 개발 배치와 분리해 충분한 누적 건수, 별도 사용자 승인과
   사전 암호화 백업이 있을 때 수행한다.

## 3. manifest

실제 값은 Git 제외 파일 `data/private/office-batches/<batch-id>.json`에 둔다.
공개 최소 사실만 포함하지만, 작업 중간 상태와 재시도 대상을 섞지 않도록
운영 파일로 취급한다. 형식은
[`candidate-batch.example.json`](../../services/collector/candidate-batch.example.json)을
따른다.

필수 필드:

- 배치: `version`, `batchId`, `verifiedAt`, `candidates`
- 후보: `sourceUrl`, `name`, `phoneDisplay`, `addressText`, `slug`,
  `regionSlug`, `serviceCategorySlugs`, `sourceType`, `evidenceNote`
- 기존 `deferred` 재검사: `recheckReason`
- robots 404처럼 자동 정책 판단이 불가능하지만 사람이 공식 공개 페이지를
  확인한 경우: `manualPolicyReviewed: true`
- 이미 승인된 공식 host이거나 같은 공식 URL에 주소가 다른 복수 지점이 명확히
  열거된 경우: 각 해당 후보에 `distinctBranchReviewed: true`

`evidenceNote`에는 홍보 문구를 복사하지 않고 어떤 공식 영역에서 최소 사실과
업무 분야를 확인했는지만 짧게 쓴다. 사건·상담·조사 대상자·개인 연락처·후기·
성과·이미지는 넣지 않는다.

## 4. 사전검증

저장소 루트에서 실행한다.

```bash
cd services/collector
DATABASE_URL="postgresql://..." \
  uv run python main.py preflight-batch \
    --manifest ../../data/private/office-batches/<batch-id>.json \
    --registry ../../docs/operations/SOURCE_REGISTRY.md \
    --output ../../data/private/office-batches/<batch-id>.preflight.json \
    --user-agent "DetectivePlatformPreflight/1.0 (+https://service.example/contact)"
```

명령은 manifest 형식, 등록부 상태, 운영 DB 중복, 공개 IP, HTTPS, robots와 공식
페이지 HTTP 상태, 호스팅 만료·정지 표식과 활성 최하위 지역 slug를 검사한다.
DB 중복 키는 한국 전화의 `+82`·국내 `0` 표기를 통일하고 주소 앞 우편번호와
공백·구두점 차이를 제거해, 표시 형식만 다른 같은 사무소의 재등록도 차단한다.
이름·대표번호·공식 URL을 공유하는 지점은 기본적으로 중복 처리한다. 다만 공식
홈페이지가 서로 다른 정확한 주소를 지점별로 직접 열거하고 manifest에서
`distinctBranchReviewed: true`로 사람이 구분 검토한 후보는 허용한다. 같은
공식 URL·주소 조합 또는 기존 주소·slug와 겹치면 이 표시가 있어도 차단한다.
HTML은 파일로 보존하지 않는다. 결과의 모든 후보가
`eligibleForManualIntake: true`여야 관리자 배치 실행 대상으로 사용할 수 있다.

상태 판정:

- `eligible`: robots 허용과 공식 페이지 성공
- `manual_policy_review`: robots가 없지만 사람이 접근 정책과 공식 원문을 별도
  확인했고 manifest에 그 사실을 명시
- `duplicate`: 등록부 기승인 또는 DB 이름·전화·주소·출처 중복
- `deferred`: DNS/TLS/일시 장애, 원문 접근 실패, 정확한 한 사무소 불확실
- `blocked`: 접근 차단, AI 접근 명시 차단, 위험한 주소·redirect
- `already_published`: 동일 slug의 이름·전화·주소·최하위 지역·출처·업무 분야가
  모두 같고 현재 robots·원문도 다시 통과한 공개 업체. 중단된 배치의 무변경
  재개 대상으로만 허용

## 5. 관리자 배치 등록·승인

사전검증 결과와 실제 Clerk Development 키, allowlist 관리자 이메일, 지속형
개발 DB를 사용한다.

```bash
cd apps/web
DATABASE_URL="postgresql://..." \
OFFICE_BATCH_MANIFEST="../../data/private/office-batches/<batch-id>.json" \
OFFICE_BATCH_PREFLIGHT="../../data/private/office-batches/<batch-id>.preflight.json" \
npm run ops:office-batch
```

실행은 한 번 로그인한 뒤 후보별 `/admin/reviews/new` 등록 폼과 상세 승인 폼을
반복하지 않는다. `/admin/reviews/batch` Server Action에 두 JSON을 한 번 업로드해
비공개 후보를 만들고, manifest의 slug·지역·업무 분야·출처 유형을 후보
스냅샷으로 보존한다. 운영자는 배치 표에서 근거 메모와 최소 사실 필드를 행별로
대조하고 정상 건만 선택해 한 번 승인한다.

이미 정확히 공개된 후보는 읽기 검증 후 건너뛰고, 중간에 등록된 `pending`·
`on_hold` 후보는 같은 핵심 값일 때 현재 배치에 연결해 재개한다. 같은 출처·
주소인데 핵심 값이 다르거나 공개 slug가 다른 값이면 자동 처리하지 않는다.
일괄 승인도 각 후보에 기존 승인 트랜잭션을 각각 실행하므로 업체별 감사 이력과
근거가 분리된다. 한 후보의 동시 변경·slug 충돌은 그 후보만 실패로 남기며 다른
정상 후보의 성공을 롤백하지 않는다.

승인 사유에는 batch ID와 사용자 위임 묶음 검수임을 남긴다. 승인 후 DB를 읽어
제출자·처리자, 대표 출처, 이름·전화·주소·업무 분야별 근거를 확인하고 공개
상세의 HTTP 200과 표시값·출처 링크, 브라우저 오류 0건을 검사한다.

로컬 DB 계약은 다음으로 별도 검증한다.

```bash
cd apps/web
npm run db:verify-office-review-batch
```

## 6. 기록과 종료

- `SOURCE_REGISTRY.md` 표에는 모든 조사 도메인의 최신 상태를 한 줄씩 반영한다.
- 같은 문서의 실행 기록에는 발굴 수, 자동 제외 수, 사전검증 결과, 공개 수와
  보류·차단 이유를 배치 단위로 한 번 기록한다.
- `docs/STATUS.md`와 `README.md`의 개발 DB·Production 수를 서로 다르게 정확히
  유지한다.
- Python compile/test, 웹 lint/build, `git diff --check`를 통과한다.
- Production을 건드리지 않았으면 그 사실을 결과에 명시한다.
