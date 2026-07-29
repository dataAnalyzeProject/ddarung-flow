# Backend

Java 21, Spring Boot 3.5, Gradle Wrapper 기반 서비스 API 영역입니다.

주요 책임:

- PostgreSQL 연결과 스키마 검증
- Spring Security 서버 세션과 HttpOnly 쿠키 인증
- `VIEWER`, `ADMIN` 권한 구분
- 대여소·재고·예측·평가 조회
- 관심 대여소·검토 상태·메모 저장

현재는 폴더 경계만 확정하며 Spring 프로젝트 파일은 백엔드 담당 작업에서 생성합니다.
