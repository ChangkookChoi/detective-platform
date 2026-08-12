# ADR-0009: 무과금 출시 리허설 백업에 암호화된 GitHub Actions artifact 사용

- 상태: 승인
- 결정일: 2026-08-11

## 맥락

[ADR-0008](ADR-0008-managed-postgres-prelaunch.md)의 Neon Free 후보는 6시간
복원 이력만 제공해 현재 [백업·복구 정책](../operations/DATABASE_BACKUP.md)의
RPO 24시간·일일 백업 14일 보존을 충족하지 않는다. 사용자는 당장 추가 비용을
발생시키지 않기를 원하며, 공개 전에는 공급자와 다른 장애 경계에 암호화된
논리 백업을 저장하고 실제 복원을 검증해야 한다.

## 결정

출시 리허설 동안 GitHub Actions의 표준 호스팅 runner와 workflow artifact를
독립 논리 백업 경로로 사용한다.

- 매일 02:23 `Asia/Seoul`에 read-only 백업 역할로 `pg_dump --format=custom`을
  실행한다.
- 평문 dump는 runner 임시 디렉터리에만 만들고 `age` X25519 공개키로 암호화한
  뒤 즉시 정리한다.
- 암호화 archive, SHA-256 manifest와 비민감 생성 메타데이터만 artifact로
  업로드하고 `retention-days: 14`를 적용한다.
- 일일 백업 작업에는 공개 recipient만 주입한다. 복호화 identity는 별도 수동
  복원 workflow에서만 repository secret으로 사용한다.
- 복원 workflow는 24시간 이내의 archive만 받아 빈 격리 PostgreSQL 17에
  복원하고 migration·seed·핵심 제약을 검증한다.
- archive 크기는 15MiB로 제한한다. 일일 14개가 모두 상한에 도달해도 약
  210MiB이므로 GitHub Free의 다른 artifact·Packages와 공유하는 500MB 한도에
  여유를 둔다.
- GitHub Actions 예산은 초과 사용 중지로 설정하고 월별 사용량을 확인한다.

## 근거

- GitHub Free는 private repository에도 월 2,000분과 artifact·Packages 공유
  저장공간 500MB를 포함하며, public repository의 표준 runner는 무료다.
- workflow artifact는 업로드별 보존 일수를 지정할 수 있다.
- `age`는 작은 공개 recipient와 별도 identity를 사용하는 파일 암호화를
  제공해 일일 백업 작업에서 복호화 키를 분리할 수 있다.
- GitHub artifact는 Neon과 다른 공급자 장애 경계에 위치한다.

공식 기준:

- [GitHub Actions 과금과 무료 할당량](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Actions artifact 보존](https://github.com/actions/upload-artifact)
- [GitHub Actions 예약 workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
- [age 공식 저장소와 사용법](https://github.com/FiloSottile/age)

## 결과

장점:

- 추가 공급자 계정 없이 현재 코드 저장소의 자동화 경계에서 시작할 수 있다.
- 운영 DB 공급자와 분리된 암호화 archive를 14일 보존할 수 있다.
- 공개키만 가진 백업 작업과 개인키가 필요한 복원 작업을 분리한다.
- 용량 상한으로 예상하지 못한 과금을 조기에 차단한다.

단점:

- GitHub 계정 또는 repository 제어면 장애에는 독립적이지 않다.
- GitHub Free 한도는 다른 Actions·Packages 사용량과 공유한다.
- 15MiB를 넘는 archive나 더 긴 보존이 필요하면 이 경로는 확장되지 않는다.
- repository secret을 읽을 수 있는 권한과 workflow 변경 권한을 함께 통제해야
  하며, private repository의 GitHub Free에서는 환경 승인 기능이 제한될 수 있다.

## 대안

### Cloudflare R2 Standard

월 10GB 저장과 충분한 요청 수의 무료 구간을 제공해 용량 확장에는 유리하다.
다만 R2 subscription, bucket, S3 자격 증명과 lifecycle을 새로 운영해야 하므로
현재 리허설에는 도입하지 않는다. archive가 15MiB를 넘거나 GitHub 공유 한도가
부족해지면 첫 번째 이전 후보로 재검토한다.

### 관리형 PostgreSQL 유료 백업

운영 복잡도는 낮지만 현재 무과금 제약과 맞지 않는다. 실제 담당자 시간과
복구 위험을 포함한 비용이 독립 백업보다 낮아지는 시점에 비교한다.

### 백업을 Git repository에 커밋

Git 이력에 운영 데이터와 대용량 바이너리를 남기고 보존 삭제도 어려우므로
사용하지 않는다.

## 운영 승인 조건

- GitHub repository variable과 secret을 값 노출 없이 설정한다.
- 실제 read-only 백업 역할로 최초 workflow를 성공시킨다.
- 내려받은 실제 artifact를 빈 격리 DB에 복원해 RPO 24시간·RTO 4시간을
  측정한다.
- 14일이 지난 첫 artifact가 정책대로 만료되는지 확인한다.
- Actions 예산 초과 사용 중지와 월별 사용량 담당자를 지정한다.

2026-08-12 repository가 public이고 Actions가 활성화됐으며, 계정 Billing에서
Actions 0원 초과 사용 중지·포함 사용량 알림 `On`과 billable usage 0원을
확인했다. 표준 `ubuntu-24.04` runner 실행 시간은 public repository에서 무료이고
15MiB × 14개 상한은 500MB 공유 저장 한도 안이다.

같은 날 repository Actions 허용 범위를 GitHub 소유 action으로 제한하고 전체
40자리 commit SHA 고정을 필수화했다. verified 제3자 action은 허용하지 않으며
기본 `GITHUB_TOKEN`은 read-only, PR 승인 불가로 확인했다. repository의
artifact·log 기본 보존도 14일로 제한해 workflow별 보존 누락 시 90일 기본값이
적용되지 않게 했다.

PostgreSQL 17 백업 client와 격리 복원 service도 Docker Official Image
`postgres:17-alpine`의 2026-08-12 multi-arch OCI digest로 고정했다. tag 이동에
따른 무검토 실행 변경은 막되 보안 업데이트를 놓치지 않도록 월별 digest 검토와
합성 복원 회귀 검증을 함께 수행한다.

같은 날 실제 Neon backup run `31608256000`에서 60,965바이트 암호화 artifact를
14일 만료로 생성했다. restore run `31608856556`은 recovery point 0.11시간,
순수 restore 2초·전체 1분 6초로 빈 PostgreSQL 17에 복원하고 공개 업체 30건과
schema·migration·제약·seed·출처 무결성을 확인했다. 최초 artifact의 실제 14일
만료 여부는 2026-08-26 이후 확인한다.
