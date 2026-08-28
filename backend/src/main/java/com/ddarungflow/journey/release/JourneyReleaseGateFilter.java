package com.ddarungflow.journey.release;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class JourneyReleaseGateFilter extends OncePerRequestFilter {
    private final boolean enabled;

    public JourneyReleaseGateFilter(@Value("${journey.enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return enabled || !isJourneyPath(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        response.sendError(HttpServletResponse.SC_NOT_FOUND);
    }

    private boolean isJourneyPath(String path) {
        return path.equals("/api/v1/journeys")
                || path.startsWith("/api/v1/journeys/")
                || path.equals("/api/v1/saved-journeys")
                || path.startsWith("/api/v1/saved-journeys/");
    }
}
