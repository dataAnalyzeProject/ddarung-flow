-- H2 Q&A test fixture
-- Clears tables and populates sample users and questions

DELETE FROM questions;
DELETE FROM users;

-- Users
INSERT INTO users (id, public_id, provider, provider_user_id, display_name, email, role, created_at, updated_at)
VALUES (100, '11111111-1111-1111-1111-111111111111', 'google', 'user-1-provider', '사용자1', 'user1@example.com', 'USER', NOW(), NOW());

INSERT INTO users (id, public_id, provider, provider_user_id, display_name, email, role, created_at, updated_at)
VALUES (101, '22222222-2222-2222-2222-222222222222', 'naver', 'user-2-provider', '사용자2', 'user2@example.com', 'USER', NOW(), NOW());

-- Questions
-- 1. SERVICE category, PUBLIC, ANSWERED
INSERT INTO questions (id, public_id, author_id, category, visibility, status, title, body, answer, created_at, updated_at)
VALUES (1000, 'a1111111-1111-1111-1111-111111111111', 100, 'SERVICE', 'PUBLIC', 'ANSWERED', '목적지 검색이 안 됩니다', '목적지를 검색해도 결과가 나오지 않습니다. 어떻게 해결할 수 있나요?', '검색어를 다시 확인해 주세요.', DATEADD('HOUR', -2, NOW()), NOW());

-- 2. PREDICTION category, PUBLIC, OPEN
INSERT INTO questions (id, public_id, author_id, category, visibility, status, title, body, answer, created_at, updated_at)
VALUES (1001, 'b2222222-2222-2222-2222-222222222222', 101, 'PREDICTION', 'PUBLIC', 'OPEN', '도착 시간 기준은 어떻게 계산하나요?', '추천 결과에 표시되는 도착 시간의 계산 기준이 궁금합니다.', NULL, DATEADD('HOUR', -5, NOW()), NOW());

-- 3. ACCOUNT category (forced PRIVATE), ANSWERED
INSERT INTO questions (id, public_id, author_id, category, visibility, status, title, body, answer, created_at, updated_at)
VALUES (1002, 'c3333333-3333-3333-3333-333333333333', 100, 'ACCOUNT', 'PRIVATE', 'ANSWERED', '저장한 경로가 보이지 않아요', '보관함에 저장한 경로가 표시되지 않습니다.', '현재 로그인한 계정을 확인한 뒤 보관함을 다시 열어 주세요.', DATEADD('DAY', -1, NOW()), NOW());

-- 4. LOCATION category (forced PRIVATE), OPEN
INSERT INTO questions (id, public_id, author_id, category, visibility, status, title, body, answer, created_at, updated_at)
VALUES (1003, 'd4444444-4444-4444-4444-444444444444', 101, 'LOCATION', 'PRIVATE', 'OPEN', '위치 권한 오류 발생', '앱에서 위치 접근 권한을 요구합니다.', NULL, DATEADD('DAY', -2, NOW()), NOW());
