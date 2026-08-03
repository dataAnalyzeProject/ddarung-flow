import './SocialLoginButton.css';

export default function SocialLoginButton({ provider, iconUrl, disabled, onClick }) {
    // provider 문자열을 소문자(kakao, naver, google)로 변환해 클래스로 사용
    const providerClass = provider ? provider.toLowerCase() : '';

    return (
        <button
            className={`social-login-btn ${providerClass}`}
            disabled={disabled}
            onClick={onClick}
            title={`${provider} 로그인`}
        >

            <img
                src={iconUrl}
                alt={`${provider} 로그인`}
                className="btn-image"
            />
        </button>
    );
}