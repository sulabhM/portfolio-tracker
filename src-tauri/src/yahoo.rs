//! Yahoo Finance authenticated fetch for the Tauri desktop app.
//! Seeds cookies, obtains a crumb, then requests `query2` paths used by the web client.

use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::async_runtime::Mutex;

const YAHOO_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// How long a crumb (and the cookie jar it belongs to) is reused before being
/// refreshed proactively. Yahoo sessions last well beyond this; a 401/403 on a
/// data request also forces an immediate refresh.
const CRUMB_TTL: Duration = Duration::from_secs(30 * 60);

fn http_client() -> &'static reqwest::Client {
  static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
  CLIENT.get_or_init(|| {
    reqwest::Client::builder()
      .cookie_store(true)
      .use_rustls_tls()
      .user_agent(YAHOO_UA)
      .timeout(Duration::from_secs(20))
      .build()
      .expect("reqwest client with cookies")
  })
}

struct CrumbCache {
  crumb: String,
  fetched_at: Instant,
}

/// Single shared crumb. The async mutex is held for the whole refresh so that
/// N concurrent quote requests at startup coalesce into one cookie seed + one
/// crumb fetch instead of N of each (which is what got the app rate-limited).
fn crumb_cache() -> &'static Mutex<Option<CrumbCache>> {
  static CACHE: OnceLock<Mutex<Option<CrumbCache>>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(None))
}

fn common_headers() -> reqwest::header::HeaderMap {
  let mut h = reqwest::header::HeaderMap::new();
  h.insert(ACCEPT, "application/json, text/plain, */*".parse().unwrap());
  h.insert(ACCEPT_LANGUAGE, "en-US,en;q=0.9".parse().unwrap());
  h
}

/// The frontend only ever requests `v<N>/finance/...` endpoints. Anything else
/// (absolute URLs, traversal, fragments that would swallow the crumb, control
/// characters) is rejected before it can reach the network.
fn validate_path(path: &str) -> Result<(), String> {
  let p = path.trim();
  if p.is_empty() {
    return Err("empty Yahoo path".into());
  }
  if p.contains("..")
    || p.contains('#')
    || p.contains('\\')
    || p.chars().any(|c| c.is_control() || c.is_whitespace())
  {
    return Err("invalid Yahoo path".into());
  }
  if p.starts_with('/') || p.contains("://") {
    return Err("invalid Yahoo path".into());
  }
  let mut parts = p.splitn(3, '/');
  let version_ok = parts
    .next()
    .map(|v| v.len() > 1 && v.starts_with('v') && v[1..].chars().all(|c| c.is_ascii_digit()))
    .unwrap_or(false);
  let finance_ok = parts.next() == Some("finance");
  if !version_ok || !finance_ok {
    return Err("invalid Yahoo path".into());
  }
  Ok(())
}

async fn fetch_fresh_crumb(client: &reqwest::Client) -> Result<String, String> {
  client
    .get("https://fc.yahoo.com")
    .headers(common_headers())
    .send()
    .await
    .map_err(|e| format!("Yahoo cookie seed failed: {e}"))?;

  let crumb = client
    .get("https://query1.finance.yahoo.com/v1/test/getcrumb")
    .headers(common_headers())
    .send()
    .await
    .map_err(|e| format!("Yahoo getcrumb request failed: {e}"))?
    .text()
    .await
    .map_err(|e| format!("Yahoo getcrumb body failed: {e}"))?;

  let crumb = crumb.trim().to_string();
  // Yahoo answers some failures with an HTML page and 200; a real crumb is a
  // short opaque token.
  if crumb.is_empty() || crumb.len() > 64 || crumb.contains('<') {
    return Err("Yahoo returned an invalid crumb".into());
  }
  Ok(crumb)
}

/// Returns a cached crumb if it is still fresh, otherwise refreshes it.
/// `force` discards whatever is cached (used after a 401/403).
async fn yahoo_crumb(client: &reqwest::Client, force: bool) -> Result<String, String> {
  let mut guard = crumb_cache().lock().await;
  if !force {
    if let Some(c) = guard.as_ref() {
      if c.fetched_at.elapsed() < CRUMB_TTL {
        return Ok(c.crumb.clone());
      }
    }
  }
  let crumb = fetch_fresh_crumb(client).await?;
  *guard = Some(CrumbCache {
    crumb: crumb.clone(),
    fetched_at: Instant::now(),
  });
  Ok(crumb)
}

async fn request_with_crumb(
  client: &reqwest::Client,
  path: &str,
  crumb: &str,
) -> Result<(u16, String), String> {
  let encoded_crumb = urlencoding::encode(crumb);
  let url = if path.contains('?') {
    format!("https://query2.finance.yahoo.com/{path}&crumb={encoded_crumb}")
  } else {
    format!("https://query2.finance.yahoo.com/{path}?crumb={encoded_crumb}")
  };

  let response = client
    .get(&url)
    .headers(common_headers())
    .send()
    .await
    .map_err(|e| format!("Yahoo API request failed: {e}"))?;

  let status = response.status().as_u16();
  let body = response
    .text()
    .await
    .map_err(|e| format!("Yahoo API body read failed: {e}"))?;

  Ok((status, body))
}

/// `path` is the part after `https://query2.finance.yahoo.com/` (e.g. `v10/finance/quoteSummary/AAPL?modules=price`).
#[tauri::command]
pub async fn fetch_yahoo(path: String) -> Result<(u16, String), String> {
  validate_path(&path)?;
  let path = path.trim();
  let client = http_client();

  let crumb = yahoo_crumb(client, false).await?;
  let (status, body) = request_with_crumb(client, path, &crumb).await?;

  // An expired session comes back as 401/403. Refresh the crumb once and retry.
  if status == 401 || status == 403 {
    let crumb = yahoo_crumb(client, true).await?;
    return request_with_crumb(client, path, &crumb).await;
  }

  Ok((status, body))
}

#[cfg(test)]
mod tests {
  use super::validate_path;

  #[test]
  fn accepts_known_endpoints() {
    assert!(validate_path("v10/finance/quoteSummary/AAPL?modules=price").is_ok());
    assert!(validate_path("v8/finance/chart/VOD.L?interval=1d&range=1y").is_ok());
    assert!(validate_path("v1/finance/search?q=apple&quotesCount=0&newsCount=30").is_ok());
  }

  #[test]
  fn rejects_everything_else() {
    for bad in [
      "",
      "https://evil.example/x",
      "//evil.example/x",
      "/v10/finance/quoteSummary/AAPL",
      "v10/finance/../../x",
      "v10/finance/quoteSummary/AAPL#frag",
      "v10\\finance\\x",
      "v10/other/x",
      "finance/v10/x",
      "vX/finance/x",
      "v10/finance/quote Summary",
    ] {
      assert!(validate_path(bad).is_err(), "should reject {bad:?}");
    }
  }
}
