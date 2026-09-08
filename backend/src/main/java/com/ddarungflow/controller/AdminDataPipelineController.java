package com.ddarungflow.controller;

import com.ddarungflow.admin.data.AdminDataPipelineDtos;
import com.ddarungflow.admin.data.AdminDataPipelineService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/admin/data/pipeline-status")
public class AdminDataPipelineController {
    private final AdminDataPipelineService service;

    public AdminDataPipelineController(AdminDataPipelineService service) { this.service = service; }

    @GetMapping
    @PreAuthorize("hasAuthority('DATA_STATUS_READ')")
    public AdminDataPipelineDtos.Response get() { return service.status(OffsetDateTime.now()); }
}
