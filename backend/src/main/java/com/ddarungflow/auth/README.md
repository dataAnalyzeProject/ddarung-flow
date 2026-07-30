# 로그인 백엔드 담당자 작업 지시서

백엔드는 ERD를 받은 뒤 만드는 파일과 ERD 없이 먼저 만들 수 있는 파일을 구분합니다.

## 1. 이 작업의 결과

카카오·네이버·구글 로그인 성공 후 서버가 로그인 상태를 기억하고, 화면이 현재 로그인 사용자를 확인하거나 로그아웃할 수 있게 만듭니다.

## 2. 작업할 폴더

기본 작업 위치:

`backend/src/main/java/com/ddarungflow/auth/`

테스트 위치:

`backend/src/test/java/com/ddarungflow/auth/`

이 두 폴더 밖의 파일을 바꿔야 하면 먼저 조장 또는 백엔드 검토자에게 알립니다.

## 3. 먼저 알아둘 말

- **Controller:** 화면에서 보낸 요청을 처음 받는 파일
- **Service:** 로그인 처리를 순서대로 수행하는 파일
- **DTO:** 화면과 서버가 주고받을 자료 모양을 적는 파일
- **Entity:** 데이터베이스 표 한 줄을 Java로 표현한 파일
- **Repository:** 데이터베이스에서 사용자를 찾거나 저장하는 파일
- **세션:** 서버가 로그인 상태를 기억하는 정보
- **쿠키:** 브라우저가 자신의 세션을 찾기 위해 가지고 다니는 값
- **ERD:** 데이터베이스 표와 표 사이의 관계를 그린 설계도

## 4. ERD를 받기 전에 만들 파일

먼저 아래 폴더를 만듭니다.

- `auth/controller/`
- `auth/service/`
- `auth/dto/`
- `auth/config/`
- 테스트 쪽의 `auth/controller/`

그다음 아래 파일을 만듭니다.

### `auth/controller/AuthController.java`

화면이 사용할 로그인 관련 주소를 모으는 파일입니다.

최종 주소는 검토 후 확정하지만 다음 기능이 필요합니다.

- 현재 로그인 여부 확인
- 로그아웃

### `auth/service/AuthService.java`

로그인한 사용자의 정보를 정리하는 파일입니다.

ERD가 오기 전에는 데이터베이스에 저장하지 않고, Spring Security가 알려 주는 로그인 정보만 DTO로 바꾸는 역할부터 만듭니다.

### `auth/dto/LoginUserResponse.java`

화면에 돌려줄 최소 사용자 정보를 적는 파일입니다.

ERD 확정 전 임시 항목:

- 로그인 여부
- 로그인 제공 회사 이름
- 화면에 보여 줄 이름

이메일은 필요성과 동의 범위를 확인하기 전에는 넣지 않습니다.

### `auth/config/OAuth2LoginConfig.java`

카카오·네이버·구글 로그인 성공·실패 흐름을 연결하는 파일입니다.

쿠키와 전체 보안 규칙에 영향을 주므로 작성 후 조장 또는 백엔드 검토자의 확인을 받아야 합니다.

### `src/test/java/com/ddarungflow/auth/controller/AuthControllerTest.java`

다음을 확인하는 테스트 파일입니다.

- 로그인하지 않은 사용자의 정보 요청
- 로그인한 사용자의 정보 요청
- 로그아웃 요청

## 5. ERD를 받으면 해야 할 일

조장이 승인된 ERD를 전달하기 전에는 Entity와 Repository 파일을 만들지 않습니다.

ERD를 받으면 먼저 다음 내용을 확인합니다.

1. 사용자 표의 정확한 이름
2. 각 칸의 정확한 이름과 자료 종류
3. 반드시 있어야 하는 값과 비어도 되는 값
4. 중복되면 안 되는 값
5. 다른 표와 연결되는 값
6. 카카오·네이버·구글 계정을 구분하는 방법

확인한 뒤 ERD에 적힌 이름을 기준으로 다음 위치에 파일을 만듭니다.

- `auth/entity/`: ERD의 사용자·소셜 계정 표를 Java로 표현
- `auth/repository/`: 사용자·소셜 계정 자료를 찾고 저장

파일 이름은 ERD의 표 이름이 확정된 뒤 조장과 함께 정합니다. 예를 들어 ERD 표가 `users`, `social_accounts`라면 `User.java`, `SocialAccount.java`, `UserRepository.java`, `SocialAccountRepository.java`처럼 정할 수 있습니다.

ERD와 다른 이름이나 칸을 편의상 추가하지 않습니다. 필요한 칸이 보이면 먼저 질문합니다.

## 6. 실제 비밀키를 넣기 전에 할 일

비밀키는 코드에 직접 적지 않습니다. 조장과 함께 환경변수 이름만 정하고 `.env.example`에 값 없이 이름만 기록합니다.

실제 카카오·네이버·구글 연결 전에 다음을 문서로 남깁니다.

- 필요한 환경변수 이름
- 각 회사에 등록할 Redirect URI
- 로그인 성공 후 돌아갈 화면 주소
- 로그인 실패 때 돌아갈 화면 주소

## 7. 작업 시작 명령

PowerShell을 열고 아래 명령을 한 줄씩 입력합니다.

```powershell
cd D:\GitHub\ddarung-flow\backend
.\gradlew.bat test
```

`BUILD SUCCESSFUL`이 보이면 준비가 된 것입니다.

서버 실행:

```powershell
.\gradlew.bat bootRun
```

## 8. 작업 순서

1. 기본 테스트가 성공하는지 확인합니다.
2. 4번의 폴더와 파일을 정확한 이름으로 만듭니다.
3. 가짜 로그인 사용자로 Controller 테스트를 먼저 만듭니다.
4. Controller와 Service를 만들어 테스트를 통과시킵니다.
5. ERD를 받을 때까지 Entity와 Repository 작업은 멈춥니다.
6. ERD를 받으면 5번의 확인 항목을 조장과 검토합니다.
7. 승인된 ERD 그대로 Entity와 Repository를 만듭니다.
8. 실행 명령, 테스트 결과, 아직 결정되지 않은 내용을 Notion 작업 카드에 남깁니다.

## 9. 완료 기준

- 로그인 전·로그인 후·로그아웃을 테스트로 확인합니다.
- ERD와 Entity의 표·칸 이름이 일치합니다.
- 비밀키가 GitHub에 들어가지 않습니다.
- `.\gradlew.bat test`가 성공합니다.
- 담당자가 Controller, Service, DTO, Entity, Repository의 차이를 자신의 말로 설명할 수 있습니다.
- 조장 또는 백엔드 검토자가 보안·DB 변경을 확인합니다.

## 10. 하지 말아야 할 일

- ERD를 받기 전에 사용자 Entity와 Repository 만들기
- ERD에 없는 칸 임의 추가
- 실제 Client ID·Secret 커밋
- 관리자 권한과 회원관리 기능 추가
- `schema.sql`, Docker Compose, 공통 설정을 승인 없이 수정
