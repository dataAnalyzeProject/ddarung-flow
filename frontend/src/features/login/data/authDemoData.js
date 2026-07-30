// 1. 로그인 상태 목록 (Enums)
export const LOGIN_STATUS = {
    WAITING: 'WAITING',
    LOADING: 'LOADING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED',
    LOGGED_OUT: 'LOGGED_OUT',
    LOGGING_OUT: 'LOGGING_OUT',
};
// 2. 가짜 사용자 정보 예시 (소셜 제공자별 시뮬레이션 데이터)
export const MOCK_USERS = {
    Kakao: {
        id: 'kakao_12345',
        name: '김따릉',
        email: 'ttarung@kakao.com',
        provider: 'Kakao',
        profileImage: 'https://via.placeholder.com/150/FEE500/000000?text=Kakao',
    },
    Naver: {
        id: 'naver_67890',
        name: '박네이버',
        email: 'naver_user@naver.com',
        provider: 'Naver',
        profileImage: 'https://via.placeholder.com/150/03C75A/FFFFFF?text=Naver',
    },
    Google: {
        id: 'google_11223',
        name: '홍길동',
        email: 'hong@gmail.com',
        provider: 'Google',
        profileImage: 'https://via.placeholder.com/150/4285F4/FFFFFF?text=Google',
    },
};
// 3. 상태별 안내 메시지 및 표출 텍스트 정리
export const STATUS_MESSAGES = {
    [LOGIN_STATUS.WAITING]: {
        notice: '상태 : 로그인 전',
        description: '예측을 확인하려면 로그인이 필요합니다.',
    },
    [LOGIN_STATUS.LOADING]: {
        notice: '소셜 인증 서버와 통신 중입니다...',
        description: '잠시만 기다려주세요.',
    },
    [LOGIN_STATUS.FAILED]: {
        notice: '로그인에 실패했습니다.',
        description: '인증 서버 응답이 없거나 네트워크 오류입니다.',
    },
    [LOGIN_STATUS.CANCELLED]: {
        notice: '로그인이 취소되었습니다.',
        description: '사용자가 소셜 인증 동의를 취소했습니다.',
    },
    [LOGIN_STATUS.EXPIRED]: {
        notice: '세션이 만료되었습니다.',
        description: '30분간 활동이 없어 안전을 위해 로그아웃되었습니다.',
    },
    [LOGIN_STATUS.LOGGING_OUT]: {
        notice: '로그아웃 중입니다...',
        description: '세션 정보를 정리하고 있습니다.',
    },
    [LOGIN_STATUS.LOGGED_OUT]: {
        notice: '로그아웃되었습니다.',
        description: '다시 서비스를 이용하시려면 로그인해주세요.',
    },
};