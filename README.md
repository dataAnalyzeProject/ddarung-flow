# 따릉이 도착시점 대여 가능성 서비스

사용자가 자전거를 빌리려는 곳까지 가는 시간을 계산하고, 도착했을 때 자전거가 남아 있을 가능성을 보여 주는 소비자용 웹 서비스입니다.

현재 단계에서는 세 명의 조원이 서로 파일을 건드리지 않고 시작할 수 있도록 기본 골격만 준비합니다.

## 먼저 맡을 세 작업

| 작업 | 작업 폴더 | 무엇을 만들면 되는가 |
|---|---|---|
| 로그인 화면 | `frontend/src/features/login/` | 카카오·네이버·구글 로그인 화면 |
| 메인 화면 예시안 | `frontend/src/features/main-screen-drafts/` | 지도 중심 화면을 서로 다른 방식으로 3~4개 |
| 로그인 서버 | `backend/src/main/java/com/ddarungflow/auth/` | 소셜 로그인과 로그인 상태 확인 |

각 폴더의 `README.md`에 만들어야 하는 폴더·파일 이름, 각 파일의 역할, 입력할 명령, 작업 순서와 완료 조건을 적어 두었습니다.

백엔드 로그인 담당자는 조장이 승인된 ERD를 전달하기 전까지 사용자 Entity와 Repository를 만들지 않습니다. ERD를 받은 뒤 표와 칸 이름을 그대로 사용합니다.

## 실행 준비

필요한 프로그램:

- Node.js 18 이상
- Java 21

프론트 실행:

```powershell
cd frontend
npm install
npm start
```

백엔드 테스트:

```powershell
cd backend
.\gradlew.bat test
```

백엔드 실행:

```powershell
cd backend
.\gradlew.bat bootRun
```

실행 후 오류 없이 Spring Boot가 시작되면 기본 서버가 정상입니다. 아직 API 주소는 만들지 않습니다.

## 꼭 지킬 작업 규칙

1. 자신의 작업 폴더부터 수정합니다.
2. 다른 사람 폴더나 공통 파일을 바꿔야 하면 먼저 조장에게 알립니다.
3. 비밀키와 비밀번호는 GitHub에 올리지 않습니다.
4. 작업이 끝나면 실행 방법, 확인 결과, 아직 안 되는 부분을 기록합니다.
5. 실행과 검토가 끝나기 전에는 완료로 표시하지 않습니다.

`test1.py`, `test2.py`, `TSETS.PY`는 기존 임시 파일이므로 별도 정리 결정 전까지 유지합니다.

## 예측 대상 시각 및 예측 지평(Horizon) 상태 규칙

- **목표 정시 계산**: `floorToHour(arrivalAt + 30분)` (도착 예정시각에 30분을 더한 후 정시 단위 절삭. 정확히 30분인 경우 다음 정시 선택)
- **오프셋 및 지평 계산**: 
  - `targetOffsetMinutes = predictionTargetAt - featureAsOf`
  - `horizonMinutes = predictionTargetAt - featureAsOf`
- **상태 구분**:
  - 목표 정시가 요청시각(`featureAsOf`) 이하인 경우 (과거 또는 현재 정시): `TOO_SOON`
  - `horizonMinutes`가 60, 120, 180, 240분인 경우: `NORMAL`
  - 그 외의 미래 `horizonMinutes`인 경우: `UNAVAILABLE`

