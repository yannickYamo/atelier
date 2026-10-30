The browser blocks the call because the API sends no `Access-Control-Allow-Origin` header for your origin.

1. On the API, allow `http://localhost:5173` in the CORS config.
2. Restart the API.
3. Reload the page and check the response headers in the Network tab.

Next: paste the response headers if the error stays.
