// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var devel = require("./devel");

var util = {

  // Array/Object Manipulation Utilities
  // -----------------------------------

  a_of: function (x) {
    return (x === undefined || x === null) ? []
         : (x instanceof Array) ? x
         : (typeof x == "object" && typeof x.length == "number") ? Array.prototype.slice.call(x)
         : [x];
  },

  dictionarize: function (a, valuegen) {
    var o = {}, len = a.length, v, i;

    if (!valuegen) {
      for (i = 0; i < len; ++i)
        o[a[i]] = true;
    } else {
      for (i = 0; i < len; ++i) {
        v = a[i];
        o[v] = valuegen(v);
      }
    }
    return o;
  },

  count: function (xs, pred) {
    return (typeof pred === "function")
              ? xs.reduce(function (acc, x) { return pred(x) ? acc + 1 : acc; }, 0)
              : xs.reduce(function (acc, x) { return (x === pred) ? acc + 1 : acc; }, 0);
  },
  partition: function (xs, pred) {
    var ret = [[], []];
    for (var i = 0, len = xs.length; i < len; ++i)
      ret[Number(!pred(xs[i]))].push(xs[i]);
    return ret;
  },

  unzipMapped: function (xs, f) {
    var len = xs.length;
    var ys = new Array(len), zs = new Array(len);
    for (var i = 0; i < len; ++i) {
      var yz = f(xs[i]);
      ys[i] = yz[0];
      zs[i] = yz[1];
    }
    return [ys, zs];
  },

  forEach: function (o, f) {
    if (o instanceof Array) {
      o.forEach(f);
    } else {
      for (var p in o) {
        if (o.hasOwnProperty(p))
          f(o[p], p, o);
      }
    }
  },
  map: function (o, f) {
    if (o instanceof Array) {
      return o.map(f);
    } else {
      var oo = {};
      for (var p in o) {
        if (o.hasOwnProperty(p))
          oo[p] = f(o[p], p, o);
      }
      return oo;
    }
  },
  overwrite: function (a, b) {
    util.forEach(b, function (v, p) {
      a[p] = v;
    });
    return a;
  },

  filterWithIndices: function (xs, pred, from) {
    from || (from = 0);
    var ret = [];
    for (var i = from, len = xs.length; i < len; ++i) {
      var x = xs[i];
      if (pred(x))
        ret.push({ index: i, value: x });
    }
    return ret;
  },

  /*
  // OBSOLETE ONES: will be removed.

  concat: function (a, b) {
    Array.prototype.push.apply(a, b);
    return a;
  },
  reverse: function (a) {
    var b = [];
    b.length = a.length;
    for (var i = b.length - 1, j = 0; i >= 0; --i, ++j)
      b[i] = a[j];
    return b;
  },
  indexOf: function (a, from, f) {
    for (var i = (from || 0); i < a.length; ++i)
      if (f(a[i])) return i;
    return -1;
  },
  flatten: function (xxs) {
    return xxs.reduce(function (acc, xs) { return acc.concat(xs); });
  },
  unzip: function (xys) {
    var len = xys.length;
    var xs = new Array(len), ys = new Array(len);
    for (var i = 0; i < len; ++i) {
      var xy = xys[i];
      xs[i] = xy[0];
      ys[i] = xy[1];
    }
    return [xs, ys];
  },
  */

  // String Utilities
  // ----------------

  stringIsUPPERCASE: function (s) {
    var m = s.match(/([A-Z_][A-Z0-9_]+)/);
    return m && s === m[0];
  },

  escapeString: function (s) {
    return s.replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
  },
  literalizeString: function (s) {
    return '"' + util.escapeString("" + s) + '"';
  },

  spacer: (function () {
    //*
    var indent_string = "                ";
    /*/
    var indent_string = "----------------";
    //*/
    return function spacer(n) {
      if (n > 65535 || n < 0)   // Ugh! A magic number!
        devel.dthrow("util.spacer: Invalid Argument " + n);
      while (indent_string.length < n)
        indent_string += indent_string;
      return indent_string.substr(0, n);
    };
  })(),

};

module.exports = util;

