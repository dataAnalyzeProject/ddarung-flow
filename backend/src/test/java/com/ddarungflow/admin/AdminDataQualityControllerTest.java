package com.ddarungflow.admin;

import com.ddarungflow.dto.PrincipalDetails;
import com.ddarungflow.entity.Station;
import com.ddarungflow.entity.StationInventoryCurrent;
import com.ddarungflow.entity.UserRole;
import com.ddarungflow.entity.Users;
import com.ddarungflow.inventory.InventoryStatus;
import com.ddarungflow.repository.StationInventoryCurrentRepository;
import com.ddarungflow.repository.StationRepository;
import com.ddarungflow.repository.UsersRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminDataQualityControllerTest {
    @Autowired private MockMvc mvc;
    @Autowired private UsersRepository users;
    @Autowired private StationRepository stations;
    @Autowired private StationInventoryCurrentRepository inventory;

    @BeforeEach void clearData() {
        inventory.deleteAll();
        stations.deleteAll();
        users.deleteAll();
    }

    @Test void adminSeesActiveStationCoverageAndZeroInventoryIsNotMissing() throws Exception {
        OffsetDateTime now = OffsetDateTime.now();
        stations.save(station("ST-1", true));
        stations.save(station("ST-2", true));
        stations.save(station("ST-3", true));
        stations.save(station("ST-4", true));
        stations.save(station("ST-INACTIVE", false));
        inventory.save(new StationInventoryCurrent("ST-1", 0, now.minusMinutes(5), InventoryStatus.NORMAL));
        inventory.save(new StationInventoryCurrent("ST-2", null, now.minusMinutes(10), InventoryStatus.MISSING));
        inventory.save(new StationInventoryCurrent("ST-3", 2, now.minusMinutes(200), InventoryStatus.DELAYED));
        inventory.save(new StationInventoryCurrent("ST-INACTIVE", 1, now.minusMinutes(1), InventoryStatus.UNAVAILABLE));

        mvc.perform(get("/api/v1/admin/data-quality").with(authentication(auth(UserRole.ADMIN, "admin"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.collection.windowHours").value(24))
                .andExpect(jsonPath("$.collection.expectedStationCount").value(4))
                .andExpect(jsonPath("$.collection.latestStationCount").value(3))
                .andExpect(jsonPath("$.collection.missingStationCount").value(1))
                .andExpect(jsonPath("$.freshness.status").value("MISSING"))
                .andExpect(jsonPath("$.inventoryStatusBreakdown.NORMAL").value(1))
                .andExpect(jsonPath("$.inventoryStatusBreakdown.DELAYED").value(1))
                .andExpect(jsonPath("$.inventoryStatusBreakdown.MISSING").value(1))
                .andExpect(jsonPath("$.inventoryStatusBreakdown.UNAVAILABLE").value(0));
    }

    @Test void endpointUsesTheExistingAdminAuthenticationContract() throws Exception {
        mvc.perform(get("/api/v1/admin/data-quality"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
        mvc.perform(get("/api/v1/admin/data-quality").with(authentication(auth(UserRole.USER, "user"))))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ADMIN_ACCESS_DENIED"));
    }

    private Station station(String id, boolean active) {
        return new Station(id, id, id, BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), active);
    }

    private UsernamePasswordAuthenticationToken auth(UserRole role, String suffix) {
        Users user = users.save(Users.builder().provider("google").providerUserId("quality-" + suffix).displayName(suffix).role(role).build());
        PrincipalDetails principal = new PrincipalDetails(user);
        return new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    }
}
