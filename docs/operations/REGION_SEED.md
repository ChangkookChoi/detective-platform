# 지역 기준 데이터 관리

- 최초 기준일: 2026-07-22
- 범위: 서울특별시와 경기도의 시·군·구
- 제외: 읍·면·동, 서비스 가능 지역, 좌표와 거리 정보

## 목적

업체의 검수된 소재지를 일관된 검색 조건으로 제공하기 위한 기준 데이터와 갱신 절차를 정의한다. 지역 seed는 업체가 주장하는 영업·출장 가능 지역이 아니라 실제 사무소 주소의 행정구역 분류에만 사용한다.

## 최초 기준 출처

- 서울 25개 자치구: [서울특별시 2026년 자치구 서울사랑상품권 안내](https://scpm.seoul.go.kr/seoul-policy/evt0237)
- 경기도 31개 시·군: [경기도청 31개 시·군 지명유래](https://www.gg.go.kr/contents/contents.do?ciIdx=404&menuId=1829)
- 경기도 일반구 교차 확인: [경기도청 부동산 불법거래 자진신고 담당 기관](https://www.gg.go.kr/contents/contents.do?ciIdx=1293&menuId=3068)
- 부천시 원미구·소사구·오정구: [부천시 정비사업 검색](https://bucheon.go.kr/site/program/reconstruct/list?currentpage=2&menuid=173005002)
- 화성시 만세구·효행구·병점구·동탄구: [화성특례시 2026년 구청 체제 안내](https://atc.hscity.go.kr/notice/promote_view.jsp?private_code=cbd43a331bc36361e2314e4f9a26b236eaf568d7855096c0535d37e7140e2fe9)
- 화성시 일반구 신설 변경 근거: [행정안전부 2026년 2월 1일 행정구역 변경 알림](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=122595)

최초 seed에는 서울 25개 자치구, 경기 31개 시·군과 현재 일반구가 있는 경기 8개 시의 일반구 24개를 포함한다. 화성시의 네 일반구는 2026년 2월 1일 시행 기준을 반영한다.

## 식별자와 계층

- slug는 `seoul-{district}`, `gyeonggi-{municipality}`, `gyeonggi-{municipality}-{district}` 형식을 사용한다.
- 기존에 사용한 여섯 UUID는 참조 안정성을 위해 유지한다.
- 신규 지역 UUID는 고정 namespace와 slug로 결정적으로 생성한다.
- slug는 비활성화 후에도 재사용하지 않는다.
- 서울 자치구는 서울특별시를 부모로 둔다.
- 경기 시·군은 경기도를 부모로 두고, 일반구는 해당 시를 부모로 둔다.
- 업체는 주소를 분류할 수 있는 가장 하위의 활성 지역을 참조한다.

## 갱신 절차

1. 행정안전부 변경 알림과 해당 지방자치단체 공식 사이트에서 시행일과 명칭을 확인한다.
2. 신규 지역은 새 slug와 UUID를 추가하고 기존 배열 순서를 변경해 식별자를 만들지 않는다.
3. 폐지·통합 지역은 바로 삭제하지 않고 `is_active = false` 전환과 기존 업체 재분류 계획을 함께 준비한다.
4. 명칭이나 부모 변경은 기존 URL, 업체 참조와 검색 결과 영향을 검토한다.
5. seed 정적 검증과 실제 PostgreSQL 통합 검증을 모두 통과시킨다.
6. 기준일, 출처와 변경 이유를 이 문서 및 `docs/STATUS.md`에 기록한다.

## 검증 기준

- 전체 지역 82개
- 서울 직계 자치구 25개
- 경기 직계 시·군 31개
- 경기 시 하위 일반구 24개
- UUID와 slug 중복 0건
- 모든 부모가 자식보다 먼저 정의됨
- 자기 참조와 고아 지역 0건
- seed를 연속 실행해도 행 수가 증가하지 않음
