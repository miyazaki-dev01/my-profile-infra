function handler(event) {
  var req = event.request;
  var uri = req.uri || "/";

  // ディレクトリ末尾は index.html に書き換え（/docs/ → /docs/index.html）
  if (uri.endsWith("/")) {
    req.uri += "index.html";
    return req;
  }

  // 最終セグメントに拡張子がなければ .html を付与（/about → /about.html）
  var last = uri.substring(uri.lastIndexOf("/") + 1);
  if (last && last.indexOf(".") === -1) {
    req.uri += ".html";
  }

  return req;
}
