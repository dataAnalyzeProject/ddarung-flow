package com.ddarungflow.controller;

import com.ddarungflow.admin.AdminPredictionBatchService;
import com.ddarungflow.dto.AdminPredictionBatchDtos;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

@RestController
@RequestMapping("/api/v1/admin/prediction-batches")
public class AdminPredictionBatchController {
    private final AdminPredictionBatchService service;

    public AdminPredictionBatchController(AdminPredictionBatchService service) { this.service = service; }

    @GetMapping
    public AdminPredictionBatchDtos.Response get() { return service.predictionBatches(OffsetDateTime.now()); }
}
