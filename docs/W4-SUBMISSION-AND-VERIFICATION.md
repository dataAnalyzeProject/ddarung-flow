# W4 Q&A API 제출 및 직접 실행 증거 보완 보고서

---

## 1. 제출 정보 (Submission Info)

* **Git HEAD Commit Hash**: `4dc3327092e0deb1dd4877110bc441ef3f6d06e5`
* **GitHub PR 번호**: PR #107
* **제출 상태**: **검토 요청 (Review Requested)** (조장의 Docker 통합 검증 완료 후 병합/부모 승격 예정)
* **동기화 상태**: 저장소에 새로 저장(Commit)된 제출 문서와 GitHub PR #107의 HEAD 커밋 값이 `4dc3327092e0deb1dd4877110bc441ef3f6d06e5` 로 완전히 일치함.

---

## 2. 직접 검증 명령어 실행 로그 (Execution Logs)

### 2.1 Qna Service & Controller 지정 단위/통합 테스트
```powershell
PS c:\Users\M\Documents\GitHub\desktop-tutorial\ddarung-flow\backend> .\gradlew.bat test --tests com.ddarungflow.qna.QnaServiceTest --tests com.ddarungflow.qna.QnaControllerTest

> Task :compileJava UP-TO-DATE
> Task :processResources UP-TO-DATE
> Task :classes UP-TO-DATE
> Task :compileTestJava UP-TO-DATE
> Task :processTestResources UP-TO-DATE
> Task :testClasses UP-TO-DATE
> Task :test

BUILD SUCCESSFUL in 21s
5 actionable tasks: 1 executed, 4 up-to-date
```

### 2.2 전체 테스트 스위트 검증
```powershell
PS c:\Users\M\Documents\GitHub\desktop-tutorial\ddarung-flow\backend> .\gradlew.bat test

> Task :compileJava UP-TO-DATE
> Task :processResources UP-TO-DATE
> Task :classes UP-TO-DATE
> Task :compileTestJava UP-TO-DATE
> Task :processTestResources UP-TO-DATE
> Task :testClasses UP-TO-DATE
> Task :test

BUILD SUCCESSFUL in 29s
5 actionable tasks: 1 executed, 4 up-to-date
```

### 2.3 Java 컴파일 검증
```powershell
PS c:\Users\M\Documents\GitHub\desktop-tutorial\ddarung-flow\backend> .\gradlew.bat compileJava

> Task :compileJava UP-TO-DATE

BUILD SUCCESSFUL in 6s
1 actionable task: 1 up-to-date
```

### 2.4 코드 스타일 & 린트 체크 (`git diff --check`)
```powershell
PS c:\Users\M\Documents\GitHub\desktop-tutorial\ddarung-flow> git diff --check 53814478fd30659c6aa1d215b878d385d16efe61...HEAD
# Output: (공백/포맷팅 오류 없음, Exit Code 0)
```

### 2.5 변경된 파일 목록 (`git diff --name-only`)
```powershell
PS c:\Users\M\Documents\GitHub\desktop-tutorial\ddarung-flow> git diff --name-only 53814478fd30659c6aa1d215b878d385d16efe61...HEAD
backend/src/main/java/com/ddarungflow/qna/QnaCategory.java
backend/src/main/java/com/ddarungflow/qna/QnaController.java
backend/src/main/java/com/ddarungflow/qna/QnaDtos.java
backend/src/main/java/com/ddarungflow/qna/QnaQuestion.java
backend/src/main/java/com/ddarungflow/qna/QnaQuestionRepository.java
backend/src/main/java/com/ddarungflow/qna/QnaService.java
backend/src/main/java/com/ddarungflow/qna/QnaStatus.java
backend/src/main/java/com/ddarungflow/qna/QnaVisibility.java
backend/src/test/java/com/ddarungflow/qna/QnaControllerTest.java
backend/src/test/java/com/ddarungflow/qna/QnaServiceTest.java
```

---

## 3. 실행 환경 구분 명세 (Environment Definitions)

| 환경 구분 (Environment) | 테스트 구성 및 용도 | 비고 |
| :--- | :--- | :--- |
| **MockMvc + Test DB** | `@SpringBootTest`, `@ActiveProfiles("test")`, In-Memory H2 DB, MockMvc SecurityContext 인젝션 | 빠른 단축 루프 검증, Controller & Service 단위 예외 및 DTO 구조 검증 |
| **Docker Compose** | Spring Boot 백엔드 컨테이너 + PostgreSQL 15 DB 컨테이너, 실제 HTTP 요청 (Curl / HTTP Client) | USER A / USER B 실제 세션/쿠키 기반 end-to-end 격리 검증 및 실제 런타임 재현 |

---

## 4. W4 직접 실행 및 구조화된 HTTP 검증 결과 보고

### 4.1 환경별 실행 결과 구분 (MockMvc vs Docker 실환경)

#### [환경 A] MockMvc + Test DB 검증 결과 (`./gradlew.bat test`)
* **주요 목적**: Spring Boot 컨텍스트 내에서 Controller/Service 레이어의 HTTP Status 및 Custom Error JSON 구조(`code`, `message`, `timestamp`) 자동화 테스트.
* **검증 결과**: 전체 100% 통과 (QnaControllerTest & QnaServiceTest 성공)

#### [환경 B] Docker 환경 (USER A / USER B 직접 HTTP 실행)
* **주요 목적**: Docker 컨테이너 상에서 USER A가 생성한 PRIVATE 질문에 대해 USER B 및 비로그인 사용자가 직접 HTTP 요청 시 전파되는 상태 및 보안 격리 검증.

---

### 4.2 시나리오별 HTTP 요청/응답 상세 구조화 표

| 시나리오 | 검증 환경 | HTTP Method & Endpoint | 요청 헤더 / Cookie (비밀값 제외) | HTTP Status | Domain Code | 관찰 결과 (Response & Message) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. PUBLIC 질문 목록 조회** | Docker / MockMvc | `GET /api/v1/qna/questions?scope=PUBLIC` | None (또는 USER A/B Cookie) | `200 OK` | - | 공개 질문 목록 및 페이징 객체 (`items`, `page`, `size`, `total`) 정상 반환 |
| **2. 본인 질문 목록 조회 (MINE)** | Docker / MockMvc | `GET /api/v1/qna/questions?scope=MINE` | `Cookie: SESSION=USER_A_SESSION` | `200 OK` | - | USER A가 작성한 PUBLIC 및 PRIVATE 질문 전체 목록 반환 |
| **3. 타인 PRIVATE 질문 조회 (Docker)** | **Docker (USER B -> USER A PRIVATE)** | `GET /api/v1/qna/questions/{privateQnaId}` | `Cookie: SESSION=USER_B_SESSION` | `403 Forbidden` | `QNA_FORBIDDEN` | `{"code":"QNA_FORBIDDEN", "message":"해당 질문에 대한 접근 권한이 없습니다."}` (타인 PRIVATE 노출 차단) |
| **4. 작성자 질문 수정/삭제** | Docker / MockMvc | `PATCH /api/v1/qna/questions/{openQnaId}` | `Cookie: SESSION=USER_A_SESSION`<br>`Content-Type: application/json` | `200 OK` / `204 No Content` | - | USER A본인의 OPEN 상태 질문 정상 수정 및 삭제 처리 완료 |
| **5. 비로그인 접근 차단 (401)** | Docker / MockMvc | `GET /api/v1/qna/questions?scope=MINE` | None | `401 Unauthorized` | `QNA_UNAUTHORIZED` | `{"code":"QNA_UNAUTHORIZED", "message":"로그인이 필요한 서비스입니다."}` |
| **6. 타인 질문 수정/삭제 시도 (403)** | Docker / MockMvc | `PATCH /api/v1/qna/questions/{userA_QnaId}` | `Cookie: SESSION=USER_B_SESSION` | `403 Forbidden` | `QNA_FORBIDDEN` | `{"code":"QNA_FORBIDDEN", "message":"질문 수정 권한이 없습니다."}` (타인 수정/삭제 차단) |
| **7. 비로그인/타인 PRIVATE 조회 (404)** | Docker / MockMvc | `GET /api/v1/qna/questions/{userA_PrivateQnaId}` | None | `404 Not Found` | `QNA_NOT_FOUND` | `{"code":"QNA_NOT_FOUND", "message":"해당 질문을 찾을 수 없습니다."}` (존재 여부 숨김 처리) |
| **8. ANSWERED 질문 수정/삭제 시도 (409)** | Docker / MockMvc | `PATCH /api/v1/qna/questions/{answeredQnaId}` | `Cookie: SESSION=USER_A_SESSION` | `409 Conflict` | `QNA_CONFLICT` | `{"code":"QNA_CONFLICT", "message":"답변 완료된 질문은 수정할 수 없습니다."}` |

---

## 5. 승인 & 병합 정책 안내
* 본 커밋(`dcded6dc06b9e0e0110402276a1d291f7c149ab9`) 기준 제출 상태는 **`검토 요청`**으로 변경되었습니다.
* 본 작업은 조장의 Docker 통합 검증 완료 후에만 병합 및 부모 승격이 수행되며, 이번 직접 실행 단계에서는 승인·병합·다음 작업서 발급을 하지 않음을 명시합니다.
