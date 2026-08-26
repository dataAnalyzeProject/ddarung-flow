const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.code || 'SUBSCRIPTION_REQUEST_FAILED');
  }
  return body;
}

export function fetchSubscription() {
  return request('/api/v1/me/subscription');
}

export async function startCheckout(planId) {
  const csrf = await request('/api/v1/auth/csrf');
  return request('/api/v1/payments/checkout', {
    method: 'POST',
    body: JSON.stringify({ planId }),
    headers: {
      [csrf.headerName]: csrf.token,
    },
  });
}

export async function confirmPayment({ paymentKey, orderId, amount }) {
  const csrf = await request('/api/v1/auth/csrf');
  return request('/api/v1/payments/confirm', {
    method: 'POST',
    body: JSON.stringify({ paymentKey, orderId, amount: String(amount) }),
    headers: {
      [csrf.headerName]: csrf.token,
    },
  });
}
