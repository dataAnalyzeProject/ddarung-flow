import { requestTossCheckout } from './tossCheckout';

describe('requestTossCheckout', () => {
  const originalKey = process.env.REACT_APP_TOSS_CLIENT_KEY;

  afterEach(() => {
    process.env.REACT_APP_TOSS_CLIENT_KEY = originalKey;
    delete window.TossPayments;
    document.querySelectorAll('script[src="https://js.tosspayments.com/v2/standard"]').forEach((node) => node.remove());
  });

  test('does not load the provider SDK without a test client key', async () => {
    delete process.env.REACT_APP_TOSS_CLIENT_KEY;

    await expect(requestTossCheckout({ orderId: 'order-123456', amount: 2900, currency: 'KRW' }))
      .rejects.toThrow('PAYMENT_NOT_ENABLED');
    expect(document.querySelector('script[src="https://js.tosspayments.com/v2/standard"]')).not.toBeInTheDocument();
  });

  test('uses only the server checkout response when requesting payment', async () => {
    process.env.REACT_APP_TOSS_CLIENT_KEY = 'test_ck_example';
    const requestPayment = jest.fn().mockResolvedValue(undefined);
    window.TossPayments = jest.fn(() => ({ payment: jest.fn(() => ({ requestPayment })) }));

    await requestTossCheckout({
      orderId: 'order-123456',
      planId: 'PREMIUM_MONTHLY_30D',
      amount: 2900,
      currency: 'KRW',
    });

    expect(window.TossPayments).toHaveBeenCalledWith('test_ck_example');
    expect(requestPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-123456',
      amount: { value: 2900, currency: 'KRW' },
    }));
  });
});
