package com.ddarungflow.modelops;

import com.oracle.bmc.http.client.HttpProvider;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OciHttpProviderTest {

    @Test
    void runtimeClasspathProvidesAnOciHttpTransport() {
        assertThat(HttpProvider.getDefault()).isNotNull();
    }
}
