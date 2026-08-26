package com.ddarungflow.controller;
import com.ddarungflow.admin.AdminOverviewService;
import com.ddarungflow.dto.AdminOverviewDtos;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
@RestController @RequestMapping("/api/v1/admin/overview") public class AdminOverviewController { private final AdminOverviewService service; public AdminOverviewController(AdminOverviewService service) { this.service=service; } @GetMapping public AdminOverviewDtos.Response get() { return service.overview(OffsetDateTime.now()); } }
