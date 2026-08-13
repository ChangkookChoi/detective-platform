# 데이터 모델

## 1. 원칙

- 수집 원본/추출값과 승인된 운영값을 분리한다.
- 공개 화면은 승인된 운영값만 읽는다.
- 출처, 확인 시각, 변경 이유와 처리자를 추적할 수 있어야 한다.
- 사건 내용, 조사 대상자 정보, 통화 내용과 녹취를 저장하지 않는다.
- 내부 식별자는 UUID 등 추측하기 어려운 값을 고려하고, 공개 URL에는 안정적인 `slug`를 사용한다.
- 모든 시각은 DB에 UTC로 저장하고 화면에서 적절한 시간대로 표시한다.
- MVP의 `office`는 법인이나 브랜드 전체가 아니라 사용자가 연락할 수 있는 하나의 실제 사무소 또는 지점이다.
- 지역은 검수된 소재지 기준이며 업체가 주장하는 서비스 가능 지역과 혼합하지 않는다.

## 2. MVP 모델 결정

- 동일 브랜드라도 주소나 대표 연락처가 다른 지점은 별도의 `offices` 행으로 관리한다. 브랜드·법인 엔터티는 실제 필요가 확인될 때 추가한다.
- 업체에는 대표 전화번호 한 개만 저장한다. 복수 번호 엔터티는 MVP 이후 필요가 확인될 때 분리한다.
- 주소는 검수된 `address_text`와 검색용 `region_id`로 표현한다. 우편번호, 좌표, 도로명 구성요소는 초기 필수값이 아니다.
- 지역 필터는 소재지를 뜻한다. 출장 또는 서비스 가능 지역은 저장하거나 검색 조건으로 사용하지 않는다.
- 업무 분야는 관리형 초기 분류를 사용하며 업체가 제출하거나 출처에서 추출한 자유 문자열을 그대로 공개 분류로 사용하지 않는다.
- 출처는 업체에 연결하고, `office_source_evidence`로 출처가 뒷받침하는 필드를 명시한다.
- 공개 수명주기와 검수 수명주기는 서로 다른 상태로 관리한다.

## 3. 핵심 엔터티

### `offices`

업체의 승인된 운영 정보와 공개 상태를 보관한다.

| 필드 | 설명 |
| --- | --- |
| `id` | 내부 식별자 |
| `slug` | 공개 URL용 고유 값 |
| `name` | 검수된 업체명 |
| `summary` | 검수된 짧은 소개 |
| `phone_normalized` | 검색·연결용 정규화 전화번호 |
| `phone_display` | 화면 표시용 전화번호 |
| `address_text` | 검수된 주소 표시값 |
| `region_id` | 대표 지역 참조 |
| `status` | `draft`, `published`, `suspended`, `closed_suspected`, `archived` 중 하나 |
| `published_at` | 최초 공개 시각 |
| `last_verified_at` | 공개 핵심 정보 최종 확인 시각 |
| `created_at`, `updated_at` | 생성·변경 시각 |

전화번호는 민감한 개인 번호가 아닌 사업상 공개된 연락처인지 검토한다. 원본 전화번호를 로그나 이벤트에 반복 저장하지 않는다.

구체적 규칙:

- `id`는 UUID를 사용한다.
- `slug`, `name`, `region_id`, `status`, `created_at`, `updated_at`은 null을 허용하지 않는다.
- `phone_normalized`, `phone_display`, `address_text`, `summary`, `published_at`, `last_verified_at`은 초안에서 null일 수 있다. 전화번호, 주소와 확인 시각은 `published` 전환 시 필수로 검증한다.
- `slug`는 전역 고유하며 업체가 보관 처리되어도 재사용하지 않는다.
- `phone_normalized`는 국내 전화 연결에 사용할 수 있는 정규화 형식으로 저장하고 `phone_display`는 검수된 표시값으로 저장한다.
- 전화번호만으로 전역 고유 제약을 두지 않는다. 동일 대표번호를 여러 지점이 합법적으로 공유할 수 있으므로 중복 후보 탐지에만 사용한다.
- `region_id`는 업체 주소가 속한 검색용 최하위 활성 지역을 참조한다.

공개 상태는 다음으로 확정한다.

| 상태 | 공개 여부 | 의미 |
| --- | --- | --- |
| `draft` | 비공개 | 작성 또는 최초 검수 중 |
| `published` | 공개 | 공개 조건을 충족하고 승인됨 |
| `suspended` | 비공개 | 오류·분쟁·안전 문제로 임시 중지 |
| `closed_suspected` | 비공개 | 폐업이 의심되며 추가 확인 중 |
| `archived` | 비공개 | 폐업 확정, 중복 정리 등으로 보관 |

허용 전이는 애플리케이션 유스케이스에서 제한한다. `published` 전환에는 유효한 대표 출처, 필수 필드의 근거, `last_verified_at`과 승인 이력이 필요하다. `archived` 업체의 slug는 유지한다.

### `regions`

서울·경기 및 하위 행정구역의 가변 깊이 계층을 표현한다.

| 필드 | 설명 |
| --- | --- |
| `id` | UUID 식별자 |
| `parent_id` | 상위 지역 참조, 최상위만 null |
| `type` | `province`, `city`, `county`, `district` 등 행정 수준 |
| `name` | 표시 이름 |
| `slug` | URL과 필터에 쓰는 전역 고유값 |
| `display_order` | 같은 상위 지역 내 표시 순서 |
| `is_active` | 신규 연결·필터 노출 가능 여부 |
| `created_at`, `updated_at` | 생성·변경 시각 |

자유 텍스트 주소와 검색용 지역 분류를 분리한다. 자기 자신을 부모로 지정할 수 없고 계층 순환을 허용하지 않는다. 비활성 지역은 기존 업체 참조를 보존하되 신규 연결과 필터 노출에서 제외한다. 서울·경기 이외 지역은 MVP seed에 포함하지 않는다.

### `service_categories`

업무 분야의 관리형 분류다. `id`, `name`, `slug`, `description`, `display_order`, `is_active`, `created_at`, `updated_at`을 둔다. `slug`는 전역 고유하며 비활성화 후에도 재사용하지 않는다. 법적·윤리적으로 부적절한 표현이나 성과를 보장하는 표현은 분류에 포함하지 않는다.

초기 분류는 개인 고객의 탐색 목적과 약 100개 업체의 결과 밀도를 고려해 다음 다섯 가지로 시작한다.

| slug | 표시 이름 | 포함 기준 |
| --- | --- | --- |
| `infidelity` | 외도·배우자 문제 | 배우자 외도 관련 사실 확인 등 |
| `family` | 가족 문제 | 가족 관계에서 발생한 사실 확인 등, 외도 분류 제외 |
| `people-search` | 사람 찾기 | 적법한 범위의 소재 확인·사람 찾기 |
| `evidence-fact-checking` | 증거·사실 확인 | 개인 분쟁 관련 적법한 사실 확인과 자료 조사 |
| `personal-safety` | 개인 피해 대응 | 스토킹·괴롭힘 등 개인 피해 상황의 적법한 사실 확인 지원 |

분류명은 서비스가 업무의 적법성이나 성과를 보증한다는 의미가 아니다. 실제 초기 데이터 표본에서 중복이 과도하거나 결과가 지나치게 적으면 공개 전 운영 검토를 거쳐 통합·명칭 변경하며, slug 변경 시 기존 URL 정책도 함께 결정한다.

### `office_service_categories`

업체와 업무 분야의 다대다 관계다. `office_id`, `service_category_id`, `created_at`을 두고 `(office_id, service_category_id)`를 고유하게 유지한다. 대표 업무 분야나 업체별 표시 순서는 MVP 요구가 아니므로 저장하지 않는다.

### `office_sources`

업체 정보의 출처와 확인 상태를 보관한다.

| 필드 | 설명 |
| --- | --- |
| `id`, `office_id` | 식별자와 업체 참조 |
| `source_type` | 공식 사이트, 공공 데이터 등 출처 유형 |
| `url` | 출처 URL |
| `retrieved_at` | 마지막 접근 시각 |
| `verified_at` | 관리자가 확인한 시각 |
| `is_primary` | 대표 출처 여부 |
| `access_status` | 정상, 차단, 삭제 의심 등 |

`url`은 정규화 후 업체 내에서 중복되지 않게 한다. `source_type`과 `access_status`는 allowlist로 제한한다. 대표 출처는 업체당 최대 하나만 허용한다.

### `office_source_evidence`

어떤 출처가 어떤 운영 필드를 뒷받침하는지 연결한다.

| 필드 | 설명 |
| --- | --- |
| `id` | UUID 식별자 |
| `office_source_id` | 출처 참조 |
| `field_name` | `name`, `phone`, `address`, `service_category`, `summary` 중 하나 |
| `service_category_id` | 업무 분야 근거일 때만 해당 분류 참조 |
| `verified_at` | 해당 근거를 관리자가 확인한 시각 |
| `created_at`, `updated_at` | 생성·변경 시각 |

동일 출처와 동일 필드의 중복 근거를 허용하지 않는다. `service_category` 근거는 `service_category_id`를 필수로 하고 다른 필드는 이를 null로 유지한다. 원문 전체나 불필요한 개인정보를 근거 테이블에 복제하지 않는다.

### `collection_runs`

수집 실행 단위다. 시작·종료 시각, 출처/어댑터, 추출기 버전, 성공·부분 실패·실패 상태, 건수, 비민감 오류 요약을 저장한다.

### `collected_records`

특정 실행에서 얻은 추출 결과다. 출처 참조, 원본 레코드 식별자 또는 URL, 수집 시각, 제한된 추출 필드, 정규화 결과, 콘텐츠 해시와 조건부 요청용 `etag`, `last_modified`를 둔다. ETag와 Last-Modified는 출처 응답 메타데이터일 뿐 검증 완료 시각으로 간주하지 않는다. 원문 전체 HTML은 기본 저장하지 않으며 디버깅 목적 보존이 필요하면 별도 기간과 접근 통제를 정한다.

### `review_items`

신규 업체, 필드 변경 또는 공개 정정 요청 후보다. 대상 업체, 후보 유형,
이전값과 제안값, 위험도, 상태(`pending`, `approved`,
`approved_with_edits`, `rejected`, `on_hold`), 생성 원인과 시각을
기록한다. 신규 후보는 승인 트랜잭션에서 생성된 운영 업체를 `office_id`로
연결한다. 값 스냅샷은 필요한 필드만 저장한다.

인증된 운영자가 공식 출처를 수동 등록한 신규 후보는
`submitted_by_actor_id`에 Clerk 사용자 ID를 저장한다. 자동 수집과 공개
정정 요청처럼 별도 제출자 신원이 없는 후보는 null이다. 수동 등록도
`collection_runs`와 `collected_records`에 `manual_admin` 어댑터와
`manual-v1` 버전, 공식 출처 URL과 최소 사실 필드를 기록하되 원문 전체는
저장하지 않는다. 같은 URL·주소의 `pending`·`on_hold` 신규 후보는 중복
생성하지 않는다. 공식 페이지가 주소가 다른 복수 지점을 명확히 구분하면
같은 URL을 출처로 공유하더라도 사무소별 검수 후보를 각각 저장할 수 있다.

사전검증 manifest에서 일괄 등록한 후보는 `manual_admin_batch` 어댑터와
`manual-batch-v1` 버전을 사용하고 `proposed_values`에 batch ID, 공개 slug,
최하위 지역 slug, 업무 분야 slug, 출처 유형과 최소 검증 근거 메모를 함께
보존한다. 일괄 승인은 별도 배치 상태 테이블을 만들지 않고 이 스냅샷으로 같은
배치의 미처리 신규 후보만 조회한다. 승인 시에는 기존 단건 승인 트랜잭션을
업체마다 독립 실행해 각 `review_items`와 `review_actions` 관계를 유지한다.

`correction_request`는 공개 업체에만 연결한다. `proposed_values`에는 선택한 핵심 필드의 제안값과 `requestedField`, `requesterRole`, 선택적 `evidenceUrl`만 저장하며 요청자 연락처, 사건·상담 내용과 개인 정보는 저장하지 않는다. `requesterRole`은 권한 증명이 아니고 `evidenceUrl`도 검증된 출처가 아니다. 승인할 때 운영자가 별도로 확인한 URL을 `office_sources`에 기록하고 실제 변경 필드만 `office_source_evidence`에 연결한다.

### `review_actions`

검수 이력이다. 검수 항목, 처리자, 결정, 수정값, 사유, 처리 시각을 저장한다. `approved_with_edits`는 승인에 실제 사용한 업체 필드 스냅샷을 `edited_values`에 남긴다. 정정 승인은 결정 방식과 관계없이 운영자가 확인한 출처 URL과 유형도 감사 스냅샷에 남긴다. 승인 이력은 일반 애플리케이션 기능으로 덮어쓰지 않는다.

### `analytics_events`와 `office_daily_metrics`

`analytics_events`는 `office_detail_view`, `phone_click`의 중복·속도 제한에 필요한 업체, 이벤트 종류, 발생 시각과 해시 중복 키만 48시간 보관한다. `office_daily_metrics`는 업체, 한국 날짜, 상세 조회 수와 전화 클릭 수만 영속 저장한다. 세션 UUID 원문, 전화번호, URL 쿼리, IP, User-Agent, Referrer와 통화 결과는 두 테이블 모두 저장하지 않는다. 구체적인 집계 단위와 제한은 [ADR-0006](../decisions/ADR-0006-privacy-minimal-analytics.md)을 따른다.

### `placements`

광고 또는 강화 상품의 업체, 상품 유형, 노출 위치, 시작·종료 시각, 상태를 저장한다. 광고 여부를 공개 응답에서 명시할 수 있어야 하며 업체 품질 점수와 결합하지 않는다.

## 4. 주요 관계

```text
regions 1 ── N regions
   |
   └── N offices N ── N service_categories
                    |
                    ├── N office_sources ── N office_source_evidence
                    ├── N review_items ── N review_actions
                    ├── N analytics_events / daily_metrics
                    └── N placements

collection_runs 1 ── N collected_records ── N review_items
```

## 5. 무결성 규칙

- 공개 상태 업체는 이름, 고유 slug, 대표 전화번호, 주소, 대표 지역, 최소 한 개의 유효한 대표 출처와 `last_verified_at`을 가져야 한다.
- 공개 상태 업체의 이름, 전화번호, 주소와 연결된 모든 업무 분야에는 검수된 필드별 출처 근거가 있어야 한다.
- 전화번호를 공개할 경우 형식 검증과 관리자 승인을 거쳐야 한다.
- 승인 동작과 운영값 변경은 하나의 트랜잭션에서 처리한다.
- 수집 관련 테이블은 운영값을 직접 갱신하는 trigger를 두지 않는다.
- 삭제는 참조·감사 이력이 필요하면 상태 전환을 우선한다.
- 업체, 지역, 업무 분야 slug에는 전역 고유 제약을 둔다.
- 동일 업체와 업무 분야의 중복 연결, 동일 업체와 정규화 URL의 중복 출처를 허용하지 않는다.
- 지역의 삭제는 참조 업체가 있는 동안 제한하며 업무 분야 비활성화는 기존 연결을 삭제하지 않는다.
- 목록 필터와 공개 상태, 확인일, 이벤트 집계에 필요한 인덱스만 실제 쿼리 계획을 보고 추가한다.

## 6. 초기 seed와 변경 관리

- 지역 seed는 서울특별시와 경기도 및 MVP 업체 주소를 분류하는 데 필요한 하위 행정구역을 포함한다.
- 업무 분야 seed는 이 문서의 다섯 분류를 사용한다.
- seed는 이름이 아니라 안정적인 slug를 기준으로 멱등하게 적용한다.
- 지역·업무 분야 이름 변경과 비활성화는 기존 참조와 공개 URL 영향을 검토한 뒤 migration 또는 관리 작업으로 수행한다.
- 초기 업체 표본을 입력하기 전에 동일 브랜드 복수 지점, 공유 전화번호, 경기 지역의 가변 계층 사례로 모델을 검증한다.

합성 표본을 사용한 최초 검증 결과는 [DATA_MODEL_VALIDATION.md](DATA_MODEL_VALIDATION.md)에 기록한다.
지역 기준 데이터의 출처, 범위와 갱신 절차는 [REGION_SEED.md](../operations/REGION_SEED.md)에 기록한다.

## 7. 보존과 삭제

정확한 보존 기간은 출시 전 개인정보·법무 검토와 운영 필요에 따라 확정한다. 원칙적으로 수집 원문과 분석 이벤트는 목적 달성에 필요한 최소 기간만 보존하고 집계 후 삭제 또는 비식별화한다. 검수 이력은 정보 공개의 책임성을 위해 더 길게 보존할 수 있으나 접근 권한을 제한한다.

## 8. 향후 확장

브랜드 단위 묶음, 복수 전화번호, 서비스 가능 지역, 좌표·거리 검색이 실제로 필요해지면 각각 `organizations`, `office_phone_numbers`, `office_service_regions`, 구조화 주소/위치 모델을 별도 migration으로 검토한다. 상담, 견적, 업체 계정이 도입되면 현재 엔터티에 민감 필드를 덧붙이지 않는다. 별도의 데이터 경계, 동의, 암호화, 접근 통제, 보존·삭제 정책을 설계하고 migration 및 ADR로 기록한다.
