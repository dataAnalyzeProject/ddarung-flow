package com.ddarungflow.controller;

import com.ddarungflow.admin.operations.AdminOpsDataStatusDtos;
import com.ddarungflow.admin.operations.AdminOpsDataStatusService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminOpsDataStatusController {
    private final AdminOpsDataStatusService service;

    public AdminOpsDataStatusController(AdminOpsDataStatusService service) { this.service = service; }

    @GetMapping("/data/status")
    @PreAuthorize("hasAuthority('DATA_STATUS_READ')")
    public AdminOpsDataStatusDtos.Response getDataStatus() {
        return service.dataStatus(OffsetDateTime.now(), true);
    }

    @GetMapping("/ops/data-status")
    @PreAuthorize("hasAuthority('DATA_STATUS_READ')")
    public AdminOpsDataStatusDtos.Response getLegacyOpsDataStatus() {
        return service.dataStatus(OffsetDateTime.now(), false);
    }
}
