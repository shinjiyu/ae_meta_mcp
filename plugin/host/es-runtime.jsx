// ExtendScript runtime prelude prepended to every ae_exec script.
// After Effects' ES3 engine has NO native JSON object, so we polyfill
// JSON.stringify (enough to serialize plain objects/arrays/primitives).
if (typeof JSON === 'undefined') { JSON = {}; }
if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (obj) {
    var esc = function (s) {
      s = String(s);
      var out = '';
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        var code = s.charCodeAt(i);
        if (c === '\\') { out += '\\\\'; }
        else if (c === '"') { out += '\\"'; }
        else if (code === 8) { out += '\\b'; }
        else if (code === 9) { out += '\\t'; }
        else if (code === 10) { out += '\\n'; }
        else if (code === 12) { out += '\\f'; }
        else if (code === 13) { out += '\\r'; }
        else if (code < 32) {
          var h = code.toString(16);
          out += '\\u' + '0000'.substring(h.length) + h;
        } else { out += c; }
      }
      return '"' + out + '"';
    };
    var ser = function (v) {
      if (v === null) { return 'null'; }
      var t = typeof v;
      if (t === 'number') { return isFinite(v) ? String(v) : 'null'; }
      if (t === 'boolean') { return String(v); }
      if (t === 'string') { return esc(v); }
      if (t === 'undefined' || t === 'function') { return undefined; }
      if (v instanceof Array) {
        var a = [];
        for (var i = 0; i < v.length; i++) {
          var e = ser(v[i]);
          a.push(e === undefined ? 'null' : e);
        }
        return '[' + a.join(',') + ']';
      }
      var p = [];
      for (var k in v) {
        if (v.hasOwnProperty(k)) {
          var val = ser(v[k]);
          if (val !== undefined) { p.push(esc(k) + ':' + val); }
        }
      }
      return '{' + p.join(',') + '}';
    };
    return ser(obj);
  };
}
