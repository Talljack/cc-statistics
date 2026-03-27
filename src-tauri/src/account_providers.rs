/// Account usage providers — fetch real-time quota/usage from each CLI tool's API.
///
/// Credential discovery order (per provider):
///   1. ~/.cc-statistics/providers.json  (user config, highest priority)
///   2. Environment variables            (OPENROUTER_API_KEY, etc.)
///   3. Tool-native credential files     (~/.codex/auth.json, ~/.gemini/oauth_creds.json, …)
///   4. macOS Keychain                   (Claude Code credentials)
///
/// Providers that cannot locate any credentials return Err and are silently skipped.
use crate::models::ProviderUsage;
use chrono::{DateTime, Utc};
use std::path::PathBuf;

// Gemini CLI ships these installed-app OAuth credentials in its own source.
// Reusing them keeps our account usage fetch aligned with the official CLI.
const GEMINI_CLI_OAUTH_CLIENT_ID: &str =
    "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const GEMINI_CLI_OAUTH_CLIENT_SECRET: &str = "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";

fn make_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Build HTTP client: {}", e))
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Read optional user-managed provider config from ~/.cc-statistics/providers.json.
fn provider_config() -> serde_json::Value {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return serde_json::Value::Object(Default::default()),
    };
    let path = home.join(".cc-statistics").join("providers.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn cfg_str(config: &serde_json::Value, key: &str) -> Option<String> {
    config
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn parse_reset_secs(body: &serde_json::Value, pointer: &str) -> i64 {
    body.pointer(pointer)
        .and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| (dt.with_timezone(&Utc) - Utc::now()).num_seconds().max(0))
        .unwrap_or(0)
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

// ---------------------------------------------------------------------------
// 1. Claude Code
// ---------------------------------------------------------------------------

pub async fn fetch_claude() -> Result<ProviderUsage, String> {
    let creds = read_claude_credentials()?;
    let access_token = creds
        .pointer("/claudeAiOauth/accessToken")
        .or_else(|| creds.get("accessToken"))
        .and_then(|v| v.as_str())
        .ok_or("No Claude OAuth accessToken found")?;

    let plan_type = creds
        .pointer("/claudeAiOauth/subscriptionType")
        .or_else(|| creds.get("subscriptionType"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let rate_limit_tier = creds
        .pointer("/claudeAiOauth/rateLimitTier")
        .or_else(|| creds.get("rateLimitTier"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let display_plan = if rate_limit_tier.to_lowercase().contains("max_20x") {
        "Max 20x".to_string()
    } else if rate_limit_tier.to_lowercase().contains("max_5x") {
        "Max 5x".to_string()
    } else {
        capitalize(&plan_type)
    };

    let client = make_client()?;
    let resp = client
        .get("https://api.anthropic.com/api/oauth/usage")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("anthropic-beta", "oauth-2025-04-20")
        .header("User-Agent", "claude-code/2.1.0")
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API returned {}: {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Claude response: {}", e))?;

    let session_used = body
        .pointer("/five_hour/utilization")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        * 100.0;
    let session_reset = parse_reset_secs(&body, "/five_hour/resets_at");

    let weekly_used = body
        .pointer("/seven_day/utilization")
        .and_then(|v| v.as_f64())
        .map(|v| v * 100.0);
    let weekly_reset = parse_reset_secs(&body, "/seven_day/resets_at");

    Ok(ProviderUsage {
        source: "claude_code".to_string(),
        plan_type: display_plan,
        session_used_percent: session_used,
        session_reset_seconds: session_reset,
        weekly_used_percent: weekly_used,
        weekly_reset_seconds: weekly_reset,
        limit_reached: session_used >= 100.0 || weekly_used.unwrap_or(0.0) >= 100.0,
        email: None,
        credits_balance: None,
    })
}

fn read_claude_credentials() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
            ])
            .output();
        if let Ok(o) = out {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout);
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(s.trim()) {
                    return Ok(v);
                }
            }
        }
    }
    let home = dirs::home_dir().ok_or("No home dir")?;
    for path in [
        home.join(".claude").join(".credentials.json"),
        home.join(".claude").join("credentials.json"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                return Ok(v);
            }
        }
    }
    Err("No Claude credentials found".to_string())
}

// ---------------------------------------------------------------------------
// 2. Codex (OpenAI ChatGPT)
// ---------------------------------------------------------------------------

pub async fn fetch_codex() -> Result<ProviderUsage, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    let auth_path = home.join(".codex").join("auth.json");
    let auth: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&auth_path)
            .map_err(|e| format!("Read ~/.codex/auth.json: {}", e))?,
    )
    .map_err(|e| format!("Parse auth.json: {}", e))?;

    let access_token = auth
        .pointer("/tokens/access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in ~/.codex/auth.json")?;
    let account_id = auth
        .pointer("/tokens/account_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let client = make_client()?;
    let resp = client
        .get("https://chatgpt.com/backend-api/wham/usage")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("ChatGPT-Account-Id", account_id)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Codex API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Codex API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Codex response: {}", e))?;

    let plan_type = body
        .get("plan_type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let email = body
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let limit_reached = body
        .pointer("/rate_limit/limit_reached")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let session_used = body
        .pointer("/rate_limit/primary_window/used_percent")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let session_reset = body
        .pointer("/rate_limit/primary_window/reset_after_seconds")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let (weekly_used, weekly_reset) = match body.pointer("/rate_limit/secondary_window") {
        Some(w) if !w.is_null() => (
            w.get("used_percent").and_then(|v| v.as_f64()),
            w.get("reset_after_seconds")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
        ),
        _ => (None, 0),
    };
    let credits_balance = body.pointer("/credits/balance").and_then(|v| {
        v.as_f64()
            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
    });

    Ok(ProviderUsage {
        source: "codex".to_string(),
        plan_type,
        session_used_percent: session_used,
        session_reset_seconds: session_reset,
        weekly_used_percent: weekly_used,
        weekly_reset_seconds: weekly_reset,
        limit_reached,
        email,
        credits_balance,
    })
}

// ---------------------------------------------------------------------------
// 3. Gemini CLI
// ---------------------------------------------------------------------------

pub async fn fetch_gemini() -> Result<ProviderUsage, String> {
    let mut token = get_gemini_access_token(false).await?;
    let mut resp = request_gemini_quota(&token).await?;

    if resp.status() == reqwest::StatusCode::UNAUTHORIZED
        || resp.status() == reqwest::StatusCode::FORBIDDEN
    {
        token = get_gemini_access_token(true).await?;
        resp = request_gemini_quota(&token).await?;
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini quota API returned {}: {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Gemini response: {}", e))?;

    // Response shape varies; try multiple paths
    let used_percent = body
        .pointer("/quotaStatus/usedPercent")
        .or_else(|| body.pointer("/usedPercent"))
        .and_then(|v| v.as_f64())
        .unwrap_or_else(|| {
            // Fallback: compute from used/limit
            let used = body
                .pointer("/quotaStatus/used")
                .or_else(|| body.pointer("/used"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let limit = body
                .pointer("/quotaStatus/limit")
                .or_else(|| body.pointer("/limit"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if limit > 0.0 {
                used / limit * 100.0
            } else {
                0.0
            }
        });

    let reset_secs = body
        .pointer("/quotaStatus/resetAt")
        .or_else(|| body.pointer("/resetAt"))
        .and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| (dt.with_timezone(&Utc) - Utc::now()).num_seconds().max(0))
        .unwrap_or(0);

    let plan_type = body
        .pointer("/planInfo/type")
        .or_else(|| body.pointer("/planType"))
        .and_then(|v| v.as_str())
        .unwrap_or("Free")
        .to_string();

    // Try to get email from the id_token stored in oauth_creds
    let email = read_gemini_email();

    Ok(ProviderUsage {
        source: "gemini".to_string(),
        plan_type,
        session_used_percent: used_percent,
        session_reset_seconds: reset_secs,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used_percent >= 100.0,
        email,
        credits_balance: None,
    })
}

async fn request_gemini_quota(token: &str) -> Result<reqwest::Response, String> {
    make_client()?
        .post("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Gemini quota API failed: {}", e))
}

fn gemini_oauth_client_credentials(config: &serde_json::Value) -> (String, String) {
    let client_id = cfg_str(config, "gemini_client_id")
        .or_else(|| std::env::var("GEMINI_CLIENT_ID").ok())
        .unwrap_or_else(|| GEMINI_CLI_OAUTH_CLIENT_ID.to_string());
    let client_secret = cfg_str(config, "gemini_client_secret")
        .or_else(|| std::env::var("GEMINI_CLIENT_SECRET").ok())
        .unwrap_or_else(|| GEMINI_CLI_OAUTH_CLIENT_SECRET.to_string());

    (client_id, client_secret)
}

async fn get_gemini_access_token(force_refresh: bool) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;
    let creds_path = home.join(".gemini").join("oauth_creds.json");
    let creds: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&creds_path)
            .map_err(|e| format!("Read ~/.gemini/oauth_creds.json: {}", e))?,
    )
    .map_err(|e| format!("Parse Gemini credentials: {}", e))?;

    let access_token = creds
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in Gemini credentials")?;

    // Check expiry (expiry_date is Unix ms)
    let expiry_ms = creds
        .get("expiry_date")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let now_ms = Utc::now().timestamp_millis();
    if !force_refresh && expiry_ms > now_ms + 60_000 {
        // Token still valid (60s buffer)
        return Ok(access_token.to_string());
    }

    // Token expired — refresh it
    let refresh_token = creds
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .ok_or("No refresh_token in Gemini credentials")?;
    let cfg = provider_config();
    let (client_id, client_secret) = gemini_oauth_client_credentials(&cfg);

    let client = make_client()?;
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| format!("Gemini token refresh failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Gemini token refresh returned {}: {}",
            status, body
        ));
    }

    let token_resp: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse token refresh response: {}", e))?;

    let new_token = token_resp
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access_token in token refresh response")?
        .to_string();

    // Persist refreshed credentials
    let expires_in = token_resp
        .get("expires_in")
        .and_then(|v| v.as_i64())
        .unwrap_or(3600);
    let new_expiry_ms = now_ms + expires_in * 1000;
    let mut updated = creds.clone();
    if let serde_json::Value::Object(ref mut map) = updated {
        map.insert("access_token".to_string(), serde_json::json!(new_token));
        map.insert("expiry_date".to_string(), serde_json::json!(new_expiry_ms));
    }
    let _ = std::fs::write(
        &creds_path,
        serde_json::to_string_pretty(&updated).unwrap_or_default(),
    );

    Ok(new_token)
}

fn read_gemini_email() -> Option<String> {
    let home = dirs::home_dir()?;
    let creds_path = home.join(".gemini").join("oauth_creds.json");
    let creds: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&creds_path).ok()?).ok()?;
    // Decode email from id_token JWT payload (no signature verification needed here)
    let id_token = creds.get("id_token").and_then(|v| v.as_str())?;
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let payload = base64_decode_nopad(parts[1])?;
    let claims: serde_json::Value = serde_json::from_slice(&payload).ok()?;
    claims
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn base64_decode_nopad(s: &str) -> Option<Vec<u8>> {
    // Standard base64 decode with URL-safe alphabet and no padding
    let padded = match s.len() % 4 {
        0 => s.to_string(),
        2 => format!("{}==", s),
        3 => format!("{}=", s),
        _ => return None,
    };
    let fixed = padded.replace('-', "+").replace('_', "/");
    // Use stdlib base64 via a simple implementation
    let table: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut decode_map = [255u8; 256];
    for (i, &c) in table.iter().enumerate() {
        decode_map[c as usize] = i as u8;
    }
    let mut out = Vec::new();
    let bytes = fixed.as_bytes();
    let mut i = 0;
    while i + 3 < bytes.len() {
        let a = decode_map[bytes[i] as usize];
        let b = decode_map[bytes[i + 1] as usize];
        let c = decode_map[bytes[i + 2] as usize];
        let d = decode_map[bytes[i + 3] as usize];
        if a == 255 || b == 255 {
            break;
        }
        out.push((a << 2) | (b >> 4));
        if c != 255 && bytes[i + 2] != b'=' {
            out.push((b << 4) | (c >> 2));
        }
        if d != 255 && bytes[i + 3] != b'=' {
            out.push((c << 6) | d);
        }
        i += 4;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_oauth_credentials_default_to_cli_constants() {
        let cfg = serde_json::json!({});
        let (client_id, client_secret) = gemini_oauth_client_credentials(&cfg);

        assert_eq!(client_id, GEMINI_CLI_OAUTH_CLIENT_ID);
        assert_eq!(client_secret, GEMINI_CLI_OAUTH_CLIENT_SECRET);
    }

    #[test]
    fn gemini_oauth_credentials_allow_config_override() {
        let cfg = serde_json::json!({
            "gemini_client_id": "custom-client-id",
            "gemini_client_secret": "custom-client-secret"
        });
        let (client_id, client_secret) = gemini_oauth_client_credentials(&cfg);

        assert_eq!(client_id, "custom-client-id");
        assert_eq!(client_secret, "custom-client-secret");
    }
}

// ---------------------------------------------------------------------------
// 4. OpenRouter
// ---------------------------------------------------------------------------

pub async fn fetch_openrouter() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let api_key = cfg_str(&cfg, "openrouter_api_key")
        .or_else(|| std::env::var("OPENROUTER_API_KEY").ok())
        .ok_or("No OpenRouter API key (set openrouter_api_key in ~/.cc-statistics/providers.json or OPENROUTER_API_KEY env)")?;

    let client = make_client()?;

    // Fetch credits
    let credits_resp = client
        .get("https://openrouter.ai/api/v1/credits")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("OpenRouter credits request failed: {}", e))?;

    if !credits_resp.status().is_success() {
        return Err(format!("OpenRouter API returned {}", credits_resp.status()));
    }

    let credits_body: serde_json::Value = credits_resp
        .json()
        .await
        .map_err(|e| format!("Parse OpenRouter credits: {}", e))?;

    let total_credits = credits_body
        .pointer("/data/total_credits")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let total_usage = credits_body
        .pointer("/data/total_usage")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let remaining = (total_credits - total_usage).max(0.0);

    let used_pct = if total_credits > 0.0 {
        (total_usage / total_credits * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(ProviderUsage {
        source: "openrouter".to_string(),
        plan_type: "Pay-as-you-go".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: remaining <= 0.0,
        email: None,
        credits_balance: Some(remaining),
    })
}

// ---------------------------------------------------------------------------
// 5. GitHub Copilot
// ---------------------------------------------------------------------------

pub async fn fetch_copilot() -> Result<ProviderUsage, String> {
    let token = find_copilot_token()?;

    let client = make_client()?;
    let resp = client
        .get("https://api.github.com/copilot_internal/user")
        .header("Authorization", format!("token {}", token))
        .header("Accept", "application/json")
        .header("User-Agent", "cc-statistics/1.0")
        .send()
        .await
        .map_err(|e| format!("Copilot API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Copilot API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Copilot response: {}", e))?;

    let plan_type = body
        .pointer("/copilot_plan")
        .or_else(|| body.get("plan"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let chat_used = body
        .pointer("/chat_jetbrains_quota/remaining")
        .or_else(|| body.pointer("/chat_quota/remaining"))
        .and_then(|v| v.as_f64());
    let chat_total = body
        .pointer("/chat_jetbrains_quota/total")
        .or_else(|| body.pointer("/chat_quota/total"))
        .and_then(|v| v.as_f64());

    let used_pct = match (chat_used, chat_total) {
        (Some(remaining), Some(total)) if total > 0.0 => {
            ((total - remaining) / total * 100.0).min(100.0)
        }
        _ => 0.0,
    };

    Ok(ProviderUsage {
        source: "copilot".to_string(),
        plan_type: capitalize(&plan_type),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: chat_used.unwrap_or(1.0) <= 0.0,
        email: None,
        credits_balance: chat_used,
    })
}

fn find_copilot_token() -> Result<String, String> {
    let cfg = provider_config();
    if let Some(t) = cfg_str(&cfg, "copilot_token") {
        return Ok(t);
    }
    if let Ok(t) = std::env::var("GITHUB_COPILOT_TOKEN") {
        return Ok(t);
    }
    // Try ~/.config/github-copilot/apps.json (new location)
    let home = dirs::home_dir().ok_or("No home dir")?;
    for path in [
        home.join(".config")
            .join("github-copilot")
            .join("apps.json"),
        home.join(".config")
            .join("github-copilot")
            .join("hosts.json"),
    ] {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                // apps.json: { "github.com": { "oauth_token": "..." } }
                let token = v
                    .pointer("/github.com/oauth_token")
                    .or_else(|| v.pointer("/github.com:443/oauth_token"))
                    .and_then(|v| v.as_str());
                if let Some(t) = token {
                    return Ok(t.to_string());
                }
            }
        }
    }
    // Try ~/.config/gh/hosts.yml (gh CLI token)
    let gh_hosts = home.join(".config").join("gh").join("hosts.yml");
    if let Ok(content) = std::fs::read_to_string(&gh_hosts) {
        // Simple YAML parse — look for oauth_token line after github.com
        for line in content.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("oauth_token:") {
                let token = rest.trim().trim_matches('"').trim_matches('\'');
                if !token.is_empty() {
                    return Ok(token.to_string());
                }
            }
        }
    }
    Err("No GitHub Copilot token found".to_string())
}

// ---------------------------------------------------------------------------
// 6. Kimi K2 (moonshot-ai)
// ---------------------------------------------------------------------------

pub async fn fetch_kimi_k2() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let api_key = cfg_str(&cfg, "kimi_k2_api_key")
        .or_else(|| std::env::var("KIMI_K2_API_KEY").ok())
        .or_else(|| std::env::var("MOONSHOT_API_KEY").ok())
        .ok_or("No Kimi K2 API key (set kimi_k2_api_key in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    // Moonshot AI balance endpoint
    let resp = client
        .get("https://api.moonshot.cn/v1/users/me/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Kimi K2 API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Kimi K2 API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Kimi K2 response: {}", e))?;

    let balance = body
        .pointer("/data/balance")
        .or_else(|| body.get("balance"))
        .and_then(|v| v.as_f64());

    let cash_balance = body
        .pointer("/data/cash_balance")
        .and_then(|v| v.as_f64())
        .or(balance);

    Ok(ProviderUsage {
        source: "kimi_k2".to_string(),
        plan_type: "Pay-as-you-go".to_string(),
        session_used_percent: 0.0,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: cash_balance.unwrap_or(1.0) <= 0.0,
        email: None,
        credits_balance: cash_balance,
    })
}

// ---------------------------------------------------------------------------
// 7. Z.AI (GLM / Zhipu AI)
// ---------------------------------------------------------------------------

pub async fn fetch_zai() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let api_key = cfg_str(&cfg, "zai_api_key")
        .or_else(|| std::env::var("Z_AI_API_KEY").ok())
        .or_else(|| std::env::var("ZHIPU_API_KEY").ok())
        .or_else(|| std::env::var("GLM_API_KEY").ok())
        .ok_or("No Z.AI API key (set zai_api_key in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let resp = client
        .get("https://open.bigmodel.cn/api/paas/v4/user/billing/balance")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Z.AI API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Z.AI API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Z.AI response: {}", e))?;

    let balance = body
        .pointer("/data/balance")
        .or_else(|| body.get("balance"))
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        });

    Ok(ProviderUsage {
        source: "zai".to_string(),
        plan_type: "Pay-as-you-go".to_string(),
        session_used_percent: 0.0,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: balance.unwrap_or(1.0) <= 0.0,
        email: None,
        credits_balance: balance,
    })
}

// ---------------------------------------------------------------------------
// 8. Warp Terminal
// ---------------------------------------------------------------------------

pub async fn fetch_warp() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let api_key = cfg_str(&cfg, "warp_api_key")
        .or_else(|| std::env::var("WARP_API_KEY").ok())
        .ok_or("No Warp API key (set warp_api_key in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let query = r#"{"query":"query GetRequestLimitInfo { requestLimitInfo { remainingRequests totalRequests resetAt } }","operationName":"GetRequestLimitInfo"}"#;

    let resp = client
        .post("https://app.warp.dev/graphql/v2")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(query)
        .send()
        .await
        .map_err(|e| format!("Warp API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Warp API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Warp response: {}", e))?;

    let remaining = body
        .pointer("/data/requestLimitInfo/remainingRequests")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let total = body
        .pointer("/data/requestLimitInfo/totalRequests")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let reset_at = body
        .pointer("/data/requestLimitInfo/resetAt")
        .and_then(|v| v.as_str())
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| (dt.with_timezone(&Utc) - Utc::now()).num_seconds().max(0))
        .unwrap_or(0);

    let used_pct = if total > 0.0 {
        ((total - remaining) / total * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(ProviderUsage {
        source: "warp".to_string(),
        plan_type: "Subscription".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: reset_at,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: remaining <= 0.0,
        email: None,
        credits_balance: Some(remaining),
    })
}

// ---------------------------------------------------------------------------
// 9. Cursor
// ---------------------------------------------------------------------------

pub async fn fetch_cursor() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let session_token = cfg_str(&cfg, "cursor_token")
        .or_else(|| std::env::var("CURSOR_SESSION_TOKEN").ok())
        .ok_or("No Cursor session token (set cursor_token in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let resp = client
        .get("https://www.cursor.com/api/usage")
        .header(
            "Cookie",
            format!("WorkosCursorSessionToken={}", session_token),
        )
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("Cursor API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Cursor API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Cursor response: {}", e))?;

    // Cursor returns various model usage; summarize premium requests
    let premium_used = body
        .pointer("/gpt-4/numRequests")
        .or_else(|| body.pointer("/premiumRequests/numRequests"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let premium_limit = body
        .pointer("/gpt-4/maxRequestUsage")
        .or_else(|| body.pointer("/premiumRequests/maxRequestUsage"))
        .and_then(|v| v.as_f64())
        .unwrap_or(500.0);

    let used_pct = if premium_limit > 0.0 {
        (premium_used / premium_limit * 100.0).min(100.0)
    } else {
        0.0
    };

    let plan_type = body
        .get("memberType")
        .and_then(|v| v.as_str())
        .unwrap_or("Pro")
        .to_string();

    Ok(ProviderUsage {
        source: "cursor".to_string(),
        plan_type: capitalize(&plan_type),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: premium_used >= premium_limit,
        email: None,
        credits_balance: Some(premium_limit - premium_used),
    })
}

// ---------------------------------------------------------------------------
// 10. Kimi (Moonshot consumer chat — kimi.moonshot.cn)
// ---------------------------------------------------------------------------

pub async fn fetch_kimi() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let cookie = cfg_str(&cfg, "kimi_cookie")
        .or_else(|| std::env::var("KIMI_COOKIE").ok())
        .ok_or("No Kimi cookie (set kimi_cookie in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let resp = client
        .post("https://kimi.moonshot.cn/api/billing/usage")
        .header("Cookie", &cookie)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("Kimi API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Kimi API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Kimi response: {}", e))?;

    let used = body
        .pointer("/data/used_quota")
        .or_else(|| body.pointer("/used_quota"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let total = body
        .pointer("/data/total_quota")
        .or_else(|| body.pointer("/total_quota"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let used_pct = if total > 0.0 {
        (used / total * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(ProviderUsage {
        source: "kimi".to_string(),
        plan_type: "Subscription".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used >= total && total > 0.0,
        email: None,
        credits_balance: if total > 0.0 {
            Some(total - used)
        } else {
            None
        },
    })
}

// ---------------------------------------------------------------------------
// 11. Amp (ampcode.com)
// ---------------------------------------------------------------------------

pub async fn fetch_amp() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let cookie = cfg_str(&cfg, "amp_cookie")
        .or_else(|| std::env::var("AMP_COOKIE").ok())
        .ok_or("No Amp session cookie (set amp_cookie in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let resp = client
        .get("https://ampcode.com/api/user/usage")
        .header("Cookie", &cookie)
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("Amp API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Amp API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Amp response: {}", e))?;

    let used = body
        .pointer("/data/used")
        .or_else(|| body.get("used"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let limit = body
        .pointer("/data/limit")
        .or_else(|| body.get("limit"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let used_pct = if limit > 0.0 {
        (used / limit * 100.0).min(100.0)
    } else {
        0.0
    };

    let plan_type = body
        .get("plan")
        .and_then(|v| v.as_str())
        .unwrap_or("Pro")
        .to_string();

    Ok(ProviderUsage {
        source: "amp".to_string(),
        plan_type: capitalize(&plan_type),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used >= limit && limit > 0.0,
        email: None,
        credits_balance: if limit > 0.0 {
            Some(limit - used)
        } else {
            None
        },
    })
}

// ---------------------------------------------------------------------------
// 12. Factory (Droid)
// ---------------------------------------------------------------------------

pub async fn fetch_factory() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let token = cfg_str(&cfg, "factory_token")
        .or_else(|| std::env::var("FACTORY_TOKEN").ok())
        .ok_or("No Factory token (set factory_token in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let resp = client
        .get("https://app.factory.ai/api/v1/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Factory API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Factory API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Factory response: {}", e))?;

    let used = body
        .pointer("/data/credits_used")
        .or_else(|| body.get("credits_used"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let total = body
        .pointer("/data/credits_total")
        .or_else(|| body.get("credits_total"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let used_pct = if total > 0.0 {
        (used / total * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(ProviderUsage {
        source: "factory".to_string(),
        plan_type: "Subscription".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used >= total && total > 0.0,
        email: None,
        credits_balance: if total > 0.0 {
            Some(total - used)
        } else {
            None
        },
    })
}

// ---------------------------------------------------------------------------
// 13. Augment Code
// ---------------------------------------------------------------------------

pub async fn fetch_augment() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let token = cfg_str(&cfg, "augment_token")
        .or_else(|| std::env::var("AUGMENT_TOKEN").ok())
        .ok_or("No Augment token (set augment_token in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;
    let resp = client
        .get("https://api.augment.dev/v1/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Augment API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Augment API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Augment response: {}", e))?;

    let used = body
        .pointer("/usage/requests_used")
        .or_else(|| body.get("requests_used"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let limit = body
        .pointer("/usage/requests_limit")
        .or_else(|| body.get("requests_limit"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let used_pct = if limit > 0.0 {
        (used / limit * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(ProviderUsage {
        source: "augment".to_string(),
        plan_type: "Subscription".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used >= limit && limit > 0.0,
        email: None,
        credits_balance: if limit > 0.0 {
            Some(limit - used)
        } else {
            None
        },
    })
}

// ---------------------------------------------------------------------------
// 14. JetBrains AI Assistant (local XML quota file)
// ---------------------------------------------------------------------------

pub fn fetch_jetbrains_ai() -> Result<ProviderUsage, String> {
    let home = dirs::home_dir().ok_or("No home dir")?;

    // Search for AIAssistantQuotaManager2.xml across all JetBrains IDE installations
    let jetbrains_base = home
        .join("Library")
        .join("Application Support")
        .join("JetBrains");
    let quota_file = find_jetbrains_quota_file(&jetbrains_base)?;

    let content = std::fs::read_to_string(&quota_file)
        .map_err(|e| format!("Read JetBrains quota file: {}", e))?;

    parse_jetbrains_quota(&content)
}

fn find_jetbrains_quota_file(jetbrains_base: &std::path::Path) -> Result<PathBuf, String> {
    if !jetbrains_base.is_dir() {
        return Err("JetBrains support directory not found".to_string());
    }
    let entries =
        std::fs::read_dir(jetbrains_base).map_err(|e| format!("Read JetBrains dir: {}", e))?;

    let mut candidates: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry
            .path()
            .join("options")
            .join("AIAssistantQuotaManager2.xml");
        if path.is_file() {
            candidates.push(path);
        }
    }
    candidates.sort_by(|a, b| {
        let mt_a = std::fs::metadata(a).and_then(|m| m.modified()).ok();
        let mt_b = std::fs::metadata(b).and_then(|m| m.modified()).ok();
        mt_b.cmp(&mt_a)
    });
    candidates
        .into_iter()
        .next()
        .ok_or("No JetBrains AI quota file found".to_string())
}

fn parse_jetbrains_quota(xml: &str) -> Result<ProviderUsage, String> {
    // Simple regex-free XML parsing for the quota values
    // <Quota remaining="X" total="Y" resetAt="..." />
    let remaining = extract_xml_attr(xml, "Quota", "remaining")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let total = extract_xml_attr(xml, "Quota", "total")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let reset_at_str = extract_xml_attr(xml, "Quota", "resetAt");

    let reset_secs = reset_at_str
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| (dt.with_timezone(&Utc) - Utc::now()).num_seconds().max(0))
        .unwrap_or(0);

    let used = (total - remaining).max(0.0);
    let used_pct = if total > 0.0 {
        (used / total * 100.0).min(100.0)
    } else {
        0.0
    };

    if total == 0.0 && remaining == 0.0 {
        return Err("JetBrains AI quota file has no data".to_string());
    }

    Ok(ProviderUsage {
        source: "jetbrains_ai".to_string(),
        plan_type: "Subscription".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: reset_secs,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: remaining <= 0.0,
        email: None,
        credits_balance: Some(remaining),
    })
}

fn extract_xml_attr(xml: &str, element: &str, attr: &str) -> Option<String> {
    let elem_start = xml.find(&format!("<{}", element))?;
    let elem_end = xml[elem_start..].find('>')?;
    let elem_slice = &xml[elem_start..elem_start + elem_end];
    let attr_pattern = format!("{}=\"", attr);
    let attr_start = elem_slice.find(&attr_pattern)? + attr_pattern.len();
    let rest = &elem_slice[attr_start..];
    let attr_end = rest.find('"')?;
    Some(rest[..attr_end].to_string())
}

// ---------------------------------------------------------------------------
// 15. Ollama Cloud
// ---------------------------------------------------------------------------

pub async fn fetch_ollama_cloud() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    // Auth priority: env OLLAMA_AUTH → config ollama_cloud_token
    let token = std::env::var("OLLAMA_AUTH")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| cfg_str(&cfg, "ollama_cloud_token"))
        .ok_or("No Ollama Cloud token (set OLLAMA_AUTH env or ollama_cloud_token in ~/.cc-statistics/providers.json)")?;

    let client = make_client()?;

    // Get user info from Ollama Cloud API
    let me_resp = client
        .get("https://ollama.com/api/me")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Ollama Cloud /api/me failed: {}", e))?;

    if !me_resp.status().is_success() {
        return Err(format!(
            "Ollama Cloud /api/me returned {}",
            me_resp.status()
        ));
    }

    let me: serde_json::Value = me_resp
        .json()
        .await
        .map_err(|e| format!("Parse Ollama Cloud /api/me: {}", e))?;

    let email = me
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let username = me.get("username").and_then(|v| v.as_str()).unwrap_or("");

    // Fetch billing / plan info
    let plan_resp = client
        .get("https://ollama.com/api/billing/plan")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .send()
        .await;

    let (plan_type, used_pct, credits) = if let Ok(r) = plan_resp {
        if r.status().is_success() {
            let body: serde_json::Value = r.json().await.unwrap_or_default();
            let plan = body
                .pointer("/plan/name")
                .or_else(|| body.get("plan"))
                .and_then(|v| v.as_str())
                .unwrap_or("Cloud")
                .to_string();
            let used = body
                .pointer("/usage/requests_used")
                .or_else(|| body.get("requests_used"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let limit = body
                .pointer("/usage/requests_limit")
                .or_else(|| body.get("requests_limit"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let pct = if limit > 0.0 {
                (used / limit * 100.0).min(100.0)
            } else {
                0.0
            };
            let credits = body
                .pointer("/billing/credits")
                .or_else(|| body.get("credits"))
                .and_then(|v| v.as_f64());
            (plan, pct, credits)
        } else {
            ("Cloud".to_string(), 0.0, None)
        }
    } else {
        ("Cloud".to_string(), 0.0, None)
    };

    let display = if !username.is_empty() {
        format!("{} ({})", plan_type, username)
    } else {
        plan_type
    };

    Ok(ProviderUsage {
        source: "ollama_cloud".to_string(),
        plan_type: display,
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used_pct >= 100.0,
        email,
        credits_balance: credits,
    })
}

// ---------------------------------------------------------------------------
// 17. Kiro (Amazon AI coding assistant)
// ---------------------------------------------------------------------------

pub async fn fetch_kiro() -> Result<ProviderUsage, String> {
    let cfg = provider_config();
    let token = cfg_str(&cfg, "kiro_token").or_else(|| std::env::var("KIRO_TOKEN").ok());

    // Try running kiro CLI for usage info first (non-blocking, 5s timeout)
    let kiro_cli_result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new("kiro")
            .args(["usage", "--json"])
            .output(),
    )
    .await;
    if let Ok(Ok(output)) = kiro_cli_result {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(body) = serde_json::from_str::<serde_json::Value>(&stdout) {
                return parse_kiro_json(&body);
            }
        }
    }

    // Fallback: API if token available
    let token = token.ok_or("No Kiro token and kiro CLI not found")?;
    let client = make_client()?;
    let resp = client
        .get("https://api.kiro.io/v1/usage")
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Kiro API request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Kiro API returned {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Parse Kiro response: {}", e))?;

    parse_kiro_json(&body)
}

fn parse_kiro_json(body: &serde_json::Value) -> Result<ProviderUsage, String> {
    let used = body
        .pointer("/usage/requests_used")
        .or_else(|| body.get("requests_used"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let limit = body
        .pointer("/usage/requests_limit")
        .or_else(|| body.get("requests_limit"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let used_pct = if limit > 0.0 {
        (used / limit * 100.0).min(100.0)
    } else {
        0.0
    };

    Ok(ProviderUsage {
        source: "kiro".to_string(),
        plan_type: "Subscription".to_string(),
        session_used_percent: used_pct,
        session_reset_seconds: 0,
        weekly_used_percent: None,
        weekly_reset_seconds: 0,
        limit_reached: used >= limit && limit > 0.0,
        email: None,
        credits_balance: if limit > 0.0 {
            Some(limit - used)
        } else {
            None
        },
    })
}

// ---------------------------------------------------------------------------
// Master fetch — runs all providers in parallel, returns only successes
// ---------------------------------------------------------------------------

pub async fn fetch_all() -> Vec<ProviderUsage> {
    tokio::time::timeout(std::time::Duration::from_secs(15), fetch_all_inner())
        .await
        .unwrap_or_else(|_| {
            eprintln!("fetch_all timed out after 15s");
            Vec::new()
        })
}

async fn fetch_all_inner() -> Vec<ProviderUsage> {
    // Async providers
    let (
        claude,
        codex,
        gemini,
        openrouter,
        copilot,
        kimi_k2,
        zai,
        warp,
        cursor,
        kimi,
        amp,
        factory,
        augment,
        ollama_cloud,
        kiro,
    ) = tokio::join!(
        fetch_claude(),
        fetch_codex(),
        fetch_gemini(),
        fetch_openrouter(),
        fetch_copilot(),
        fetch_kimi_k2(),
        fetch_zai(),
        fetch_warp(),
        fetch_cursor(),
        fetch_kimi(),
        fetch_amp(),
        fetch_factory(),
        fetch_augment(),
        fetch_ollama_cloud(),
        fetch_kiro(),
    );

    let async_results = [
        claude,
        codex,
        gemini,
        openrouter,
        copilot,
        kimi_k2,
        zai,
        warp,
        cursor,
        kimi,
        amp,
        factory,
        augment,
        ollama_cloud,
        kiro,
    ];

    // Sync providers (file reads)
    let jetbrains = fetch_jetbrains_ai();

    let mut providers: Vec<ProviderUsage> = async_results
        .into_iter()
        .filter_map(|r| {
            if let Err(ref e) = r {
                eprintln!("Provider fetch skipped: {}", e);
            }
            r.ok()
        })
        .collect();

    if let Ok(jb) = jetbrains {
        providers.push(jb);
    } else if let Err(e) = jetbrains {
        eprintln!("JetBrains AI fetch skipped: {}", e);
    }

    providers
}
