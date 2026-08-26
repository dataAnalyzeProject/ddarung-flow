package com.ddarungflow.admin;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") class ModelPerformanceControllerTest { @Autowired MockMvc mvc; @Test void noSnapshotIsNotFoundForAdminRoute() throws Exception { mvc.perform(get("/api/v1/admin/model-performance")).andExpect(status().isUnauthorized()); } }
