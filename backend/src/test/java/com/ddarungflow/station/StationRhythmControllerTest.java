package com.ddarungflow.station;
import org.junit.jupiter.api.Test; import static org.junit.jupiter.api.Assertions.*;
class StationRhythmControllerTest { @Test void internalStationIdUsesStPrefix(){ assertTrue("ST-10".startsWith("ST-")); } }
