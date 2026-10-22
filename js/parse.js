/* 字斟句酌 · token parser shared by the app and tools/validate.js
   "[晋|晋朝][*缘|沿着；顺着|k=1]溪行，" → tokens */
(function (root) {
  'use strict';
  var PUNCT = /[，。、；：？！“”‘’「」『』（）《》〈〉—…·\s,.;:?!"'()]/;
  function parseZh(str) {
    var out = [], i = 0, n = str.length;
    while (i < n) {
      var c = str[i];
      if (c === '[') {
        var j = str.indexOf(']', i);
        if (j < 0) throw new Error('unclosed [ at ' + i + ': ' + str.slice(i, i + 12));
        var inner = str.slice(i + 1, j);
        if (inner.indexOf('[') >= 0) throw new Error('nested [ near ' + str.slice(i, i + 12));
        var parts = inner.split('|');
        var w = parts[0], key = false;
        if (w[0] === '*') { key = true; w = w.slice(1); }
        if (!w) throw new Error('empty word at ' + i);
        var f = {};
        for (var p = 2; p < parts.length; p++) {
          var eq = parts[p].indexOf('=');
          if (eq < 1) throw new Error('bad field "' + parts[p] + '" in [' + inner + ']');
          f[parts[p].slice(0, eq).trim()] = parts[p].slice(eq + 1).trim();
        }
        out.push({ w: w, g: (parts[1] || '').trim(), key: key, f: f });
        i = j + 1;
      } else if (c === ']') {
        throw new Error('stray ] at ' + i);
      } else if (PUNCT.test(c)) {
        out.push({ w: c, punct: true }); i++;
      } else {
        var k = i;
        while (k < n && str[k] !== '[' && !PUNCT.test(str[k])) k++;
        out.push({ w: str.slice(i, k), g: '', bare: true, f: {} });
        i = k;
      }
    }
    return out;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseZh: parseZh, PUNCT: PUNCT };
  else root.ZZparse = parseZh;
})(this);
