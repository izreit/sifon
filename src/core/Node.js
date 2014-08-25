// vim: set ts=2 sts=2 sw=2 et si:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var devel = require("./../base/devel");
var util = require("./../base/util");
var Template = require("./../base/Template");
var Token = require("./Token");
var CompilerMessage = require("./CompilerMessage");

//  Node is not a klass, just an alias for objects
//  that satisfy the following conditions:
//   - have a "nodetype" property
//   - have a "val" property unless its nodetype is "ARRAY",
//     which its child nodes are accessible by index (just like an array).
//   - have a "line" and a "col" property optionally.
//
//  Since they have several common properties, we use Token as Node by
//  assigning "nodetype" property to a Token.  This is an intentional
//  destructive approach to reduce object creation.  (Actually, it is
//  unclear whether or not this approach affects to the performance.
//  But still, we cannot introduce an independent class for Node because
//  ARRAY type node must be implemented by Array.)

var JS_NULL_LITERAL = [ "null" ];
var JS_BOOLEAN_LITERAL = [ "true", "false" ];

var JS_KEYWORD = [
  "break", "do", "instanceof", "typeof", "case",
  "else", "new", "var", "catch", "finally", "return",
  "void", "continue", "for", "switch", "while", "debugger",
  "function", "this", "with", "default", "if", "throw",
  "delete", "in", "try",
];

var JS_FUTURE_RESERVED_WORD = [
  "class", "enum", "extends", "super", "const", "export", "import",
];

var JS_GLOBAL_OBJECT_MEMBERS = [
  "NaN", "Infinity", "undefined", "eval",
];

var JS_RESERVED_MAP = (function () {
  var ret = {};
  var registerer = function (v) { ret[v] = true };
  JS_NULL_LITERAL.forEach(registerer);
  JS_BOOLEAN_LITERAL.forEach(registerer);
  JS_KEYWORD.forEach(registerer);
  JS_FUTURE_RESERVED_WORD.forEach(registerer);
  JS_GLOBAL_OBJECT_MEMBERS.forEach(registerer);
  return ret;
})();

var JS_VALUE_IDENTIFIERS = (function () {
  var ret = {};
  var names = [ "null", "true", "false", "this", "NaN", "Infinity", "undefined" ];
  names.forEach(function (v) { ret[v] = true; });
  return ret;
})();

var Node = {

  nodify: function (v, nt, l, c, fn) {
    if (typeof l === "object" && l !== null) {
      fn = l.filename;
      c = l.col;
      l = l.line;
    }
    (l === undefined) && (l = -1);
    (c === undefined) && (c = -1);
    v.nodetype = nt;
    v.line = l;
    v.col = c;
    if (fn)
      v.filename = fn;
    return v;
  },

  fromToken: function (tok) {
    tok.setNodeType(tok.toktype);
    return tok;
  },

  symbolFromToken: function (tok) {
    tok.setNodeType("SYMBOL");
    tok.toString = function () { return this.val; };
    return tok;
  },

  makeSymbol: function (name, l, c, fn) {
    var o = { val: name, toString: function () { return this.val; } };
    return Node.nodify(o, "SYMBOL", l, c, fn);
  },

  makeArray: function (a, l, c, fn) {
    return Node.nodify(a, "ARRAY", l, c, fn);
  },

  makeNum: function (v, l, c, fn) {
    return Node.nodify({ val: "" + v }, "NUM", l, c, fn);
  },
  makeNumFromLiteralized: function (v, l, c, fn) {
    return Node.nodify({ val: v }, "NUM", l, c, fn);
  },

  makeStr: function (v, l, c, fn) {
    return Node.nodify({ val: util.literalizeString(v) }, "STR", l, c, fn);
  },
  makeStrFromLiteralized: function (v, l, c, fn) {
    return Node.nodify({ val: v }, "STR", l, c, fn);
  },

  // ------------------

  toSource: function (n, onerror) {
    switch (n.nodetype) {
    case "SYMBOL":
      Node.confirmIsJSIdentifier(n, onerror);
      return n.val;
    case "NUM": case "STR":
      return n.val;
    case "REGEXP":
      return "/" + n.val.body + "/" + n.val.flags;
    default:
      devel.dthrow("LogicError: Node.toSource() on " + n.nodetype + ".");
    }
  },

  // ------------------

  normalize: function rec(node) {
    if (node instanceof Array) {
      var a = node.map(rec).filter(function (x) { return x !== undefined });
      return Node.makeArray(a, node);
    } else if (typeof node === "string") {
      return Node.makeStr(node);
    } else if (typeof node === "number") {
      return Node.makeNum(node);
    } else if (typeof node === "boolean") {
      return Node.makeSymbol("" + node);
    } else {
      return node;
    }
  },

  // ------------------

  isNode: function (node) {
    return (!!node.nodetype && ("val" in node));
  },

  is: function (node, type, val) {
    return (node.nodetype === type && node.val === val);
  },

  isType: function (node, type) {
    return (node.nodetype === type);
  },

  isLiteral: function (node) {
    return Node.isType(node, "STR") || Node.isType(node, "NUM")
        || (Node.isType(node, "SYMBOL") && JS_VALUE_IDENTIFIERS.hasOwnProperty(node.val));
  },

  isArrayWithHead: function (node, head_sym_name) {
    return Node.isType(node, "ARRAY") && node[0] && Node.is(node[0], "SYMBOL", head_sym_name);
  },

  symbolIsJSIdentifier: function (node) {
    return node.val.search(/[^a-zA-Z0-9_$]/) == -1 && node.val.search(/[0-9]/) != 0;
  },

  symbolIsValidJSVarName: function (node) {
    return !JS_RESERVED_MAP.hasOwnProperty(node.val) && Node.symbolIsJSIdentifier(node);
  },

  symbolIsDotAccessible: function (node) {
    return !(JS_RESERVED_MAP.hasOwnProperty(node.val) &&
             !JS_VALUE_IDENTIFIERS.hasOwnProperty(node.val)) && 
           Node.symbolIsJSIdentifier(node);
  },

  symbolIsThreeDotted: function (node) {
    return !!node.val.match(/^\.\.\./);
  },

  isJSIdentifierSymbol: function (node) {
    return Node.isType(node, "SYMBOL") && Node.symbolIsJSIdentifier(node);
  },

  isValidJSVarNameSymbol: function (node) {
    return Node.isType(node, "SYMBOL") && Node.symbolIsValidJSVarName(node);
  },

  isJSIdentifierDotAccessible: function (node) {
    return Node.isType(node, "SYMBOL") && Node.symbolIsDotAccessible(node);
  },

  isSymbolThreeDotted: function (node) {
    return Node.isType(node, "SYMBOL") && Node.symbolIsThreeDotted(node);
  },

  symbolStrippedThreeDots: function (node) {
    if (Node.isSymbolThreeDotted(node)) {
      return Node.makeSymbol(node.val.match(/^\.\.\.(.*)/)[1], node);
    } else {
      return node;
    }
  },

  toPropertyName: function (node) {
    switch (node.nodetype) {
    case "SYMBOL":
      return Node.symbolIsValidJSVarName(node) ? node.val : util.literalizeString(node.val);
    case "NUM": case "STR":
      return node.val;
    default:
      throw CompilerMessage.Error.unexpected(node, node.nodetype, "", "A property name is expected.");
    }
  },

  toInLeftArgument: function (node) {
    switch (node.nodetype) {
    case "SYMBOL":
      return Node.makeStr(node.val, node);
    case "NUM": case "STR":
      return Node.makeStrFromLiteralized(node.val, node);
    default:
      throw CompilerMessage.Error.unexpected(node, node.nodetype, "", "A property name is expected.");
    }
  },

  confirmType: function (node, name, type, onerror) {
    var msg;
    var matched = util.a_of(type).some(function (ty) {
      return Node.isType(node, ty);
    });
    if (!matched) {
      msg = (type instanceof Array)
               ? Template("### must be one of ###.", name, JSON.stringify(type))
               : Template("### must be ###.", name, type)
      onerror(CompilerMessage.Error.unexpected(node, node.nodetype, "", msg));
    }
  },

  confirmIsValidJSVarName: function (node, onerror) {
    var loc = node;
    if (!node.nodetype || node.nodetype != "SYMBOL")
      onerror(CompilerMessage.Error.unexpected(loc, node.nodetype, "", "A symbol is expected."));
    if (!Node.symbolIsValidJSVarName(node))
      onerror(CompilerMessage.Error.invalidJSIdentifier(loc, node.val));
  },

  confirmIsJSIdentifier: function (node, onerror) {
    var loc = node;
    if (!node.nodetype || node.nodetype != "SYMBOL")
      onerror(CompilerMessage.Error.unexpected(loc, node.nodetype, "", "A symbol is expected."));
    if (!Node.symbolIsJSIdentifier(node))
      onerror(CompilerMessage.Error.invalidJSIdentifier(loc, node.val));
  },

  confirmArity: function (node, name, min, max, onerror) {
    if (node.nodetype !== "ARRAY")
      devel.dthrow("LogicError: Node.confirmLength() requires an ARRAY.");

    var arity = node.length - 1;
    if (arity < min)
      onerror(CompilerMessage.Error.tooFewArg(node, name, min, arity));
    if (max !== undefined && arity > max)
      onerror(CompilerMessage.Error.tooManyArg(node, name, max, arity));
  }

};

module.exports = Node;

