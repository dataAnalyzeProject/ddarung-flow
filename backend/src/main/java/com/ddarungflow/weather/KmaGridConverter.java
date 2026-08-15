package com.ddarungflow.weather;

public final class KmaGridConverter {
    private static final double RE = 6371.00877;
    private static final double GRID = 5.0;
    private static final double SLAT1 = 30.0;
    private static final double SLAT2 = 60.0;
    private static final double OLON = 126.0;
    private static final double OLAT = 38.0;
    private static final double XO = 43.0;
    private static final double YO = 136.0;

    private KmaGridConverter() {}

    public record GridPoint(int nx, int ny) {}

    public static GridPoint toGrid(double latitude, double longitude) {
        double re = RE / GRID;
        double slat1 = Math.toRadians(SLAT1);
        double slat2 = Math.toRadians(SLAT2);
        double olon = Math.toRadians(OLON);
        double olat = Math.toRadians(OLAT);
        double sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) /
            Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
        double sf = Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1) / sn;
        double ro = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);
        double ra = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + Math.toRadians(latitude) * 0.5), sn);
        double theta = Math.toRadians(longitude) - olon;
        if (theta > Math.PI) theta -= 2.0 * Math.PI;
        if (theta < -Math.PI) theta += 2.0 * Math.PI;
        theta *= sn;
        return new GridPoint((int) Math.floor(ra * Math.sin(theta) + XO + 0.5), (int) Math.floor(ro - ra * Math.cos(theta) + YO + 0.5));
    }
}
