const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';

function loadTossPayments() {
  if (window.TossPayments) return Promise.resolve(window.TossPayments);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${TOSS_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.TossPayments));
      existing.addEventListener('error', () => reject(new Error('PAYMENT_NOT_ENABLED')));
      return;
    }

    const script = document.createElement('script');
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.onload = () => window.TossPayments ? resolve(window.TossPayments) : reject(new Error('PAYMENT_NOT_ENABLED'));
    script.onerror = () => reject(new Error('PAYMENT_NOT_ENABLED'));
    document.head.appendChild(script);
  });
}

export async function requestTossCheckout(checkout, { onCancel } = {}) {
  const clientKey = process.env.REACT_APP_TOSS_PAYMENTS_CLIENT_KEY;
  if (!clientKey || !clientKey.startsWith('test_')) throw new Error('PAYMENT_NOT_ENABLED');

  const TossPayments = await loadTossPayments();
  const widgets = TossPayments(clientKey).widgets({ customerKey: checkout.customerKey });
  const successUrl = new URL(window.location.href);
  successUrl.searchParams.set('payment', 'processing');
  const failUrl = new URL(window.location.href);
  failUrl.searchParams.set('payment', 'failed');

  await widgets.setAmount({ value: checkout.amount, currency: checkout.currency });
  const paymentWindow = await widgets.renderPaymentWindow();
  paymentWindow.on('paymentRequest', () => {
    const paymentRequest = widgets.requestPayment({
      orderId: checkout.orderId,
      orderName: checkout.planId === 'PREMIUM_YEARLY_365D' ? '따릉이 프리미엄 연간 가이드' : '따릉이 프리미엄 월간 가이드',
      successUrl: successUrl.toString(),
      failUrl: failUrl.toString(),
    });
    if (typeof paymentRequest?.catch === 'function') paymentRequest.catch(() => onCancel?.());
  });
  paymentWindow.on('cancel', () => onCancel?.());
  return paymentWindow;
}
