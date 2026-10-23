// CloudFront Function (cloudfront-js-2.0), viewer-request. См. docs/adr/0003-edge-locale-detection.md
var SUPPORTED = ['en', 'ru'];
var DEFAULT = 'en';

function pickFromCookie(request) {
  var c = request.cookies && request.cookies.lang;
  var v = c && c.value;
  return SUPPORTED.indexOf(v) !== -1 ? v : null;
}

// Возвращает поддерживаемую локаль с наивысшим q (при равенстве — первая в заголовке) или null.
function pickFromAcceptLanguage(request) {
  var h = request.headers && request.headers['accept-language'];
  if (!h || !h.value) return null;
  var parts = h.value.split(',');
  var best = null;
  var bestQ = 0;
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].split(';');
    var tag = seg[0].trim().toLowerCase();
    if (!tag) continue;
    var q = 1;
    for (var j = 1; j < seg.length; j++) {
      var p = seg[j].trim();
      if (p.slice(0, 2).toLowerCase() === 'q=') {
        q = parseFloat(p.slice(2));
        if (isNaN(q)) q = 0;
      }
    }
    var lang = tag.split('-')[0];
    if (q > bestQ && SUPPORTED.indexOf(lang) !== -1) {
      best = lang;
      bestQ = q;
    }
  }
  return best;
}

function buildQuery(qs) {
  var out = [];
  for (var key in qs) {
    var item = qs[key];
    if (item.multiValue && item.multiValue.length) {
      for (var i = 0; i < item.multiValue.length; i++) {
        out.push(key + '=' + item.multiValue[i].value);
      }
    } else {
      out.push(key + '=' + item.value);
    }
  }
  return out.length ? '?' + out.join('&') : '';
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === '/') {
    var lang = pickFromCookie(request) || pickFromAcceptLanguage(request) || DEFAULT;
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        location: { value: '/' + lang + '/' + buildQuery(request.querystring || {}) },
        'cache-control': { value: 'no-store' }
      }
    };
  }

  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else if (uri.substring(uri.lastIndexOf('/') + 1).indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
