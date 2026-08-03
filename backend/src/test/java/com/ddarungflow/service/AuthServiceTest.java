package com.ddarungflow.service;

import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UsersRepository usersRepository;

    @InjectMocks
    private AuthService authService;

    @Test
    @DisplayName("saves_new_oauth_user: 조회 없음 -> save 1회, publicId와 lastLoginAt 존재")
    void saves_new_oauth_user() {
        // given
        String provider = "kakao";
        String providerUserId = "kakao-100";
        String displayName = "따릉이 사용자";
        String email = null;
        OffsetDateTime now = OffsetDateTime.now();

        given(usersRepository.findByProviderAndProviderUserId("kakao", "kakao-100"))
                .willReturn(Optional.empty());
        given(usersRepository.save(any(Users.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        // when
        Users result = authService.saveOrUpdateOAuthUser(provider, providerUserId, displayName, email, now);

        // then
        assertThat(result).isNotNull();
        assertThat(result.getProvider()).isEqualTo("kakao");
        assertThat(result.getProviderUserId()).isEqualTo("kakao-100");
        assertThat(result.getDisplayName()).isEqualTo("따릉이 사용자");
        assertThat(result.getEmail()).isNull();
        assertThat(result.getPublicId()).isNotNull();
        assertThat(result.getLastLoginAt()).isEqualTo(now);

        verify(usersRepository).save(any(Users.class));
    }

    @Test
    @DisplayName("updates_existing_user_without_new_save: 조회 있음 -> 이름·email·lastLoginAt 갱신, save 신규 호출 없음")
    void updates_existing_user_without_new_save() {
        // given
        String provider = "google";
        String providerUserId = "google-200";
        String oldName = "이전이름";
        String newName = "새이름";
        String oldEmail = "old@example.com";
        String newEmail = "new@example.com";

        OffsetDateTime pastTime = OffsetDateTime.now().minusDays(1);
        OffsetDateTime now = OffsetDateTime.now();

        Users existingUser = new Users(provider, providerUserId, oldName, oldEmail, pastTime);

        given(usersRepository.findByProviderAndProviderUserId("google", "google-200"))
                .willReturn(Optional.of(existingUser));

        // when
        Users result = authService.saveOrUpdateOAuthUser(provider, providerUserId, newName, newEmail, now);

        // then
        assertThat(result.getDisplayName()).isEqualTo("새이름");
        assertThat(result.getEmail()).isEqualTo("new@example.com");
        assertThat(result.getCreatedAt()).isEqualTo(pastTime);
        assertThat(result.getUpdatedAt()).isEqualTo(now);
        assertThat(result.getLastLoginAt()).isEqualTo(now);

        // Dirty Checking 방식을 사용하므로 save 명시적 호출 없음
        verify(usersRepository, never()).save(any(Users.class));
    }

    @Test
    @DisplayName("allows_null_email")
    void allows_null_email() {
        // given
        OffsetDateTime now = OffsetDateTime.now();
        given(usersRepository.findByProviderAndProviderUserId("google", "google-200"))
                .willReturn(Optional.empty());
        given(usersRepository.save(any(Users.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        // when
        Users result = authService.saveOrUpdateOAuthUser("google", "google-200", "테스트유저", null, now);

        // then
        assertThat(result.getEmail()).isNull();
        verify(usersRepository).save(any(Users.class));
    }

    @Test
    @DisplayName("keeps_same_email_separate_when_provider_differs")
    void keeps_same_email_separate_when_provider_differs() {
        // given
        String sameEmail = "user@example.com";
        OffsetDateTime now = OffsetDateTime.now();

        given(usersRepository.findByProviderAndProviderUserId("google", "user-id"))
                .willReturn(Optional.empty());
        given(usersRepository.findByProviderAndProviderUserId("kakao", "user-id"))
                .willReturn(Optional.empty());
        given(usersRepository.save(any(Users.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        // when
        Users googleUser = authService.saveOrUpdateOAuthUser("google", "user-id", "구글사용자", sameEmail, now);
        Users kakaoUser = authService.saveOrUpdateOAuthUser("kakao", "user-id", "카카오사용자", sameEmail, now);

        // then
        assertThat(googleUser.getProvider()).isEqualTo("google");
        assertThat(kakaoUser.getProvider()).isEqualTo("kakao");
        assertThat(googleUser.getEmail()).isEqualTo(sameEmail);
        assertThat(kakaoUser.getEmail()).isEqualTo(sameEmail);
        assertThat(googleUser.getPublicId()).isNotEqualTo(kakaoUser.getPublicId());
    }

    @Test
    @DisplayName("rejects_unsupported_provider")
    void rejects_unsupported_provider() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> authService.saveOrUpdateOAuthUser("github", "gh-100", "유저", "test@test.com", now))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("지원하지 않는 Provider");
    }

    @Test
    @DisplayName("rejects_blank_provider_user_id")
    void rejects_blank_provider_user_id() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> authService.saveOrUpdateOAuthUser("google", "   ", "유저", "test@test.com", now))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ProviderUserId는 필수 입력값입니다");
    }

    @Test
    @DisplayName("rejects_blank_display_name")
    void rejects_blank_display_name() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> authService.saveOrUpdateOAuthUser("google", "google-100", "", "test@test.com", now))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DisplayName은 필수 입력값입니다");
    }

    @Test
    @DisplayName("normalizes_provider_to_lowercase")
    void normalizes_provider_to_lowercase() {
        // given
        OffsetDateTime now = OffsetDateTime.now();
        given(usersRepository.findByProviderAndProviderUserId("google", "google-200"))
                .willReturn(Optional.empty());
        given(usersRepository.save(any(Users.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        // when (대문자 GOOGLE 입력)
        Users result = authService.saveOrUpdateOAuthUser("GOOGLE", "google-200", "대문자구글", "test@test.com", now);

        // then (소문자 google로 표준화되어 조회 및 저장됨)
        assertThat(result.getProvider()).isEqualTo("google");
        verify(usersRepository).findByProviderAndProviderUserId("google", "google-200");
    }

    @Test
    @DisplayName("uses_supplied_time_deterministically")
    void uses_supplied_time_deterministically() {
        // given
        OffsetDateTime specificTime = OffsetDateTime.parse("2026-08-03T12:00:00+09:00");

        given(usersRepository.findByProviderAndProviderUserId("naver", "naver-100"))
                .willReturn(Optional.empty());
        given(usersRepository.save(any(Users.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        // when
        Users result = authService.saveOrUpdateOAuthUser("naver", "naver-100", "네이버유저", "naver@test.com", specificTime);

        // then
        assertThat(result.getCreatedAt()).isEqualTo(specificTime);
        assertThat(result.getUpdatedAt()).isEqualTo(specificTime);
        assertThat(result.getLastLoginAt()).isEqualTo(specificTime);
    }

    /**
     * [담당자 추가 경계 사례 테스트]
     * 테스트명: rejects_null_provider
     * 이유: provider 자체가 null로 입력되는 경계 케이스 상황에서 NullPointerException이 발생하지 않고
     *       의도된 명확한 IllegalArgumentException 예외와 메시지를 반환하는지 검증하기 위함입니다.
     */
    @Test
    @DisplayName("rejects_null_provider")
    void rejects_null_provider() {
        OffsetDateTime now = OffsetDateTime.now();
        assertThatThrownBy(() -> authService.saveOrUpdateOAuthUser(null, "user-100", "유저이름", "test@test.com", now))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Provider는 필수 입력값입니다");
    }
}
