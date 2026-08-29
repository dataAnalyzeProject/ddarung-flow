package com.ddarungflow.controller;

import com.ddarungflow.admin.AdminDataQualityService;
import com.ddarungflow.dto.AdminDataQualityDtos;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/admin/data-quality")
public class AdminDataQualityController {
    private final AdminDataQualityService service;

    public AdminDataQualityController(AdminDataQualityService service) { this.service = service; }

    @GetMapping
    @PreAuthorize("hasAuthority('DATA_STATUS_READ')")
    public AdminDataQualityDtos.Response get() { return service.dataQuality(OffsetDateTime.now()); }
}
