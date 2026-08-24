package com.ddarungflow.config;

import com.ddarungflow.service.CustomOAuth2UserService;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.OAuth2AuthorizationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;
import java.util.regex.Pattern;
import java.io.IOException;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final CustomOAuth2UserService customOAuth2UserService;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(frontendUrl));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private static final Pattern AIR_QUALITY_PATH = Pattern.compile("^/api/v1/stations/[^/]+/air-quality/?$");
    private static final Pattern ADMIN_API_PATH = Pattern.compile("^/api/v1/admin(?:/.*)?$");
    private static final Pattern ROUTE_CANDIDATES_PATH = Pattern.compile("^/api/v1/routes/candidates/?$");
    private static final Pattern PAYMENT_API_PATH = Pattern.compile("^/api/v1/(?:me/subscription|payments/checkout)/?$");

    private void writeApiError(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}");
    }

    private AuthenticationEntryPoint apiVsRedirectEntryPoint() {
        return (request, response, authException) -> {
            if (AIR_QUALITY_PATH.matcher(request.getRequestURI()).matches()) {
                // setStatus (not sendError) - sendError triggers a /error forward that Spring
                // Security re-processes, invoking this entry point a second time for "/error"
                // (which doesn't match), overwriting the 401 with the redirect branch below.
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
            if (ADMIN_API_PATH.matcher(request.getRequestURI()).matches()) {
                writeApiError(response, HttpServletResponse.SC_UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다.");
                return;
            }
            if (ROUTE_CANDIDATES_PATH.matcher(request.getRequestURI()).matches()) {
                writeApiError(response, HttpServletResponse.SC_UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다.");
                return;
            }
            if (PAYMENT_API_PATH.matcher(request.getRequestURI()).matches()) {
                writeApiError(response, HttpServletResponse.SC_UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다.");
                return;
            }
            String redirectBase = frontendUrl.endsWith("/") ? frontendUrl : frontendUrl + "/";
            response.sendRedirect(redirectBase + "login");
        };
    }

    private boolean isOAuthCancellation(Exception exception) {
        if (exception instanceof OAuth2AuthenticationException oauthException
                && "access_denied".equals(oauthException.getError().getErrorCode())) {
            return true;
        }
        Throwable cause = exception.getCause();
        while (cause != null) {
            if (cause instanceof OAuth2AuthorizationException authorizationException
                    && "access_denied".equals(authorizationException.getError().getErrorCode())) {
                return true;
            }
            cause = cause.getCause();
        }
        return false;
    }

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            ClientRegistrationRepository clientRegistrationRepository
    ) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.ignoringRequestMatchers("/api/v1/routes/estimate", "/api/v1/routes/candidates", "/api/v1/payments/webhooks/toss"))
                .httpBasic(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/v1/payments/webhooks/toss").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .requestMatchers(
                                "/",
                                "/auth/**",
                                "/api/v1/auth/**",
                                "/api/v1/places/**",
                                "/api/v1/routes/estimate",
                                "/login/oauth2/**",
                                "/oauth2/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs",
                                "/v3/api-docs/**"
                        ).permitAll()
                        .anyRequest().authenticated()
                )
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(apiVsRedirectEntryPoint())
                        .accessDeniedHandler(adminAccessDeniedHandler())
                )
                .oauth2Login(oauth2 -> oauth2
                        .loginPage(frontendUrl + "/login")
                        .authorizationEndpoint(endpoint -> endpoint
                                .authorizationRequestResolver(
                                        new AccountSelectionAuthorizationRequestResolver(clientRegistrationRepository)
                                ))
                        .userInfoEndpoint(userInfo -> userInfo
                                .userService(customOAuth2UserService))
                        .successHandler((request, response, authentication) -> {
                            String redirectBase = frontendUrl.endsWith("/") ? frontendUrl : frontendUrl + "/";
                            response.sendRedirect(redirectBase + "?login=success");
                        })
                        .failureHandler((request, response, exception) -> {
                            boolean cancelled = "access_denied".equals(request.getParameter("error"))
                                    || isOAuthCancellation(exception);
                            String result = cancelled
                                    ? "?login=cancelled&code=AUTH_OAUTH_CANCELLED"
                                    : "?login=failed&code=AUTH_OAUTH_FAILED";
                            String redirectBase = frontendUrl.endsWith("/") ? frontendUrl : frontendUrl + "/";
                            response.sendRedirect(redirectBase + "login" + result);
                        })
                )
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(logout -> logout
                        .logoutUrl("/api/v1/auth/logout")
                        .logoutSuccessHandler((request, response, authentication) -> {
                            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
                        })
                        .permitAll()
                );

        return http.build();
    }

    private AccessDeniedHandler adminAccessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            if (ADMIN_API_PATH.matcher(request.getRequestURI()).matches()) {
                writeApiError(response, HttpServletResponse.SC_FORBIDDEN, "ADMIN_ACCESS_DENIED", "관리자 권한이 필요합니다.");
                return;
            }
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
        };
    }
}
