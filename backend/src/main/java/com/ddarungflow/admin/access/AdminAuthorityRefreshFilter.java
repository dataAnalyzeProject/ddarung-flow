package com.ddarungflow.admin.access;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Users;
import com.ddarungflow.repository.UsersRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@RequiredArgsConstructor
public class AdminAuthorityRefreshFilter extends OncePerRequestFilter {
    private final AdminAuthorityService adminAuthorityService;
    private final UsersRepository usersRepository;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return !(path.equals("/api/v1/admin") || path.startsWith("/api/v1/admin/"));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof OAuth2AuthenticationToken authentication
                && authentication.getPrincipal() instanceof PrincipalDetails principal) {
            Users currentUser = usersRepository.findByPublicId(principal.getUsers().getPublicId()).orElse(null);
            if (currentUser == null) {
                SecurityContextHolder.clearContext();
                filterChain.doFilter(request, response);
                return;
            }
            AdminAuthoritySnapshot authority = adminAuthorityService.load(currentUser);
            PrincipalDetails refreshedPrincipal = new PrincipalDetails(currentUser, principal.getAttributes(),
                    principal.getNameAttributeKey(), authority.roles(), authority.permissions());
            OAuth2AuthenticationToken refreshedAuthentication = new OAuth2AuthenticationToken(refreshedPrincipal,
                    refreshedPrincipal.getAuthorities(), authentication.getAuthorizedClientRegistrationId());
            refreshedAuthentication.setDetails(authentication.getDetails());
            SecurityContextHolder.getContext().setAuthentication(refreshedAuthentication);
        }
        filterChain.doFilter(request, response);
    }
}
