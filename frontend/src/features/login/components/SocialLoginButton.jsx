import './SocialLoginButton.css';

export default function SocialLoginButton({ provider, disabled, onClick }) {
    // provider 문자열을 소문자(kakao, naver, google)로 변환해 클래스로 사용
    const providerClass = provider ? provider.toLowerCase() : '';
    return (
        <button
            className={`social-login-btn ${providerClass}`}
            disabled={disabled}
            onClick={onClick}
        >
            {provider}로 시작하기
        </button>
    );
}