"""CSV data loader for MNQ minute data."""

import os
import pickle
from typing import List, Dict, Optional

import pandas as pd

from config import GMT_TO_ET_HOURS

# Cache the pre-grouped day data in memory after first load
_days_cache: Optional[Dict[str, List[Dict]]] = None
_csv_path = os.path.join(os.path.dirname(__file__), "..", "MNQ_10year_1min_data.csv")
_pickle_path = os.path.join(os.path.dirname(__file__), "..", "days_cache.pkl")


def _build_days_cache() -> Dict[str, List[Dict]]:
    """Load days cache from pickle if available, otherwise build from CSV and save."""
    global _days_cache
    if _days_cache is not None:
        return _days_cache

    # Try loading from pickle first (< 1 second vs 70+ seconds from CSV)
    if os.path.exists(_pickle_path):
        csv_mtime = os.path.getmtime(_csv_path) if os.path.exists(_csv_path) else 0
        pkl_mtime = os.path.getmtime(_pickle_path)
        if pkl_mtime > csv_mtime:
            with open(_pickle_path, "rb") as f:
                _days_cache = pickle.load(f)
            return _days_cache

    # Build from CSV
    if not os.path.exists(_csv_path):
        _days_cache = {}
        return _days_cache

    df = pd.read_csv(_csv_path, parse_dates=["Gmttime"])
    df["et_time"] = df["Gmttime"] - pd.Timedelta(hours=GMT_TO_ET_HOURS)
    df = df.sort_values("et_time")
    df["date_str"] = df["et_time"].dt.strftime("%Y-%m-%d")

    # Build a clean records dataframe for fast to_dict conversion
    records = pd.DataFrame({
        "date_str": df["date_str"],
        "time": df["et_time"].dt.strftime("%Y-%m-%d %H:%M:%S"),
        "open": df["Open"].astype(float),
        "high": df["High"].astype(float),
        "low": df["Low"].astype(float),
        "close": df["Close"].astype(float),
        "volume": df["Volume"].astype(int),
    })

    cache: Dict[str, List[Dict]] = {}
    for date_str, group in records.groupby("date_str", sort=True):
        cache[date_str] = group.drop(columns=["date_str"]).to_dict("records")

    _days_cache = cache

    # Save to pickle for fast subsequent loads
    with open(_pickle_path, "wb") as f:
        pickle.dump(cache, f, protocol=pickle.HIGHEST_PROTOCOL)

    return _days_cache


def get_available_dates() -> List[str]:
    """Return sorted list of available trading dates as strings."""
    days = _build_days_cache()
    return sorted(days.keys())


def warmup_cache() -> None:
    """Pre-build the days cache. Called at server startup."""
    _build_days_cache()


def load_day_candles(date: Optional[str] = None) -> tuple[List[Dict], Optional[str]]:
    """
    Load 1-min candles for a specific trading day.

    Args:
        date: Date string in YYYY-MM-DD format. If None, picks the middle date.

    Returns:
        Tuple of (candles list, error string or None).
    """
    days = _build_days_cache()
    if not days:
        return [], "CSV data file not found"

    if date:
        candles = days.get(date)
        if candles is None:
            return [], f"No data for date {date}"
        return candles, None

    # Pick the middle date
    all_dates = sorted(days.keys())
    mid = all_dates[len(all_dates) // 2]
    return days[mid], None
