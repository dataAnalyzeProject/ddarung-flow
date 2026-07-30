# 로그인 서버 작업 시작하기

이 폴더는 Java 21과 Spring Boot 3.5로 만든 실행 가능한 기본 서버입니다.

## 테스트

```powershell
.\gradlew.bat test
```

## 실행

```powershell
.\gradlew.bat bootRun
```

터미널에 `Started BackendApplication`이 표시되면 기본 서버가 정상입니다. 아직 별도의 API 주소는 만들지 않았습니다.

## 로그인 담당자가 수정할 곳

`src/main/java/com/ddarungflow/auth/`

자세한 순서와 완료 조건은 그 폴더의 `README.md`를 먼저 읽습니다.

## 조장에게 먼저 물어봐야 하는 변경

- `schema.sql`과 사용자 자료 구조
- 여러 화면이 함께 사용하는 요청·응답 형식
- 쿠키와 보안 설정
- Docker Compose
- 실제 카카오·네이버·구글 비밀키 사용

비밀키는 코드나 GitHub에 절대 올리지 않습니다.
