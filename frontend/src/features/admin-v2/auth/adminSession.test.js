import { adminFetch, clearAdminReturnTarget, consumeAdminReturnTarget, normalizeAdminReturnTarget, storeAdminReturnTarget, subscribeAdminAuthRequired } from './adminSession.js';

describe('adminSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/admin/ops/risk-map?view=hour');
  });

  test.each(['http://evil.example', 'https://evil.example', '//evil.example', 'javascript:alert(1)', 'data:text/html,x', '/stations/1'])('rejects unsafe return target %s', (value) => {
    expect(normalizeAdminReturnTarget(value)).toBeNull();
  });

  test('stores and consumes only an internal admin path with its query', () => {
    expect(storeAdminReturnTarget()).toBe('/admin/ops/risk-map?view=hour');
    expect(consumeAdminReturnTarget()).toBe('/admin/ops/risk-map?view=hour');
    expect(consumeAdminReturnTarget()).toBeNull();
  });

  test('removes an invalid stored value', () => {
    sessionStorage.setItem('ddarung.admin.return-target.v1', '//evil.example');
    expect(consumeAdminReturnTarget()).toBeNull();
    expect(sessionStorage.getItem('ddarung.admin.return-target.v1')).toBeNull();
  });

  test('publishes a signal for an actual admin 401 only', async () => {
    const onRequired = jest.fn();
    const unsubscribe = subscribeAdminAuthRequired(onRequired);
    global.fetch = jest.fn().mockResolvedValue({ status: 401 });

    await adminFetch('http://localhost/api/v1/admin/ops/overview');
    await adminFetch('http://localhost/api/v1/auth/me');

    expect(onRequired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  afterEach(() => clearAdminReturnTarget());
});
