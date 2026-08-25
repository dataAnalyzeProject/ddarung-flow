package com.ddarungflow.controller;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.dto.RetentionDtos;
import com.ddarungflow.notification.AlertRule;
import com.ddarungflow.notification.InAppNotification;
import com.ddarungflow.notification.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/notification-rules")
    public List<RetentionDtos.AlertRuleResponse> getRules(@AuthenticationPrincipal PrincipalDetails principal) {
        return notificationService.getAlertRules(userId(principal)).stream().map(this::alertRuleResponse).toList();
    }

    @PostMapping("/notification-rules")
    public RetentionDtos.AlertRuleResponse createRule(@AuthenticationPrincipal PrincipalDetails principal,
                                                      @RequestBody RetentionDtos.AlertRuleRequest request) {
        AlertRule rule = notificationService.createAlertRule(userId(principal), request.stationId(),
                request.conditionType(), request.threshold(), request.enabled());
        return alertRuleResponse(rule);
    }

    @PatchMapping("/notification-rules/{id}")
    public RetentionDtos.AlertRuleResponse updateRule(@AuthenticationPrincipal PrincipalDetails principal,
                                                      @PathVariable Long id,
                                                      @RequestBody RetentionDtos.AlertRuleRequest request) {
        return alertRuleResponse(notificationService.toggleAlertRule(userId(principal), id, Boolean.TRUE.equals(request.enabled())));
    }

    @GetMapping("/notifications")
    public List<RetentionDtos.NotificationResponse> getNotifications(@AuthenticationPrincipal PrincipalDetails principal,
                                                                     @RequestParam(defaultValue = "ALL") String filter) {
        boolean unreadOnly = "UNREAD".equals(filter);
        return notificationService.getInAppNotifications(userId(principal), unreadOnly).stream().map(this::notificationResponse).toList();
    }

    @PostMapping("/notifications/{id}/read")
    @Operation(parameters = @Parameter(
        name = "X-CSRF-TOKEN",
        in = ParameterIn.HEADER,
        required = true,
        description = "GET /api/v1/auth/csrf 응답의 headerName에 해당하는 CSRF 토큰"
    ))
    public RetentionDtos.NotificationResponse markRead(@AuthenticationPrincipal PrincipalDetails principal, @PathVariable Long id) {
        return notificationResponse(notificationService.markNotificationAsRead(userId(principal), id, null));
    }

    @PostMapping("/notifications/read-all")
    public ResponseEntity<Void> markAllRead(@AuthenticationPrincipal PrincipalDetails principal) {
        notificationService.markAllNotificationsAsRead(userId(principal));
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(NotificationService.NotificationNotFoundException.class)
    public ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(404).body(Map.of("code", "NOTIFICATION_NOT_FOUND"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalidRequest() {
        return ResponseEntity.badRequest().body(Map.of("code", "INVALID_REQUEST"));
    }

    private Long userId(PrincipalDetails principal) {
        return principal.getUsers().getId();
    }

    private RetentionDtos.AlertRuleResponse alertRuleResponse(AlertRule rule) {
        return new RetentionDtos.AlertRuleResponse(rule.getId(), rule.getStationId(), rule.getConditionType(),
                rule.getThreshold(), rule.isEnabled(), rule.getCreatedAt().toString());
    }

    private RetentionDtos.NotificationResponse notificationResponse(InAppNotification notification) {
        return new RetentionDtos.NotificationResponse(notification.getId(), notification.getTitle(), notification.getMessage(),
                notification.getCreatedAt().toString(), notification.getReadAt() == null ? null : notification.getReadAt().toString());
    }
}
