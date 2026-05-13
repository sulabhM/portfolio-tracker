//! Yahoo Finance authenticated fetch for the Tauri desktop app.
//! Seeds cookies, obtains a crumb, then requests `query2` paths used by the web client.

use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE};
use std::sync::OnceLock;

const YAHOO_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

fn http_client() -> &'static reqwest::Client {
  static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
  CLIENT.get_or_init(|| {
    reqwest::Client::builder()
      .cookie_store(true)
      .use_rustls_tls()
      .user_agent(YAHOO_UA)
      .build()
      .expect("reqwest client with cookies")
  })
}

fn common_headers() -> reqwest::header::HeaderMap {
  let mut h = reqwest::header::HeaderMap::new();
  h.insert(ACCEPT, "application/json, text/plain, */*".parse().unwrap());
  h.insert(ACCEPT_LANGUAGE, "en-US,en;q=0.9".parse().unwrap());
  h
}

fn validate_path(path: &str) -> Result<(), String> {
  let p = path.trim();
  if p.is_empty() {
    return Err("empty Yahoo path".into());
  }
  if p.contains("..") {
    return Err("invalid Yahoo path".into());
  }
  if p.starts_with("http://") || p.starts_with("https://") || p.starts_with("//") {
    return Err("invalid Yahoo path".into());
  }
  Ok(())
}

async fn yahoo_crumb(client: &reqwest::Client) -> Result<String, String> {
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
  if crumb.is_empty() {
    return Err("Yahoo returned an empty crumb".into());
  }
  Ok(crumb)
}

/// `path` is the part after `https://query2.finance.yahoo.com/` (e.g. `v10/finance/quoteSummary/AAPL?modules=price`).
#[tauri::command]
pub async fn fetch_yahoo(path: String) -> Result<(u16, String), String> {
  validate_path(&path)?;
  let client = http_client();
  let crumb = yahoo_crumb(client).await?;

  let encoded_crumb = urlencoding::encode(&crumb);
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
