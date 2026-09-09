package com.ddarungflow.weather;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

class KmaShortForecastClientTest {

    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void requestHasWholeRequestTimeoutAndTransportFailureStaysUnavailable() throws Exception {
        HttpClient httpClient = mock(HttpClient.class);
        AtomicReference<HttpRequest> requestReference = new AtomicReference<>();
        doAnswer(invocation -> {
            requestReference.set(invocation.getArgument(0));
            throw new IOException("simulated timeout");
        }).when(httpClient).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        KmaShortForecastClient client = new KmaShortForecastClient("test-key", httpClient, new ObjectMapper());

        assertThatThrownBy(() -> client.fetch(60, 127, OffsetDateTime.parse("2030-09-02T10:00:00+09:00")))
                .isInstanceOf(KmaShortForecastClient.WeatherProviderException.class)
                .hasMessage("KMA forecast request failed");
        assertThat(requestReference.get().timeout()).contains(Duration.ofSeconds(3));
    }
}
