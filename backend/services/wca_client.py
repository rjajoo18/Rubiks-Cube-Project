# services/wca_client.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
import requests


@dataclass
class Wca333Stats:
    avg_ms: Optional[int]
    single_ms: Optional[int]


class WcaClientError(Exception):
    pass


class WcaClient:
    """
    Thin wrapper around the WCA REST API.

    Why this exists:
    - Keeps external API parsing out of your route handlers
    - Makes it easy to switch providers later
    - Centralizes error handling and timeouts
    """

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def _get_json(self, path: str) -> Any:
        url = f"{self.base_url}{path}"

        try:
            resp = requests.get(
                url,
                timeout=10,
                headers={"User-Agent": "CubeIQ/1.0"},
            )
        except requests.RequestException as e:
            raise WcaClientError(f"Network error calling WCA API: {e}") from e

        if resp.status_code == 404:
            raise WcaClientError(f"WCA resource not found at {url}")

        if resp.status_code >= 400:
            raise WcaClientError(f"WCA API error {resp.status_code} when calling {url}")

        try:
            return resp.json()
        except ValueError as e:
            raise WcaClientError(f"WCA API returned non-JSON from {url}") from e

    def get_333_stats(self, wca_id: str) -> Wca333Stats:
        """
        Returns (average_ms, single_ms) for 3x3.
        WCA times in the export are usually centiseconds; we convert to ms.
        """

        # Correct path for the GitHub raw static JSON API
        payload = self._get_json(f"/api/persons/{wca_id}.json")

        avg_cs, single_cs = _find_333_personal_records(payload)

        avg_ms = _cs_to_ms(avg_cs)
        single_ms = _cs_to_ms(single_cs)

        if avg_ms is None and single_ms is None:
            raise WcaClientError("Could not find 3x3 stats in WCA API response")

        return Wca333Stats(avg_ms=avg_ms, single_ms=single_ms)


def _extract_time_cs(value: Any) -> Optional[int]:
    """
    Extract a time value in centiseconds (cs) from various shapes:
      - int: 313
      - str: "313"
      - dict: {"best": 313, ...} or {"value": 313, ...}
    """
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    if isinstance(value, dict):
        for key in ("best", "value", "time", "result"):
            v = value.get(key)
            if isinstance(v, int):
                return v
            if isinstance(v, str) and v.isdigit():
                return int(v)
    return None


def _cs_to_ms(cs: Optional[int]) -> Optional[int]:
    # 1 centisecond = 10 milliseconds
    return None if cs is None else cs * 10


def _find_333_personal_records(payload: Any) -> tuple[Optional[int], Optional[int]]:
    """
    Returns (avg_cs, single_cs) for 3x3 in centiseconds.

    This API's person JSON commonly stores PR-like values under:
      payload["rank"]["singles"]   -> list of { eventId, best, ... }
      payload["rank"]["averages"]  -> list of { eventId, best, ... }

    It may also contain per-competition results under payload["results"].
    """
    if not isinstance(payload, dict):
        return None, None

    # 0) PRIMARY: rank.singles / rank.averages (matches the JSON you pasted)
    rank = payload.get("rank")
    if isinstance(rank, dict):
        single_cs = None
        avg_cs = None

        singles = rank.get("singles")
        if isinstance(singles, list):
            for item in singles:
                if isinstance(item, dict) and item.get("eventId") == "333":
                    single_cs = _extract_time_cs(item.get("best"))
                    break

        avgs = rank.get("averages")
        if isinstance(avgs, list):
            for item in avgs:
                if isinstance(item, dict) and item.get("eventId") == "333":
                    avg_cs = _extract_time_cs(item.get("best"))
                    break

        if avg_cs is not None or single_cs is not None:
            return avg_cs, single_cs

    # 1) If rank isn't present, try "results" (per-competition rounds)
    # results[compId]["333"] -> list of rounds where each has "best" and "average"
    results = payload.get("results")
    if isinstance(results, dict):
        best_single = None
        best_avg = None

        for comp_obj in results.values():
            if not isinstance(comp_obj, dict):
                continue
            rounds = comp_obj.get("333")
            if not isinstance(rounds, list):
                continue

            for r in rounds:
                if not isinstance(r, dict):
                    continue
                s = _extract_time_cs(r.get("best"))
                a = _extract_time_cs(r.get("average"))

                if s is not None:
                    best_single = s if best_single is None else min(best_single, s)
                if a is not None:
                    best_avg = a if best_avg is None else min(best_avg, a)

        if best_avg is not None or best_single is not None:
            return best_avg, best_single

    # 2) Fallback: deep scan
    avg_cs = _deep_find_event_stat(payload, event_id="333", want="average")
    single_cs = (
        _deep_find_event_stat(payload, event_id="333", want="single")
        or _deep_find_event_stat(payload, event_id="333", want="best")
    )
    return avg_cs, single_cs



def _deep_find_event_stat(obj: Any, event_id: str, want: str) -> Optional[int]:
    """
    Walk arbitrary JSON looking for an object that mentions event_id == '333',
    and returns a stat in centiseconds if found.
    """
    if isinstance(obj, dict):
        event_val = obj.get("eventId") or obj.get("event") or obj.get("event_id")
        if event_val == event_id:
            # handles nested objects like {"average": {"best": 500}}
            nested_cs = _extract_time_cs(obj.get(want))
            if nested_cs is not None:
                return nested_cs

            # direct int fields like {"average": 500}
            val = obj.get(want)
            if isinstance(val, int):
                return val
            if isinstance(val, str) and val.isdigit():
                return int(val)

            # "avg" alias for average
            if want == "average":
                alias = obj.get("avg")
                if isinstance(alias, int):
                    return alias
                if isinstance(alias, str) and alias.isdigit():
                    return int(alias)

        for v in obj.values():
            found = _deep_find_event_stat(v, event_id, want)
            if found is not None:
                return found

    elif isinstance(obj, list):
        for item in obj:
            found = _deep_find_event_stat(item, event_id, want)
            if found is not None:
                return found

    return None
