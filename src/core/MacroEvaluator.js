// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var util = require("./../base/util");
var klass = require("./../base/klass");
var devel = require("./../base/devel");
var T = require("./../base/Template");
var Node = require("./Node");
var Environment = require("./Environment");
var CompilerMessage = require("./CompilerMessage");
var NodeMatcherDSL = require("./NodeMatcherDSL");

var o = NodeMatcherDSL.o
  , N = NodeMatcherDSL.N
  , Symbol = NodeMatcherDSL.Symbol
  , SymbolButNot = NodeMatcherDSL.SymbolButNot;

////////////////////////////////////////////////////

var macro_special_form_handlers = {};

function macro_special_form(name, spec, handler, before, after) {
  var matcher = NodeMatcherDSL.makeMatcher(spec);
  function special_op_impl(node, env, comp) {
    var arg = matcher(node);
    if (arg.fail) {
      var loc = arg.node || node;
      this.onerror_(CompilerMessage.Error.invalidSpecialForm(loc, node[0].val));
      return undefined;
    }
    if (before)
      before.call(this, arg.value, node, env, comp);
    try {
      var ret = handler.call(this, arg.value, node, env, comp);
    } finally {
      if (after)
        after.call(this, arg.value, node, env, comp);
    }
    return ret;
  }
  util.a_of(name).forEach(function (name) {
    macro_special_form_handlers[name] = special_op_impl;
  });
};

////////////////////////////////////////////////////

macro_special_form("%macroexpand-1",
  [ "%macroexpand-1", o("expr") ],
  function (arg, node, env, comp) {
    var en = this.expandOnce_(arg.expr, env);
    var expansion = [Node.makeSymbol("<<quote>>", arg.expr), en[1]];
    var head = Node.makeSymbol("<<array>>", node);
    return Node.makeArray([head, expansion, en[0]], node);
  }
);

macro_special_form("%macroexpand",
  [ "%macroexpand", o("expr") ],
  function (arg, node, env, comp) {
    var en = this.expandAll_(arg.expr, env);
    var expansion = [Node.makeSymbol("<<quote>>", arg.expr), en[1]];
    var head = Node.makeSymbol("<<array>>", node);
    return Node.makeArray([head, expansion, en[0]], node);
  }
);

macro_special_form("meta-do",
  [ "meta-do", o("expr") ],
  function (arg, node, env, comp) {
    var code = comp.compileNode(arg.expr, env);
    if (code === undefined)
      return undefined;
    this.onerror_(CompilerMessage.Info.metaDoCode(node, code));
    try {
      var obtained = env.compileTimeEval('"use strict";' + code);
      return this.expand_(obtained, env, comp);
    } catch (e) {
      if (e instanceof Environment.EvalError) {
        var err = CompilerMessage.Error.exceptionThrownIn("meta-do", node, e.originalException, e.evaluatedCode);
        this.onerror_(err);
        return undefined;
      }
      throw e;
    }
  }
);

macro_special_form("meta",
  [ "meta", o("expr") ],
  function (arg, node, env, comp) {
    var code = comp.compileNode(arg.expr, env);
    if (code === undefined)
      return;
    this.onerror_(CompilerMessage.Info.metaCode(node, code));
    env.addCompileTimeCode(code);
  }
);

macro_special_form(["macro", "symbol-macro"],
  [
    o("head"),
    o("name", Symbol),
    o("args", [0, 1],
      // Unary: just a symbol. May come along with a default value.
      o("name", Symbol),
      ["=", o("name", Symbol), o("defaultValue")],

      // N-ary: a list or tuple of symbols.
      [
        o([0, 1], "<<tuple>>"),  // accepts both a tuple and a list
        o("list", [0, N],
            o("name", SymbolButNot("->")),
            ["=", o("name", Symbol), o("defaultValue")])
      ]),

    o([
        "->",
        o("body", [0, N])
      ])
  ],
  function (arg, node, env, comp) {
    var args = arg.args ? (arg.args.list || [arg.args]) : [];
    if (arg.head.val === "symbol-macro" && args.length > 0)
      this.onerror_(CompilerMessage.Error.tooManyArg(arg.head, "symbol-macro", 0, args.length));
    var macdef = node.slice(2);
    macdef.unshift(Node.makeSymbol("<<macro-definition>>", arg.name));
    var macdef_node = Node.makeArray(macdef, arg.name);

    var code = comp.compileNode(macdef_node, env);
    if (code !== undefined)
      this.onerror_(CompilerMessage.Info.macroDef(node, arg.head.val, arg.name.val, code));

    if (code === undefined) {
      // More than one errors occurred. Use dummy code to contiue.
      code = "(function () {})";
    }

    try {
      var fun = env.compileTimeEval(code);
    } catch (e) {
      if (e instanceof Environment.EvalError) {
        var err = CompilerMessage.Error.exceptionThrownIn(arg.head.val, node, e.originalException, e.evaluatedCode);
        this.onerror_(err);
        return;
      }
      throw e;
    }

    if (arg.head.val === "symbol-macro")
      env.registerSymbolMacro(arg.name.val, fun);
    else
      env.registerMacro(arg.name.val, fun);
  }
);

macro_special_form("<<quote>>",
  [ "<<quote>>", o("value") ],
  function (arg, node, env, comp) { return node; }
);

macro_special_form("<<quasiquote>>",
  [ "<<quasiquote>>", o("value") ],
  function (arg, node, env, comp) {
    var self = this;

    function expand_quasiquoted(node, nest, env, comp) {
      if (!Node.isType(node, "ARRAY"))
        return node;

      var a = node.map(function (ch) {
        if (Node.isArrayWithHead(ch, "<<quasiquote>>")) {
          return expand_quasiquoted(ch, nest + 1, env, comp);
        } else if (Node.isArrayWithHead(ch, "<<unquote>>") ||
            Node.isArrayWithHead(ch, "<<unquote-splicing>>")) {
          if (nest === 0) {
            return self.expand_(ch, env, comp);
          } else {
            return expand_quasiquoted(ch, nest - 1, env, comp);
          }
        } else {
          return expand_quasiquoted(ch, nest, env, comp);
        }
      });
      return Node.makeArray(a, node);
    }

    return expand_quasiquoted(node, 0, env, comp);
  }
);

var enter_scope = function (arg, node, env, comp) {
  env.enterScope()
};

var leave_scope = function (arg, node, env, comp) {
  try {
    env.leaveScope();
  } catch (e) {
    if (e instanceof Environment.EvalError) {
      var err = CompilerMessage.Error.exceptionThrownIn("evaluating `meta'", node, e.originalException, e.evaluatedCode);
      this.onerror_(err);
      return;
    }
    throw e;
  }
};

macro_special_form("#",
  [
    o("head"),
    o("args", [0, 1],
      // Unary: just a symbol. May come along with a default value.
      o("name", SymbolButNot("->")),
      ["=", o("name", Symbol), o("defaultValue")],

      // N-ary: a list or tuple of symbols.
      [
        o([0, 1], "<<tuple>>"),  // accepts both a tuple and a list
        o("list", [0, N],
            o("name", SymbolButNot("->")),
            ["=", o("name", Symbol), o("defaultValue")])
      ]),
    o([
        "->",
        o("body", [0, N])
      ])
  ],
  function (arg, node, env, comp) {
    var self = this;
    return Node.normalize(node.map(function (ch) { return self.expand_(ch, env, comp); }));
  },
  enter_scope,
  leave_scope
);

macro_special_form("macro-scope",
  [
    "macro-scope",
    o("expr")
  ],
  function (arg, node, env, comp) {
    return Node.normalize(this.expand_(arg.expr, env, comp));
  },
  enter_scope,
  leave_scope
);

////////////////////////////////////////////////////

var NodeUtil = require("../../test/testutil.js").NodeUtil;

var MacroEvaluator = klass({

  initialize: function (onerror) {
    this.onerror_ = onerror;
  },

  expandMacro_: function (node, env) {
    if (node.length == 0 || node[0].nodetype != "SYMBOL")
      return [false, node];
    var head = node[0].val;

    var macs = env.allMacrosFor(head);
    if (macs.length === 0)
      return [false, node];
    for (var i = macs.length - 1; i >= 0; --i) {
      try {
        var ret = macs[i].apply(env.macroExpandEnv(), node.slice(1));
      } catch (e) {
        if ((e instanceof Environment.ExpansionFailure) && (i > 0)) {
          continue;
        } else {
          var cerr = CompilerMessage.Error.exceptionThrownIn(T("expanding the macro `###'", head), node, e);
          this.onerror_(cerr);
          throw e;
        }
      }
      break;
    }

    // TOTHINK Should we notify the result by CompilerMessage.Info?
    //console.log("EXPANDED: (" + head + ") " + JSON.stringify(ret));
    //console.log("EXPANDED: (" + head + ") " + NodeUtil.debugStringify(ret));

    return [true, Node.normalize(ret)];
  },

  expandSymbolMacro_: function (node, env) {
    if (node.nodetype != "SYMBOL")
      return [false, node];

    var macs = env.allSymbolMacrosFor(node.val);
    if (macs.length === 0)
      return [false, node];

    for (var i = macs.length - 1; i >= 0; --i) {
      try {
        var ret = macs[i].apply(env.macroExpandEnv());
      } catch (e) {
        if ((e instanceof Environment.ExpansionFailure) && (i > 0)) {
          continue;
        } else {
          var cerr = CompilerMessage.Error.exceptionThrownIn(T("expanding the symbol-macro `###'", node.val), node, e);
          this.onerror_(cerr);
          throw e;
        }
      }
      break;
    }

    // TOTHINK Should we notify the result by CompilerMessage.Info?
    //console.log("SMEXPANDED: (" + node.val + ") " + JSON.stringify(ret));

    return [true, Node.normalize(ret)];
  },

  expandOnce_: function (node, env) {

    // May be undefned if the form is processed by MacroEvaluator (i.e. macro, meta, etc.)
    if (node === undefined)
      return [false, node];

    switch (node.nodetype) {
    case "ARRAY":
      return this.expandMacro_(node, env);
    case "SYMBOL":
      return this.expandSymbolMacro_(node, env);
    default:
      return [false, node];
    }
  },

  expandAll_: function (node, env) {
    var next = this.expandOnce_(node, env);
    if (!next[0])
      return next;
    while (next[0])
      next = this.expandOnce_(next[1], env);
    return next;
  },

  expand_: function (node, env, comp) {
    var self = this;
    node = this.expandAll_(node, env)[1];  // Don't care [0] (expanded or not).

    if (!node || !Node.isType(node, "ARRAY") || (node.length === 0))
      return node;

    var head = node[0];
    if (Node.isType(head, "SYMBOL") && head.val in macro_special_form_handlers) {
      return macro_special_form_handlers[head.val].call(this, node, env, comp);
    } else {
      var mapped = node.map(function (ch) { return self.expand_(ch, env, comp); });
      return Node.normalize(Node.makeArray(mapped, node));
    }
  },

  macroEvaluate: function (nodes, env, comp) {
    var self = this;
    env.enterScope();
    try {
      return nodes.map(function (n) { return self.expand_(n, env, comp); });
    } finally {
      try {
        env.leaveScope();
      } catch (e) {
        if (e instanceof Environment.EvalError) {
          var err = CompilerMessage.Error.exceptionThrownIn("evaluating `meta'", {}, e.originalException, e.evaluatedCode);
          this.onerror_(err);
          return [];
        }
        throw e;
      }
    }
  },

});

module.exports = MacroEvaluator;

