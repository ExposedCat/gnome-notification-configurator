import argparse
from ast import literal_eval
from importlib.metadata import version
from pathlib import Path

from shexli.analyzer import analyze_path
from shexli.models import Finding


STABLE_SHELL_VERSIONS = frozenset(str(major) for major in range(40, 52))


def is_gnome_51_exception(finding: Finding) -> bool:
    if (
        version("shexli") != "0.2.1"
        or finding.rule_id != "EGO-M-004"
        or finding.severity != "error"
        or finding.message
        != (
            "Field `shell-version` contains invalid values, "
            "more than one development release, or implausible future releases."
        )
        or len(finding.evidence) != 1
        or not finding.evidence[0].path.endswith(":metadata.json")
    ):
        return False

    snippet = finding.evidence[0].snippet
    if snippet is None or not snippet.startswith("shell-version="):
        return False

    try:
        shell_versions = literal_eval(snippet.removeprefix("shell-version="))
    except (SyntaxError, ValueError):
        return False

    return (
        isinstance(shell_versions, list)
        and "51" in shell_versions
        and all(
            isinstance(shell_version, str)
            and shell_version in STABLE_SHELL_VERSIONS
            for shell_version in shell_versions
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Check a GNOME extension with Shexli")
    parser.add_argument("path", type=Path)
    arguments = parser.parse_args()
    analysis = analyze_path(arguments.path.resolve())
    errors = 0
    exceptions = 0

    for finding in analysis.findings:
        is_exception = is_gnome_51_exception(finding)
        exceptions += int(is_exception)
        errors += int(finding.severity == "error" and not is_exception)
        severity = "exception: GNOME 51 version limit" if is_exception else finding.severity
        print(f"{finding.rule_id} [{severity}] {finding.message}")
        for evidence in finding.evidence:
            location = (
                f"{evidence.path}:{evidence.line}" if evidence.line else evidence.path
            )
            print(f"  {location}")
            if evidence.snippet:
                print(f"  {evidence.snippet}")
        if finding.source_url:
            print(f"  {finding.source_url}")

    print(
        f"shexli: {len(analysis.findings)} findings, "
        f"{errors} errors, {exceptions} exceptions"
    )
    return int(errors > 0)


if __name__ == "__main__":
    raise SystemExit(main())
