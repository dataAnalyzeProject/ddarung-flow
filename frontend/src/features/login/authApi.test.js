describe('OAuth 시작 주소', () => {
  const originalApiBaseUrl = process.env.REACT_APP_API_BASE_URL;
  const originalAuthBaseUrl = process.env.REACT_APP_AUTH_BASE_URL;

  afterEach(() => {
    process.env.REACT_APP_API_BASE_URL = originalApiBaseUrl;
    process.env.REACT_APP_AUTH_BASE_URL = originalAuthBaseUrl;
    jest.resetModules();
  });

  test('별도 인증 주소가 있으면 OAuth 시작에 사용한다', () => {
    process.env.REACT_APP_API_BASE_URL = 'http://localhost:3000';
    process.env.REACT_APP_AUTH_BASE_URL = 'http://localhost:8080';

    jest.isolateModules(() => {
      const { getSocialLoginUrl } = require('./authApi');
      expect(getSocialLoginUrl('Google')).toBe('http://localhost:8080/api/v1/auth/oauth2/google/start');
    });
  });
});

describe('세션 조회', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('실패 응답의 HTTP 상태를 호출 화면에 전달한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const { getCurrentUser } = require('./authApi');

    await expect(getCurrentUser()).rejects.toMatchObject({ status: 401 });
  });
});
