// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var util = require("../src/base/util");
var Node = require("../src/core/Node");

// General
// -------

var detectObjectDifference = function (a, b) {
  var r;

  if (a === b)
    return "";

  if (a === null)
    return "NullAndNonNull " + (typeof b);
  if (b === null)
    return "NonNullAndNull " + (typeof a);
  if (typeof a != typeof b)
    return "TypeMismatch " + (typeof a) + " and " + (typeof b);
  if (a instanceof Array && b instanceof Array) {
    if (a.length != b.length)
      return "Length " + a.length + " " + b.length;
    for (var i = 0; i < a.length; ++i) {
      r = detectObjectDifference(a[i], b[i]);
      if (r != "")
        return "Elem:" + i + " (" + r + ")";
    }
    return "";
  }
  if (typeof a == "object" && typeof b == "object") {
    for (var p in a) {
      if (!a.hasOwnProperty(p)) continue;
      if (!b.hasOwnProperty(p))
        return "HaveAndNotHave:" + p;
      r = detectObjectDifference(a[p], b[p]);
      if (r != "") {
        return "Prop:" + p + " (" + r + ")";
      }
    }
    for (var p in b) {
      if (!b.hasOwnProperty(p)) continue;
      if (!a.hasOwnProperty(p))
        return "NotHaveAndHave:" + p;
    }
    return "";
  }
  return "PrimMismatch " + a + " and " + b;
}

// Logging wrapper for debug...
var DEBUG = false;
detectObjectDifference = !DEBUG ? detectObjectDifference : (function () {
  var indent = 0;
  var original = detectObjectDifference;

  return function (a, b) {
    console.log(util.spacer(indent) + "a: " + JSON.stringify(a));
    console.log(util.spacer(indent) + "b: " + JSON.stringify(b));
    indent += 2;
    var r = original.apply(this, arguments);
    indent -= 2;
    return r;
  };
})();

module.exports.detectObjectDifference = detectObjectDifference;

// Node
// ----

function sym(name) {
  return { ident: name };
}

function quote(a) {
  return [sym("<<quote>>"), a];
}

function unquote(a) {
  return [sym("<<unquote>>"), a];
}

function unquote_s(a) {
  return [sym("<<unquote>>"), a];
}

function dot(a, b) {
  return [sym("<<dot>>"), a, b];
}

function makePseudoNode(model) {
  try {
    if (model instanceof Array) {
      return Node.makeArray(model.map(makePseudoNode));
    } else if (typeof model === "object" && model && model.ident) {
      return Node.makeSymbol(model.ident);
    } else if (typeof model === "number") {
      return Node.makeNum(model);
    } else if (typeof model === "string") {
      return Node.makeStr(model);
    } else {
      devel.dthrow("Unknown arg for NodeUtil.makePseudoNode(): " + JSON.stringify(model));
    }
  } catch (e) {
    console.log("caught in NodeUtil.makePseudoNode(): " + JSON.stringify(model));
    throw e;
  }
}

function detectNodeDifference(a, b) {
  if (a === undefined && b === undefined)
    return "BothUndefined";
  if ((!a && b) || (a && !b))
    return "UndefinedAndNot";
  if (a.nodetype != b.nodetype)
    return "TypeMismatch " + (a.nodetype + " and " + b.nodetype);
  switch (a.nodetype) {
  case "ARRAY":
    if (a.length != b.length)
      return "LengthMismatch " + (a.length + " and " + b.length);
    for (var i = 0; i < a.length; ++i) {
      var ret = detectNodeDifference(a[i], b[i]);
      if (ret !== true)
        return "ElemMismatch(" + i + "):" + ret;
    }
    return true;
  case "NUM":
    if (a.val !== b.val)
      return "PrimitiveMismatch " + a.nodetype + " " + (a.val + " and " + b.val);
  case "SYMBOL":
  case "STR":
    if (a.val != b.val)
      return "PrimitiveMismatch " + a.nodetype + " " + (a.val + " and " + b.val);
    return true;
  default:
    devel.dthrow("unknown nodetype in NodeUtil.detectNodeDifference().");
    return "UnknownType";
  }
}

function debugNodeStringify(node) {
  function filter(node) {
    if (!node) return node;

    delete node.toktype;
    delete node.line;
    delete node.col;

    delete node.array_opener;

    switch (node.nodetype) {
    case "SYMBOL":
      return "'" + node.val;
    case "NUM":
      return Number(node.val);
    case "STR":
      return node.val;
    default:
      break;
    }

    if (node instanceof Array)
      return node.map(filter);

    return node;
  }

  return JSON.stringify(filter(node));
}

module.exports.NodeUtil = {
  sym: sym,
  quote: quote,
  unquote: unquote,
  unquote_s: unquote_s,
  dot: dot,
  makePseudoNode: makePseudoNode,
  detectNodeDifference: detectNodeDifference,
  debugStringify: debugNodeStringify,
};


