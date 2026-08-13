package com.ddarungflow.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.ActiveProfiles;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "springdoc.api-docs.enabled=true",
        "springdoc.swagger-ui.enabled=true",
        "springdoc.packages-to-scan=com.ddarungflow.controller"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OpenApiDocumentationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void exposesOnlyImplementedAuthenticationApis() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("Ddarung Flow API"))
                .andExpect(jsonPath("$.paths['/api/v1/auth/oauth2/{provider}/start']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/auth/me']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/auth/csrf']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/predictions/route']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/predictions/direct']").exists());
    }

    @Test
    void allowsAnonymousAccessToSwaggerUiResources() throws Exception {
        mockMvc.perform(get("/swagger-ui.html"))
                .andExpect(status().is3xxRedirection());
    }
}
