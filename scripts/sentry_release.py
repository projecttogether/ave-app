"""Report a Sentry release only after the expected commit is serving production."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import UTC, datetime
from hashlib import sha256
from urllib.parse import quote, unquote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # In particular, never forward the Sentry credential to another host.
        return None


def request_json(url, *, token=None, method="GET", data=None):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    request = Request(url, data=body, headers=headers, method=method)
    with build_opener(NoRedirect()).open(request, timeout=20) as response:
        return json.load(response), response.headers


def wait_for_deployment(urls, commit, *, timeout=1800, interval=15):
    expected = sha256(commit.encode()).hexdigest()
    deadline = time.monotonic() + timeout
    consecutive = 0
    while time.monotonic() < deadline:
        healthy = True
        for url in urls:
            try:
                body, headers = request_json(url)
                healthy = healthy and (
                    headers.get("X-Deployment-Id") == expected
                    and body.get("status") in {"ok", "ready"}
                )
            except (OSError, ValueError):
                healthy = False
        consecutive = consecutive + 1 if healthy else 0
        if consecutive >= 3:
            print(
                "Expected commit is healthy on every production endpoint.", flush=True
            )
            return
        print("Waiting for the expected healthy deployment...", flush=True)
        time.sleep(min(interval, max(0, deadline - time.monotonic())))
    raise RuntimeError("Deployment was not confirmed; Sentry was left unchanged.")


class Sentry:
    def __init__(self, token):
        self.token = token
        self.base = "https://de.sentry.io/api/0/organizations/projecttogether"

    def request(self, path, *, method="GET", data=None):
        return request_json(
            f"{self.base}/{path}", token=self.token, method=method, data=data
        )

    def releases(self, project):
        cursor = None
        while True:
            query = {"project": project, "per_page": "100"}
            if cursor:
                query["cursor"] = cursor
            releases, headers = self.request(f"releases/?{urlencode(query)}")
            yield from releases
            # Only take a cursor from Link, keeping requests on the fixed API host.
            next_page = re.search(
                r'<[^>]*[?&]cursor=([^&>]+)[^>]*>; rel="next"; results="true"',
                headers.get("Link", ""),
            )
            if not next_page:
                return
            cursor = unquote(next_page[1])


def wait_for_release_commits(sentry, release_path, repository, commit):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        commits, _ = sentry.request(f"{release_path}commits/?per_page=100")
        if any(
            entry.get("id") == commit
            and entry.get("repository", {}).get("name") == repository
            for entry in commits
        ):
            return
        time.sleep(5)
    raise RuntimeError("Sentry did not import the release's GitHub commits.")


def report_release(sentry, project, repository, repository_id, commit, initial_previous):
    release_path = f"releases/{quote(commit, safe='')}/"
    # Keyed by the repository ID, not its name: a new repository under the same
    # name starts at its initial baseline, not at a commit it does not have.
    deploy_prefix = f"github:{sha256(repository_id.encode()).hexdigest()[:12]}:"
    deploy_name = f"{deploy_prefix}{commit}"
    previous = None
    for release in sentry.releases(project):
        if not release.get("deployCount"):
            continue
        deploys, _ = sentry.request(
            f"releases/{quote(release['version'], safe='')}/deploys/"
        )
        for deploy in deploys:
            if deploy.get("environment") != "production":
                continue
            if deploy.get("name") == deploy_name:
                print("This deployment is already reported to Sentry.")
                return
            if not (deploy.get("name") or "").startswith(deploy_prefix):
                continue
            finished = deploy.get("dateFinished") or ""
            if previous is None or finished > previous[0]:
                previous = (finished, release["version"])

    previous_commit = previous[1] if previous else initial_previous
    if not re.fullmatch(r"[0-9a-f]{40}", previous_commit):
        raise RuntimeError("The previous deployed release must be a commit SHA.")
    now = datetime.now(UTC).isoformat()
    # Creating an existing release is supported by Sentry (HTTP 208).
    # Keep SDK/build-created releases and their source maps intact.
    release, _ = sentry.request(
        "releases/", method="POST", data={"version": commit, "projects": [project]}
    )
    sentry.request(
        release_path,
        method="PUT",
        data={
            "dateReleased": release.get("dateReleased") or now,
            "url": f"https://github.com/{repository}/commit/{commit}",
            "refs": [
                {
                    "repository": repository,
                    "commit": commit,
                    "previousCommit": previous_commit,
                }
            ],
        },
    )
    wait_for_release_commits(sentry, release_path, repository, commit)
    sentry.request(
        f"{release_path}deploys/",
        method="POST",
        data={
            "environment": "production",
            "name": deploy_name,
            "projects": [project],
            "dateFinished": now,
        },
    )
    print(f"Reported production release {commit} to Sentry project {project}.")


def main():
    commit = os.environ["GITHUB_SHA"]
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("GITHUB_SHA must be a full commit SHA.")
    token = os.environ["SENTRY_AUTH_TOKEN"].strip()
    if not token:
        raise RuntimeError("SENTRY_RELEASE_AUTH_TOKEN is not configured.")
    urls = os.environ["DEPLOYMENT_HEALTH_URLS"].split()
    if not urls or any(not url.startswith("https://") for url in urls):
        raise RuntimeError("Production health URLs must use HTTPS.")
    wait_for_deployment(urls, commit)
    report_release(
        Sentry(token),
        os.environ["SENTRY_PROJECT"],
        os.environ["GITHUB_REPOSITORY"],
        os.environ["GITHUB_REPOSITORY_ID"],
        commit,
        os.environ["SENTRY_INITIAL_PREVIOUS_COMMIT"],
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # HTTP response bodies and credentials must never enter CI logs.
        print(
            f"Sentry release reporting failed: {type(error).__name__} "
            f"(HTTP {getattr(error, 'code', 'n/a')}).",
            file=sys.stderr,
        )
        sys.exit(1)
