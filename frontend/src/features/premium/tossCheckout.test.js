import { requestTossCheckout } from './tossCheckout';

describe('requestTossCheckout', () => {
  const originalKey = process.env.REACT_APP_TOSS_PAYMENTS_CLIENT_KEY;

  afterEach(() => {
    process.env.REACT_APP_TOSS_PAYMENTS_CLIENT_KEY = originalKey;
    delete window.TossPayments;
    document.querySelectorAll('script[src="https://js.tosspayments.com/v2/standard"]').forEach((node) => node.remove());
  });

  test('does not load the provider SDK without a test client key', async () => {
    delete process.env.REACT_APP_TOSS_PAYMENTS_CLIENT_KEY;

    await expect(requestTossCheckout({ orderId: 'order-123456', amount: 2900, currency: 'KRW' }))
      .rejects.toThrow('PAYMENT_NOT_ENABLED');
    expect(document.querySelector('script[src="https://js.tosspayments.com/v2/standard"]')).not.toBeInTheDocument();
  });

  test('opens a payment window with the server checkout response', async () => {
    process.env.REACT_APP_TOSS_PAYMENTS_CLIENT_KEY = 'test_gck_example';
    const requestPayment = jest.fn().mockResolvedValue(undefined);
    const on = jest.fn();
    const renderPaymentWindow = jest.fn().mockResolvedValue({ on });
    const widgets = { setAmount: jest.fn().mockResolvedValue(undefined), renderPaymentWindow, requestPayment };
    window.TossPayments = jest.fn(() => ({ widgets: jest.fn(() => widgets) }));

    const onCancel = jest.fn();
    await requestTossCheckout({
      orderId: 'order-123456',
      customerKey: 'ddarung-550e8400-e29b-41d4-a716-446655440000',
      planId: 'PREMIUM_MONTHLY_30D',
      amount: 2900,
      currency: 'KRW',
    }, { onCancel });

    expect(window.TossPayments).toHaveBeenCalledWith('test_gck_example');
    expect(widgets.setAmount).toHaveBeenCalledWith({ value: 2900, currency: 'KRW' });
    expect(renderPaymentWindow).toHaveBeenCalledWith();
    expect(on).toHaveBeenCalledWith('paymentRequest', expect.any(Function));
    expect(on).toHaveBeenCalledWith('cancel', expect.any(Function));

    await on.mock.calls[0][1]();
    expect(requestPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-123456',
      successUrl: expect.stringContaining('payment=processing'),
      failUrl: expect.stringContaining('payment=failed'),
    }));

    on.mock.calls.find(([eventName]) => eventName === 'cancel')[1]();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
