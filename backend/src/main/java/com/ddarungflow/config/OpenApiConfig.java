package com.ddarungflow.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "Ddarung Flow API",
                version = "v1",
                description = "Development documentation for the approved /api/v1 contract"
        )
)
public class OpenApiConfig {
}
