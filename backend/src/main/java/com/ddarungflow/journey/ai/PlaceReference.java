package com.ddarungflow.journey.ai;

public record PlaceReference(String displayName, String placeId) {
    public PlaceReference {
        displayName = displayName == null ? "" : displayName.trim();
        placeId = placeId == null ? "" : placeId.trim();
    }
}
