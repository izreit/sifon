// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var devel = {
  debugger_filter: undefined,

  dthrow: function (e) {
    var filter = devel.debugger_filter;
    if (!filter || filter("dthrow", e)) 
      debugger;
    throw e;
  },

  notImplemented: function (s) {
    debugger;
    console.trace && console.trace();
    throw "devel.notImplemented" + (s ? (": " + s) : "");
  },

  neverReach: function (s) {
    debugger;
    throw "devel.neverReach" + (s ? (": " + s) : "");
  },

  pureVirtual: function (s) {
    debugger;
    throw "devel.pureVirtual" + (s ? (": " + s) : "");
  },

  assert: function (expr, msg) {
    if (typeof assert === "function") {
      assert(expr, msg);
    } else if (!expr) {
      console.trace && console.trace();
      debugger;
      //throw "devel.assert " + (msg || "");
    }
  },
};

module.exports = devel;

