# 데이터베이스 백업·복구

## 1. 목적

PostgreSQL 운영 데이터의 손실 범위를 제한하고 실제 복구 가능성을 정기적으로
검증한다. 백업 파일 생성 성공만으로 복구 준비가 끝났다고 보지 않으며,
격리된 데이터베이스에 복원한 뒤 migration 이력, 기준 데이터, 관계와 핵심
제약을 확인한다.

## 2. MVP 복구 목표

- 복구 지점 목표(RPO): 최대 24시간
- 복구 시간 목표(RTO): 장애 인지 후 4시간 이내
- 운영 DB는 자동 일일 백업과 시점 복구를 제공하는 관리형 PostgreSQL을
  우선한다.
- 공개 출시 전 운영 공급자의 실제 보존 기간, 시점 복구 범위와 복원 소요
  시간을 측정해 이 목표의 충족 여부를 갱신한다.

현재 목표는 약 100개 업체의 초기 정보 디렉터리를 위한 기준이다. 결제,
사건 접수 또는 다른 중요 쓰기 기능이 추가되면 RPO·RTO와 백업 빈도를 새로
검토한다.

2026-08-11 Neon Free Singapore 출시 리허설 리소스에 migration·seed를
적용했다. 무료 6시간 복원 이력은 이 문서의 자동 일일 백업 14일 보존을
충족하지 않는다. 무과금 보완 경로로
[ADR-0009](../decisions/ADR-0009-encrypted-logical-backups.md)에 따라 암호화된
GitHub Actions artifact를 선택하고 합성 복원을 통과했지만, 실제 read-only
역할·암호화 키·운영 archive의 14일 보존과 격리 복원을 검증하기 전에는 공개
운영 백업이 준비됐다고 판단하지 않는다. 공급자 연결 절차는
[운영 PostgreSQL 준비](PRODUCTION_DATABASE.md)를 따른다.

## 3. 백업 계층

1. 관리형 공급자의 자동 백업
   - 매일 생성하고 최소 14일 보존한다.
   - 가능한 경우 시점 복구를 활성화한다.
   - 운영 DB와 다른 장애 경계를 가진 공급자 관리 저장소에 둔다.
2. 배포·migration 전 논리 백업
   - 운영 schema 또는 데이터 변환 migration 전에 `pg_dump` 논리 백업을
     만든다.
   - 배포 성공과 데이터 검증 후 최소 30일 보존한다.
3. 로컬 개발 DB
   - `data/private/postgres-dev`는 운영 백업 대상이 아니며 언제든 다시 만들
     수 있는 개발 데이터로 취급한다.
   - 실제 개인정보나 운영 비밀을 로컬 DB 또는 검증 백업에 넣지 않는다.

운영 공급자가 위 보존 기간이나 격리 조건을 제공하지 못하면 출시 전에 별도
암호화 저장소와 자동 내보내기를 설계한다. 현재 무과금 리허설은 GitHub Actions
artifact를 사용하며 실제 운영 검증이 끝나기 전까지 공급자 백업을 대체했다고
보지 않는다.

## 4. 보안과 접근

- 백업은 전송 중과 저장 시 암호화한다.
- 운영 DB 소유자와 백업 복원 권한은 최소 인원의 `admin` 운영자에게만
  부여한다.
- 애플리케이션과 수집기 자격 증명에는 백업 생성·삭제 권한을 주지 않는다.
- 백업 파일명, 로그와 알림에 연결 문자열, 전화번호, 주소, Clerk 사용자 ID나
  SQL 파라미터를 출력하지 않는다.
- 보존 기간이 끝난 백업은 공급자의 수명 주기 정책으로 삭제하고 예외 보존은
  사유와 종료일을 기록한다.

## 5. 로컬 복구 리허설

저장소 루트에서 합성 데이터만 사용하는 논리 백업·복구 검증을 실행한다.

```bash
./scripts/verify-postgres-backup.sh
```

스크립트는 다음을 수행한다.

1. PostgreSQL 17 이상의 격리된 임시 클러스터를 만든다.
2. migration과 기준 데이터 seed를 적용한다.
3. 합성 업체, 수집 실행·레코드, 보류 검수와 감사 작업을 만든다.
4. `pg_dump --format=custom`으로 소유자·권한을 제외한 논리 백업을 만든다.
5. 임시 `age` X25519 키로 archive를 암호화하고 SHA-256을 검증해 복호화한다.
6. 빈 데이터베이스에 `pg_restore --exit-on-error`로 복원한다.
7. 원본·복원 DB의 migration과 핵심 테이블 건수를 비교한다.
8. 수집 레코드부터 검수 감사 작업까지의 관계와 DB 제약·seed를 검증한다.
9. 임시 서버, 키, 평문 dump와 암호화 파일을 성공·실패와 관계없이 삭제한다.

기본 포트 `55434`가 사용 중이면 다른 포트를 지정한다.

```bash
PG_BACKUP_TEST_PORT=55435 ./scripts/verify-postgres-backup.sh
```

이 검증은 공급자 시점 복구, 암호화 키, 네트워크 접근 통제, 대용량 복원
시간을 대신하지 않는다.

## 6. GitHub Actions 무과금 리허설

예약 백업은 [database-backup.yml](../../.github/workflows/database-backup.yml),
수동 격리 복원은
[database-backup-restore.yml](../../.github/workflows/database-backup-restore.yml)을
사용한다. 예약 workflow는 기본 branch의 최신 커밋에서만 실행되므로 merge 전
branch에 파일이 존재하는 것만으로 백업이 활성화되지는 않는다.

필수 GitHub 설정:

| 종류 | 이름 | 값과 권한 |
| --- | --- | --- |
| Actions variable | `DATABASE_BACKUP_AGE_RECIPIENT` | `age1...` 공개 recipient |
| Repository secret | `PRODUCTION_DATABASE_BACKUP_URL` | direct TLS, read-only backup 역할 |
| Repository secret | `DATABASE_BACKUP_AGE_IDENTITY` | recipient에 대응하는 복호화 identity |

추가 운영 설정:

1. Actions 사용 예산을 0원·한도 도달 시 사용 중지로 설정한다.
2. 매일 02:23 KST 예약과 최근 성공 알림 담당자를 확인한다.
3. 최초 백업 workflow run ID로 수동 복원 workflow를 실행한다.
4. 복원 workflow가 24시간 이내 archive, SHA-256, 복호화, 빈 PostgreSQL 17
   복원과 `db:verify`를 통과하는지 확인한다.
5. 첫 14일 동안 artifact 수·총 용량을 매일 확인하고, 이후 최초 artifact가
   만료되는지 확인한다.

archive는 15MiB를 넘으면 실패한다. 매일 상한 크기 14개는 약 210MiB지만,
GitHub Free의 500MB는 Actions artifact와 Packages가 공유한다. 수동 재실행과
다른 artifact도 포함해 월별 사용량을 확인한다. archive가 상한에 가까워지면
보존을 줄여 정책을 어기지 말고 R2 Standard 무료 구간 또는 유료 관리형 백업을
비교한다.

백업 생성과 수동 복원 명령은 각각
`scripts/create-encrypted-postgres-backup.sh`,
`scripts/restore-encrypted-postgres-backup.sh`에 있다. 평문 dump와 identity를
artifact나 로그에 포함하지 않는다.

## 7. 운영 복구 절차

1. 장애 범위와 마지막 정상 시각을 확인하고 쓰기를 중단한다.
2. 운영 원본을 덮어쓰지 않고 격리된 새 데이터베이스로 복원한다.
3. 공급자 백업 시각, 적용된 migration 이력과 복원 로그를 기록한다.
4. `npm run db:verify`에 해당하는 읽기 중심 schema·seed 검증을 수행한다.
5. 업체·출처·검수·감사 이력의 건수와 최근 정상 작업을 대조한다.
6. 최소 권한 역할, TLS와 네트워크 제한을 다시 적용한다.
7. 웹과 수집기를 복원 DB에 연결하기 전에 관리자 로그인과 비공개 검수
   경계를 확인한다.
8. 전환 후 공개 조회와 관리자 쓰기를 소량 시험하고 모니터링한다.
9. 원인, 손실 범위, 실제 RPO·RTO, 후속 조치를 사고 기록에 남긴다.

복원 검증 전 운영 원본을 삭제하거나 복원본으로 덮어쓰지 않는다. 전환은
연결 대상 변경처럼 되돌릴 수 있는 방식으로 수행한다.

## 8. 검증 주기와 출시 조건

- DB·migration 관련 PR: merge 전에 합성 논리 백업·복구 스크립트 실행
- 매월: 운영과 같은 PostgreSQL major 버전으로 격리 복구 리허설
- 중요 migration 전: 최신 논리 백업과 복원 가능성 확인
- 분기 또는 공급자 변경 시: 관리형 백업에서 실제 복원하고 RPO·RTO 측정
- 공개 출시 전: 백업 담당자, 복구 승인자, 공급자 보존·시점 복구 설정과
  최근 성공한 복구 리허설을 운영 체크리스트에 기록

검증하지 못한 백업은 복구 가능하다고 보고하지 않는다.
