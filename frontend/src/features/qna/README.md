# EXP-FE-3.5-QNA Q&A UI

## 1. 파일별 역할
- `QnaPage.jsx`: Q&A 질문 목록, 상세보기, 작성/수정 폼 및 8가지 상태(`loading`, `empty`, `error`, `forbidden`, `hidden`, `notFound`, `idle`, `success`) 구현
- `QnaPage.css`: 시안 이미지 규격 100% 반영 모던 카드리스트 및 배지 스타일링
- `QnaPage.test.jsx`: 5개 기본 RTL 테스트 활성화 및 담당자 작성자 전용 수정 권한 검증 테스트 2개 추가
- `qnaFixture.js`: 다양한 카테고리, 공개/비공개, 답변 완료/대기 Mock 데이터 정의
- `README.md`: 작업 범위, 구현 내용, Mock 한계, 키보드 접근성 및 테스트 실행 결과 기록

## 2. 주요 구현 상태
- **8가지 상태 분기**: `status` 속성에 따라 스켈레톤 로딩, 결과 없음, 오류 발생 등 전용 상태 렌더링.
- **PRIVATE 강제 규칙**: `ACCOUNT` 및 `LOCATION` 카테고리 선택 시 `visibility`를 `PRIVATE`로 고정 및 사유 문구 안내.
- **권한 제어**: 작성자 본인이면서 미답변(`OPEN`) 상태일 때만 상세 뷰에서 `수정` 버튼 노출. (타인 질문 및 답변 완료 질문 시 버튼 숨김)
- **유효성 검증**: 제목(1~120자), 본문(1~5000자) 유효범위 만족 시에만 제출 callback 호출.

## 3. Mock 한계
- 실제 백엔드 API `/api/v1/qna` 호출 및 DB 마이그레이션을 부르지 않으며, 독립된 Fixture 데이터 기반의 UI 프론트엔드 컴포넌트로 동작함.

## 4. 담당자 추가 테스트
### 4.1 기존 스타터 테스트 수정한 내용
- `shows searchable public questions`: 단순 렌더링 검증에서 `getByText` 문자열 매칭 한계를 부정 후방 탐색 정규식(`/(?<!비)공개/`) 및 `onSearch` 콜백 인자 객체 검증으로 구체화.
- `forces account and location questions to private`: 드롭다운 선택 시 `disabled` 상태 및 `PRIVATE` 자동 할당, 사유 문구 렌더링 검증 추가.
- `shows loading, empty, error... states`: 6가지 상태 분기 텍스트 및 다시 시도 버튼 렌더링 검증 통합.
- `submits the approved question payload`: 유효성 검증을 거쳐 `onSubmit` 콜백으로 전달되는 규격 payload 검증.
- `supports keyboard navigation`: `userEvent.tab()`을 이용한 입력창 -> 드롭다운 -> 검색 버튼 키보드 포커스 탐색 순서 검증.
### 4.2 담당자 신규 추가 회귀 테스트
- `shows edit button only for unanswered questions by the author`: 작성자 본인이면서 미답변(`OPEN`) 질문일 때만 수정 버튼 노출 및 타인 계정 시 수정 버튼 숨김 검증.
- `does NOT show edit button for answered questions`: 작성자 본인이어도 이미 답변이 완료된 질문 시 수정 버튼 숨김 권한 통제 검증.

## 5. 테스트 및 빌드 실행 결과
- `npm test`: `QnaPage.test.jsx` 포함 전체 7개 테스트 수트 100% PASS 달성.
- `npm run build`: 에러 없이 정상적으로 빌드 완료.
- 키보드 조작: `Tab`, `Enter`, 방향키를 활용한 순수 키보드 포커스 탐색 검증 완료.

### 📋 FE-3.5 Q&A UI 2차 피드백 반영 사항 정리
#### 1. 다른 사람의 PRIVATE 질문 숨기기
- `QnaPage.jsx`: `visibleQuestions` 필터를 적용하여 `PUBLIC` 질문과 본인(`item.authorId === currentUser.id`)의 `PRIVATE` 질문만 목록에 노출.
- `QnaPage.jsx`: 상세 뷰(`view="detail"`) 직접 진입 시에도 타인의 `PRIVATE` 질문인 경우 `notFound` ("질문을 찾을 수 없거나 비공개 질문입니다") 화면으로 차단.
- `QnaPage.test.jsx`: 타인의 `PRIVATE` 질문이 목록에 뜨지 않는 회귀 테스트(153번 줄) 구현.
#### 2. 답변 상태 필터 및 페이지 정보 추가
- `QnaPage.jsx`: `답변 상태 필터` 드롭다운(`ALL`, `OPEN`, `ANSWERED`) 및 하단 `이전`/`다음` 페이지네이션 버튼 UI 추가.
- `onSearch` 호출 시 `{ query, category, answerStatus, page }` 4개 필드 규격 전달.
- `QnaPage.test.jsx`: 답변 상태 및 페이지 파라미터가 `onSearch`에 정확히 전달되는 테스트(167번 줄) 구현.
#### 3. 키보드로 질문 상세 열기 (키보드 접근성 FE-3.3 계약)
- `QnaPage.jsx`: 질문 카드 목록 항목을 시맨틱 `<button type="button" aria-label={`질문 상세: ${item.title}`}>`으로 바꾸어 키보드 포커스 가능하도록 변경.
- `QnaPage.css`: 기존 둥근 카드 디자인 레이아웃 유지.
- `QnaPage.test.jsx`: `Tab` 키로 카드 버튼 이동 후 `Enter` 키 누를 때 `onSelect` 1회 호출 테스트(183번 줄) 구현.
#### 4. 빠진 입력 검증 및 경계값 개별 테스트 추가
- `QnaPage.test.jsx`에 6개 신규 테스트(11~16번)를 독립적으로 작성:
  - 제목 1자 / 120자 저장 됨
  - 제목 0자 / 121자 저장 안 됨 (콜백 미호출 및 오류 문구 노출)
  - 본문 1자 / 5000자 저장 됨
  - 본문 0자 / 5001자 저장 안 됨 (콜백 미호출 및 오류 문구 노출)
  - 유효하지 않은 입력 시 `onSubmit` / `onEdit` 콜백 미호출 단정
  - 올바른 수정 화면에서 `onEdit`으로 4개 승인 객체 전달 단정
#### 5. 수정 화면(`view="edit"`) 직접 진입 방어
- `QnaPage.jsx`: `view="edit"` 진입 시 작성자 본인이 아니거나 답변이 끝난(`OPEN`이 아닌) 질문은 수정 폼 진입 및 `onEdit` 호출을 직접 차단하고 안내 메시지 렌더링.
- `QnaPage.test.jsx`: 타인 질문 및 답변 완료 질문으로 `view="edit"` 직접 진입 시 폼 미노출 및 `onEdit` 미호출 테스트(17번, 18번) 구현.
#### 6. Fixture 및 README 정리
- `qnaFixture.js`: `qna-3`부터 `qna-8`까지 상세 화면 조회에 필요한 `body` 속성 텍스트 보완 완료.
- `README.md`: 작업 내용, 수정한 테스트와 추가한 테스트 묶음 내역, 키보드 조작 결과 및 Mock 한계 설명 정리 완료.