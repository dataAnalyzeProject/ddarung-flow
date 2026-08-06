import csv
import hashlib
import math
import re
import unittest
from collections import defaultdict
from pathlib import Path


EVIDENCE_DIR = Path(__file__).parents[1] / "docs" / "DATA-2.0-evidence"
EXPECTED_RAW_ROWS = {
    2022: 22_736_376,
    2023: 136_144_896,
    2024: 29_137_832,
    2025: 24_188_026,
}
SHA256_PATTERN = re.compile(r"^[0-9A-F]{64}$")
WINDOWS_ABSOLUTE_PATTERN = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]")


def read_rows(name):
    with (EVIDENCE_DIR / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


class Data20EvidenceTest(unittest.TestCase):
    def test_published_evidence_hashes_match(self):
        rows = read_rows("evidence_sha256.csv")
        expected_files = {
            path.name for path in EVIDENCE_DIR.iterdir()
            if path.is_file() and path.name != "evidence_sha256.csv"
        }
        self.assertEqual(expected_files, {row["file"] for row in rows})

        for row in rows:
            digest = hashlib.sha256((EVIDENCE_DIR / row["file"]).read_bytes()).hexdigest()
            self.assertEqual(row["sha256"].lower(), digest)

    def test_public_evidence_has_no_local_absolute_paths(self):
        for path in EVIDENCE_DIR.iterdir():
            if path.is_file():
                text = path.read_text(encoding="utf-8-sig")
                self.assertIsNone(
                    WINDOWS_ABSOLUTE_PATTERN.search(text),
                    f"local absolute path found in {path.name}",
                )

    def test_official_catalog_and_hash_manifest_cover_all_files(self):
        catalog = read_rows("official_catalog.csv")
        manifest = read_rows("archive_manifest.csv")

        self.assertEqual(16, len(catalog))
        self.assertEqual(60, len(manifest))
        self.assertEqual(60, len({row["csv_relative_path"] for row in manifest}))
        self.assertTrue(all(row["zip_integrity"] == "passed" for row in manifest))

        for row in manifest:
            self.assertGreater(int(row["archive_bytes"]), 0)
            self.assertGreater(int(row["csv_bytes"]), 0)
            self.assertRegex(row["archive_sha256"], SHA256_PATTERN)
            self.assertRegex(row["csv_sha256"], SHA256_PATTERN)

    def test_file_profiles_reconcile_to_year_totals(self):
        profiles = read_rows("file_profile.csv")
        schemas = read_rows("schema_diff.csv")
        years = read_rows("year_comparison.csv")

        self.assertEqual(60, len(profiles))
        self.assertEqual(60, len(schemas))
        self.assertEqual(4, len(years))

        totals = defaultdict(int)
        file_counts = defaultdict(int)
        for row in profiles:
            year = int(row["year"])
            totals[year] += int(row["raw_rows"])
            file_counts[year] += 1
            self.assertLessEqual(
                int(row["conflicting_key_count"]), int(row["duplicate_key_count"])
            )
            self.assertLessEqual(int(row["time_key_count"]), int(row["raw_rows"]))
            self.assertGreaterEqual(int(row["unconflicted_zero_rows"]), 0)
            self.assertEqual(0, int(row["missing_bike_rows"]))
            self.assertEqual(0, int(row["negative_bike_rows"]))

        self.assertEqual(EXPECTED_RAW_ROWS, dict(totals))
        self.assertEqual({2022: 12, 2023: 24, 2024: 12, 2025: 12}, dict(file_counts))

        for row in years:
            year = int(row["year"])
            self.assertEqual(EXPECTED_RAW_ROWS[year], int(row["raw_rows"]))
            self.assertEqual(0, int(row["missing_count"]))
            self.assertEqual(0, int(row["negative_value_flag"]))
            self.assertGreaterEqual(float(row["conflict_free_key_percent"]), 0.0)
            self.assertLessEqual(float(row["conflict_free_key_percent"]), 100.0)

    def test_horizon_numerators_denominators_and_rates(self):
        rows = read_rows("horizon_availability.csv")
        self.assertEqual(16, len(rows))
        self.assertEqual({1, 2, 3, 4}, {int(row["horizon_hours"]) for row in rows})

        for row in rows:
            base = int(row["base_count"])
            matched = int(row["matched_count"])
            missing = int(row["missing_future_count"])
            rate = float(row["availability_percent"])
            self.assertEqual(base, matched + missing)
            self.assertGreaterEqual(rate, 0.0)
            self.assertLessEqual(rate, 100.0)
            self.assertTrue(math.isclose(rate, matched / base * 100, abs_tol=1e-6))

    def test_required_bike_distribution_uses_matched_horizon_denominator(self):
        horizons = {
            (int(row["year"]), int(row["horizon_hours"])): int(row["matched_count"])
            for row in read_rows("horizon_availability.csv")
        }
        rows = read_rows("required_bike_distribution.csv")

        self.assertEqual(80, len(rows))
        for row in rows:
            key = (int(row["year"]), int(row["horizon_hours"]))
            denominator = int(row["denominator"])
            success = int(row["success_count"])
            rate = float(row["success_percent"])
            self.assertEqual(horizons[key], denominator)
            self.assertLessEqual(success, denominator)
            self.assertTrue(math.isclose(rate, success / denominator * 100, abs_tol=1e-6))

    def test_candidate_manifest_is_unapproved_and_matches_quality_decisions(self):
        rows = read_rows("candidate_manifest.csv")
        decisions = {int(row["year"]): row["decision"] for row in rows}

        self.assertEqual(4, len(rows))
        self.assertTrue(all(row["approved"].lower() == "false" for row in rows))
        self.assertEqual("eligible", decisions[2022])
        self.assertEqual("reject_quality", decisions[2023])
        self.assertEqual("eligible_with_quarantine", decisions[2024])
        self.assertEqual("eligible", decisions[2025])

    def test_file_candidate_manifest_is_complete_and_unapproved(self):
        archive_rows = read_rows("archive_manifest.csv")
        rows = read_rows("file_candidate_manifest.csv")

        self.assertEqual(60, len(rows))
        self.assertEqual(
            {row["csv_relative_path"] for row in archive_rows},
            {row["relative_path"] for row in rows},
        )
        self.assertTrue(all(row["approved"].lower() == "false" for row in rows))
        self.assertTrue(all(row["recommended"].lower() == "false" for row in rows if row["year"] == "2023"))

    def test_station_coverage_has_explicit_numerators_and_denominators(self):
        rows = read_rows("station_coverage.csv")
        self.assertEqual(4, len(rows))
        for row in rows:
            observations = int(row["observation_key_count"])
            matched_observations = int(row["matched_observation_key_count"])
            stations = int(row["station_count"])
            matched_stations = int(row["matched_station_count"])
            common = int(row["common_with_2025_station_count"])
            self.assertLessEqual(matched_observations, observations)
            self.assertLessEqual(matched_stations, stations)
            self.assertLessEqual(common, int(row["year_station_count"]))
            for field in ("observation_match_percent", "station_match_percent", "common_with_2025_percent"):
                self.assertGreaterEqual(float(row[field]), 0.0)
                self.assertLessEqual(float(row[field]), 100.0)


if __name__ == "__main__":
    unittest.main()
