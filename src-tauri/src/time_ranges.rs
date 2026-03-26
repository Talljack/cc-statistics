use crate::models::{BuiltInTimeRangeKey, QueryTimeRange, TimeFilter};
use chrono::{DateTime, Duration, FixedOffset, Local, NaiveDate, TimeZone};
use std::path::PathBuf;

/// Convert a structured `QueryTimeRange` into the legacy `TimeFilter` enum.
/// Legacy parsers still rely on this path until every source has been moved
/// to the normalized record pipeline.
pub fn query_time_range_to_filter(range: &QueryTimeRange) -> TimeFilter {
    match range {
        QueryTimeRange::BuiltIn { key } => TimeFilter::from(key),
        QueryTimeRange::Relative {
            days,
            include_today,
        } => {
            if *include_today {
                TimeFilter::Days(*days + 1)
            } else {
                TimeFilter::Days(*days)
            }
        }
        QueryTimeRange::Absolute { .. } => TimeFilter::All,
    }
}

pub fn effective_query_range(
    time_filter: &TimeFilter,
    query_range: Option<&QueryTimeRange>,
) -> QueryTimeRange {
    query_range
        .cloned()
        .unwrap_or_else(|| time_filter_to_query_range(time_filter))
}

pub fn time_filter_to_query_range(filter: &TimeFilter) -> QueryTimeRange {
    match filter {
        TimeFilter::Today => QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Today,
        },
        TimeFilter::Week => QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Week,
        },
        TimeFilter::Month => QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Month,
        },
        TimeFilter::All => QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::All,
        },
        TimeFilter::Days(days) => QueryTimeRange::Relative {
            days: *days,
            include_today: false,
        },
    }
}

pub fn record_matches_query_range(
    range: &QueryTimeRange,
    timestamp: &DateTime<FixedOffset>,
) -> bool {
    match range {
        QueryTimeRange::BuiltIn { key } => match key {
            BuiltInTimeRangeKey::Today => {
                record_matches_time_filter(&TimeFilter::Today, timestamp)
            }
            BuiltInTimeRangeKey::Week => record_matches_time_filter(&TimeFilter::Week, timestamp),
            BuiltInTimeRangeKey::Month => {
                record_matches_time_filter(&TimeFilter::Month, timestamp)
            }
            BuiltInTimeRangeKey::All => true,
        },
        QueryTimeRange::Relative {
            days,
            include_today,
        } => {
            let normalized_days = if *include_today { *days + 1 } else { *days };
            record_matches_time_filter(&TimeFilter::Days(normalized_days), timestamp)
        }
        QueryTimeRange::Absolute {
            start_date,
            end_date,
        } => matches_absolute_dates(timestamp, start_date, end_date),
    }
}

pub fn record_matches_time_filter(
    time_filter: &TimeFilter,
    timestamp: &DateTime<FixedOffset>,
) -> bool {
    if matches!(time_filter, TimeFilter::All) {
        return true;
    }

    let record_time = timestamp.with_timezone(&Local);
    let now = Local::now();

    match time_filter {
        TimeFilter::Today => {
            let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
            let today_start_local = Local.from_local_datetime(&today_start).unwrap();
            record_time >= today_start_local
        }
        TimeFilter::Week => record_time >= now - Duration::days(7),
        TimeFilter::Month => record_time >= now - Duration::days(30),
        TimeFilter::Days(days) => record_time >= now - Duration::days(*days as i64),
        TimeFilter::All => true,
    }
}

fn matches_absolute_dates(
    timestamp: &DateTime<FixedOffset>,
    start_date: &str,
    end_date: &str,
) -> bool {
    let start = match NaiveDate::parse_from_str(start_date, "%Y-%m-%d") {
        Ok(value) => value,
        Err(_) => return false,
    };
    let end = match NaiveDate::parse_from_str(end_date, "%Y-%m-%d") {
        Ok(value) => value,
        Err(_) => return false,
    };

    let record_date = timestamp.with_timezone(&Local).date_naive();
    record_date >= start && record_date <= end
}

/// Check whether a file's modification time falls within the inclusive
/// absolute date range `[start_date, end_date]`. This remains a coarse scan
/// optimization only; final inclusion must be decided at the record level.
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

/// Unified **coarse** file filter for scan-time pruning.
/// Record-level inclusion must still use `record_matches_query_range`.
/// For `Absolute` ranges we widen the window by 1 day on each side because
/// a file's mtime may not perfectly align with its records' timestamps.
pub fn filter_by_query_range(range: &QueryTimeRange, file_path: &PathBuf) -> bool {
    match range {
        QueryTimeRange::Absolute {
            start_date,
            end_date,
        } => {
            // Widen by 1 day on each side for coarse filtering
            let start = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
                .map(|d| d - chrono::Duration::days(1))
                .map(|d| d.format("%Y-%m-%d").to_string());
            let end = chrono::NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
                .map(|d| d + chrono::Duration::days(1))
                .map(|d| d.format("%Y-%m-%d").to_string());
            match (start, end) {
                (Ok(s), Ok(e)) => matches_absolute_range(file_path, &s, &e),
                _ => true, // Can't parse dates; let record-level filter handle it
            }
        }
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
    use chrono::Offset;

    fn ts(value: &str) -> DateTime<FixedOffset> {
        DateTime::parse_from_rfc3339(value).unwrap()
    }

    #[test]
    fn relative_range_with_include_today_maps_to_legacy_days_plus_one() {
        let range = QueryTimeRange::Relative {
            days: 7,
            include_today: true,
        };
        assert_eq!(query_time_range_to_filter(&range), TimeFilter::Days(8));
    }

    #[test]
    fn absolute_range_includes_only_matching_record_dates() {
        let record = ts("2026-03-10T08:00:00+08:00");
        let before = ts("2026-03-09T23:59:59+08:00");
        let after = ts("2026-03-11T00:00:01+08:00");
        let range = QueryTimeRange::Absolute {
            start_date: "2026-03-10".to_string(),
            end_date: "2026-03-10".to_string(),
        };

        assert!(record_matches_query_range(&range, &record));
        assert!(!record_matches_query_range(&range, &before));
        assert!(!record_matches_query_range(&range, &after));
    }

    #[test]
    fn effective_query_range_prefers_explicit_query_range() {
        let explicit = QueryTimeRange::BuiltIn {
            key: BuiltInTimeRangeKey::Week,
        };

        let result = effective_query_range(&TimeFilter::Today, Some(&explicit));
        assert_eq!(result, explicit);
    }

    #[test]
    fn days_filter_uses_record_timestamp_not_file_time() {
        let now = Local::now();
        let in_range = now - Duration::days(1);
        let out_of_range = now - Duration::days(10);
        let in_range = in_range.with_timezone(&in_range.offset().fix());
        let out_of_range = out_of_range.with_timezone(&out_of_range.offset().fix());

        assert!(record_matches_time_filter(&TimeFilter::Days(2), &in_range));
        assert!(!record_matches_time_filter(&TimeFilter::Days(2), &out_of_range));
    }
}
