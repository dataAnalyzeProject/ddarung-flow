import { fetchSubscription, startCheckout } from './subscriptionApi';

function jsonResponse(body, ok = true) {
  return { ok, json: jest.fn().mockResolvedValue(body) };
}

describe('subscriptionApi', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads the current subscription with the session cookie', async () => {
    fetch.mockResolvedValue(jsonResponse({ status: 'FREE' }));

    await expect(fetchSubscription()).resolves.toEqual({ status: 'FREE' });
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/me/subscription', expect.objectContaining({
      credentials: 'include',
    }));
  });

  test('gets a CSRF token before posting only planId for a server-side checkout', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'READY', orderId: 'order-1' }));

    await expect(startCheckout('PREMIUM_MONTHLY_30D')).resolves.toEqual({ status: 'READY', orderId: 'order-1' });
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:8080/api/v1/auth/csrf', expect.objectContaining({
      credentials: 'include',
    }));
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080/api/v1/payments/checkout', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ planId: 'PREMIUM_MONTHLY_30D' }),
      credentials: 'include',
      headers: expect.objectContaining({ 'X-CSRF-TOKEN': 'csrf-token' }),
    }));
  });

  test('does not post checkout when the CSRF request fails', async () => {
    fetch.mockResolvedValue(jsonResponse({ code: 'CSRF_TOKEN_UNAVAILABLE' }, false));

    await expect(startCheckout('PREMIUM_MONTHLY_30D')).rejects.toThrow('CSRF_TOKEN_UNAVAILABLE');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('returns the checkout server domain code after a successful CSRF request', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ headerName: 'X-CSRF-TOKEN', token: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse({ code: 'PAYMENT_NOT_ENABLED' }, false));

    await expect(startCheckout('PREMIUM_MONTHLY_30D')).rejects.toThrow('PAYMENT_NOT_ENABLED');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
