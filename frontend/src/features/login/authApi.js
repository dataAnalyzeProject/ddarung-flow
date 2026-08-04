const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080';

export function startSocialLogin(provider) {
    window.location.assign(`${API_BASE_URL}/api/v1/auth/oauth2/${provider.toLowerCase()}/start`);
}

export async function getCurrentUser() {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error('로그인 상태를 확인할 수 없습니다.');
    }

    return response.json();
}

export async function logout() {
    const csrfResponse = await fetch(`${API_BASE_URL}/api/v1/auth/csrf`, {
        credentials: 'include',
    });

    if (!csrfResponse.ok) {
        throw new Error('CSRF 토큰을 가져오지 못했습니다.');
    }

    const csrf = await csrfResponse.json();
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            [csrf.headerName]: csrf.token,
        },
    });

    if (!response.ok) {
        throw new Error('로그아웃에 실패했습니다.');
    }
}
