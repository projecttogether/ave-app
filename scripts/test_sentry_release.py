"""Deployment gating and retry behavior, without production or Sentry writes."""

import os
import unittest
from hashlib import sha256
from unittest.mock import patch
from urllib.error import HTTPError

import sentry_release as reporter

COMMIT = "a" * 40
PREVIOUS = "b" * 40
INITIAL = "c" * 40
REPOSITORY = "projecttogether/example"
DEPLOY_PREFIX = f"github:{sha256(REPOSITORY.encode()).hexdigest()[:12]}:"
URLS = ["https://app.example/readyz", "https://form.example/readyz"]


class DeploymentTests(unittest.TestCase):
    def test_every_endpoint_must_serve_the_expected_healthy_commit_three_times(self):
        expected = {"X-Deployment-Id": sha256(COMMIT.encode()).hexdigest()}
        responses = [
            ({"status": "ok"}, expected),
            ({"status": "ok"}, {"X-Deployment-Id": "old"}),
            ({"status": "error"}, expected),
            ({"status": "ok"}, expected),
        ] + [({"status": "ready"}, expected)] * 6
        with (
            patch.object(reporter, "request_json", side_effect=responses) as request,
            patch.object(reporter.time, "sleep"),
        ):
            reporter.wait_for_deployment(URLS, COMMIT)
        self.assertEqual(request.call_count, 10)
        self.assertTrue(all(not call.kwargs for call in request.call_args_list))

    def test_network_failure_resets_the_confirmation_count(self):
        healthy = (
            {"status": "ok"},
            {"X-Deployment-Id": sha256(COMMIT.encode()).hexdigest()},
        )
        with (
            patch.object(
                reporter,
                "request_json",
                side_effect=[healthy, OSError(), healthy, healthy, healthy],
            ) as request,
            patch.object(reporter.time, "sleep"),
        ):
            reporter.wait_for_deployment(URLS[:1], COMMIT)
        self.assertEqual(request.call_count, 5)

    def test_timeout_cannot_publish_a_release(self):
        env = {
            "GITHUB_SHA": COMMIT,
            "SENTRY_AUTH_TOKEN": "test-only",
            "DEPLOYMENT_HEALTH_URLS": URLS[0],
        }
        with (
            patch.dict(os.environ, env),
            patch.object(
                reporter, "wait_for_deployment", side_effect=RuntimeError("timeout")
            ),
            patch.object(reporter, "report_release") as publish,
        ):
            with self.assertRaises(RuntimeError):
                reporter.main()
        publish.assert_not_called()

    def test_redirects_are_rejected(self):
        self.assertIsNone(
            reporter.NoRedirect().redirect_request(
                None, None, 302, "", {}, "https://other.example"
            )
        )


class FakeSentry:
    def __init__(self, releases=(), deploys=None):
        self.history = releases
        self.deploys = deploys or {}
        self.calls = []
        self.repository = REPOSITORY

    def releases(self, project):
        return self.history

    def request(self, path, *, method="GET", data=None):
        self.calls.append((path, method, data))
        if method == "PUT":
            self.repository = data["refs"][0]["repository"]
        if method == "GET":
            if path.endswith("commits/?per_page=100"):
                return [{"id": COMMIT, "repository": {"name": self.repository}}], {}
            return self.deploys.get(path, []), {}
        if path.endswith("deploys/") and len(data.get("name", "")) > 64:
            raise HTTPError("https://de.sentry.io", 400, "Name too long", {}, None)
        return {"dateReleased": "2026-01-01T00:00:00Z"}, {}


class ReleaseTests(unittest.TestCase):
    def test_deploy_names_fit_the_real_api_limit_for_all_production_repositories(self):
        for repository in (
            "projecttogether/pt-admin-user-management",
            "projecttogether/pt-memory-layer",
            "projecttogether/ave-app",
            "projecttogether/pt-app",
        ):
            with self.subTest(repository=repository):
                sentry = FakeSentry()
                reporter.report_release(sentry, "example", repository, COMMIT, INITIAL)
                self.assertLessEqual(len(sentry.calls[-1][2]["name"]), 64)

    def test_unnamed_production_deployments_are_skipped(self):
        sentry = FakeSentry(
            [{"version": PREVIOUS, "deployCount": 1}],
            {
                f"releases/{PREVIOUS}/deploys/": [
                    {"environment": "production", "name": None}
                ]
            },
        )
        reporter.report_release(sentry, "example", REPOSITORY, COMMIT, INITIAL)
        update = next(data for _, method, data in sentry.calls if method == "PUT")
        self.assertEqual(update["refs"][0]["previousCommit"], INITIAL)

    def test_first_release_uses_the_configured_baseline_and_preserves_build_metadata(
        self,
    ):
        sentry = FakeSentry()
        reporter.report_release(sentry, "example", REPOSITORY, COMMIT, INITIAL)
        self.assertEqual(
            [call[1] for call in sentry.calls], ["POST", "PUT", "GET", "POST"]
        )
        update = sentry.calls[1][2]
        self.assertEqual(update["dateReleased"], "2026-01-01T00:00:00Z")
        self.assertEqual(
            update["refs"],
            [{"repository": REPOSITORY, "commit": COMMIT, "previousCommit": INITIAL}],
        )
        self.assertEqual(sentry.calls[3][2]["environment"], "production")

    def test_commit_range_starts_at_the_last_production_deploy_not_the_latest_build(
        self,
    ):
        deploy = {
            "environment": "production",
            "name": f"{DEPLOY_PREFIX}{PREVIOUS}",
            "dateFinished": "2026-10-01T00:00:00Z",
        }
        sentry = FakeSentry(
            [
                {"version": COMMIT, "deployCount": 0},
                {"version": PREVIOUS, "deployCount": 1},
            ],
            {f"releases/{PREVIOUS}/deploys/": [deploy]},
        )
        reporter.report_release(sentry, "example", REPOSITORY, COMMIT, INITIAL)
        update = next(data for _, method, data in sentry.calls if method == "PUT")
        self.assertEqual(update["refs"][0]["previousCommit"], PREVIOUS)

    def test_retries_do_not_duplicate_an_already_reported_deploy(self):
        deploy = {"environment": "production", "name": f"{DEPLOY_PREFIX}{COMMIT}"}
        sentry = FakeSentry(
            [{"version": COMMIT, "deployCount": 1}],
            {f"releases/{COMMIT}/deploys/": [deploy]},
        )
        reporter.report_release(sentry, "example", REPOSITORY, COMMIT, INITIAL)
        self.assertTrue(all(method == "GET" for _, method, _ in sentry.calls))

    def test_failed_commit_import_cannot_report_a_successful_deployment(self):
        sentry = FakeSentry()
        with patch.object(
            reporter,
            "wait_for_release_commits",
            side_effect=RuntimeError("import failed"),
        ):
            with self.assertRaises(RuntimeError):
                reporter.report_release(sentry, "example", REPOSITORY, COMMIT, INITIAL)
        self.assertFalse(
            any(
                path.endswith("deploys/") and method == "POST"
                for path, method, _ in sentry.calls
            )
        )

    def test_sentry_permission_failure_stops_without_creating_a_deploy(self):
        sentry = FakeSentry()
        with patch.object(
            sentry,
            "request",
            side_effect=HTTPError("https://de.sentry.io", 403, "Forbidden", {}, None),
        ) as request:
            with self.assertRaises(HTTPError):
                reporter.report_release(sentry, "example", REPOSITORY, COMMIT, INITIAL)
        self.assertEqual(request.call_count, 1)


if __name__ == "__main__":
    unittest.main()
