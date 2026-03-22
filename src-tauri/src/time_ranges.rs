use crate::models::{QueryTimeRange, TimeFilter};
use chrono::{DateTime, Local, NaiveDate};
use std::path::PathBuf;

/// Convert a structured `QueryTimeRange` into the legacy `TimeFilter` enum.
/// For `Absolute` ranges there is no direct `TimeFilter` equivalent, so we
/// return `TimeFilter::All` and rely on the separate file-level filter
/// (`matches_absolute_range`) to narrow the results.
pub fn query_time_range_to_filter(range: &QueryTimeRange) -> TimeFilter {
    match range {
        QueryTimeRange::BuiltIn { key } => TimeFilter::from(key),
        QueryTimeRange::Relative {
            days,
            include_today,
        } => {
            if *include_today {
                // +1 so that "last N days including today" covers today as well
                TimeFilter::Days(*days + 1)
            } else {
                TimeFilter::Days(*days)
            }
        }
        // Absolute ranges are handled at the file level; return All so that
        // the record-level filter inside `parse_session_file` lets everything
        // through.
        QueryTimeRange::Absolute { .. } => TimeFilter::All,
    }
}

/// Check whether a file's modification time falls within the inclusive
/// absolute date range `[start_date, end_date]`.  Dates are expected in
/// `YYYY-MM-DD` format and are interpreted in the local timezone.
pub fn matches_absolute_range(file_path: &PathBuf, start_date: &str, end_date: &str) -> bool {
    let start = match NaiveDate::parse_from_str(start_date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return false,
    };
    let end = match NaiveDate::parse_from_str(end_date, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => return false,
    };

    let metadata = match std::fs::metadata(file_path) {
        Ok(m) => m,
        Err(_) => return false,
    };

    let modified = match metadata.modified() {
        Ok(t) => t,
        Err(_) => return false,
    };

    let datetime: DateTime<Local> = modified.into();
    let file_date = datetime.date_naive();

    file_date >= start && file_date <= end
}

/// Unified file-level filter that dispatches to the appropriate strategy
/// depending on the `QueryTimeRange` variant.
///
/// - `BuiltIn` / `Relative` – delegates to the existing `filter_by_time` via
///   conversion to `TimeFilter`.
/// - `Absolute` – uses `matches_absolute_range` to check the file's mtime
///   against the start/end dates.
pub fn filter_by_query_range(range: &QueryTimeRange, file_path: &PathBuf) -> bool {
    match range {
        QueryTimeRange::Absolute {
            start_date,
            end_date,
        } => matches_absolute_range(file_path, start_date, end_date),
        _ => {
            let filter = query_time_range_to_filter(range);
            crate::commands::filter_by_time(&filter, file_path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BuiltInTimeRangeKey, QueryTimeRange, TimeFilter};

    #[test]
    fn test_relative_range_with_include_today() {
        let range = QueryTimeRange::Relative {
            days: 7,
            include_today: true,
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::Days(8)); // 7 + 1
    }

    #[test]
    fn test_relative_range_without_include_today() {
        let range = QueryTimeRange::Relative {
            days: 14,
            include_today: false,
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::Days(14));
    }

    #[test]
    fn test_built_in_range_today() {
        let range = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Today,
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::Today);
    }

    #[test]
    fn test_built_in_range_week() {
        let range = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Week,
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::Week);
    }

    #[test]
    fn test_built_in_range_month() {
        let range = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Month,
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::Month);
    }

    #[test]
    fn test_built_in_range_all() {
        let range = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::All,
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::All);
    }

    #[test]
    fn test_absolute_range_returns_all_filter() {
        let range = QueryTimeRange::Absolute {
            start_date: "2026-03-01".to_string(),
            end_date: "2026-03-15".to_string(),
        };
        let filter = query_time_range_to_filter(&range);
        assert_eq!(filter, TimeFilter::All);
    }

    #[test]
    fn test_function_signatures_compile() {
        // Verify that the public API compiles with the expected types.
        let range = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Today,
        };
        let _filter: TimeFilter = query_time_range_to_filter(&range);

        let path = PathBuf::from("/tmp/nonexistent_file.jsonl");
        // These should compile; the result will be false for a missing file.
        let _: bool = matches_absolute_range(&path, "2026-01-01", "2026-12-31");
        let _: bool = filter_by_query_range(&range, &path);
    }
}
