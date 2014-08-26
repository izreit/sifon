// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var util = require("./../base/util");
var klass = require("./../base/klass");
var devel = require("./../base/devel");
var Template = require("./../base/Template");
var Node = require("./Node");
var Environment = require("./Environment");
var JavaScriptAST = require("./JavaScriptAST");
var CompilerMessage = require("./CompilerMessage");
var NodeMatcherDSL = require("./NodeMatcherDSL");

var js = JavaScriptAST;
var o = NodeMatcherDSL.o
  , N = NodeMatcherDSL.N
  , Symbol = NodeMatcherDSL.Symbol
  , SymbolButNot = NodeMatcherDSL.SymbolButNot;

// Small utilities to use JavaScriptAST
// ------------------------------------

function makeIdentifier(n) {
  return js.Identifier(Node.makeSymbol(n));
}

function makeIdentifierName(n) {
  return js.IdentifierName(Node.makeSymbol(n));
}

function makeUndefined(env) {
  return env.isKnownVariable("undefined") ? js.Void(0) : makeIdentifier("undefined");
}

// Context
// -------

var Context = klass({

  initialize: function ctor(opt, apply) {
    if (!(this instanceof ctor))
      return new Context(opt, apply);
    this.opt_ = opt;
    this.apply_ = apply;
  },
  distributable: function () {
    return !!this.opt_.distributable;
  },
  ignorable: function () {
    return !!this.opt_.ignorable;
  },
  apply: function (pe) {
    return this.apply_(pe);
  },

  extractDistributable: function (env, symname, line, col, filename) {
    if (this.opt_.distributable) {
      return [this, new Context({}, function (pe) { return [pe[0], undefined]; })];
    } else {
      var assignee_node = env.uniqueSymbol(symname, line, col, filename);
      env.registerUnique(assignee_node);
      var ident_assignee = js.Identifier(assignee_node);
      return [
        AssignTo(ident_assignee),
        new Context({}, function (pe) { return [pe[0], ident_assignee]; })
      ];
    }
  },
});

var AsExpression = Context({}, function (pe) { return pe; });

var AsLeftHandSide = Context({}, function (pe) { return pe; });

var AsVariable = function (env, symname, line, col, filename) {
  return Context({}, function (pe) {
    // Already it is a variable.
    if (pe[1] instanceof js.Identifier)
      return pe;
    // Ad-hoc optimization: pick x from (x = ...)  (Ugh! dirty...)
    // TODO extend this to +=, -=, ...
    if (pe[1] instanceof js.Assign && pe[1].children_[0] instanceof js.Identifier)
      return [js.Statements(pe[0], pe[1]), pe[1].children_[0]];

    // Not a variable: generate a new symbol and assign the value to the symbol.
    var assignee_node = env.uniqueSymbol(symname, line, col, filename);
    env.registerUnique(assignee_node);
    var ident_assignee = js.Identifier(assignee_node);
    return [
      js.Statements(pe[0], js.Assign(ident_assignee, pe[1])),
      ident_assignee
    ];
  });
};

var Return = Context({ distributable: true }, function (pe) {
  if (pe[1] instanceof js.JumpStatement)
    return pe;
  return [pe[0], js.ReturnStatement(pe[1])];
});

var Throw = Context({ distributable: true }, function (pe) {
  if (pe[1] instanceof js.JumpStatement)
    return pe;
  // `makeUndefined(env)` is more preferable than `js.Void(0)`
  // but here we don't have `env`...
  return [pe[0], js.ThrowStatement(pe[1] || js.Void(0))];
});


var AssignTo = function (ident_ast, operator) {
  operator || (operator = js.Assign);
  return Context({ distributable: true }, function (pe) {
    devel.assert(!pe[1] || pe[1].prec !== undefined);
    return [pe[0], pe[1] && operator(ident_ast, pe[1])];
  });
};

var Ignore = function (env) {
  return Context({ distributable: true, ignorable: true }, function (pe) {
    var expr = pe[1];

    // Incomplete optimization...
    // This check does not detect several ignorable code (e.g. (3 * 5)), but
    // it's not critical since they are largery reducible (e.g. 15) by other
    // optimization techniques (i.e. constant propagation).
    function ident_or_lit(ast) {
      return ((ast instanceof js.Identifier &&
                 ast.children_[0] &&
                 (env.isKnownSymbol(ast.children_[0]) ||
                  Node.is(ast.children_[0], "SYMBOL", "undefined"))) ||
              (ast instanceof js.Literal) ||
              (ast instanceof js.Void &&
                 ast.children_[0] &&
                 ident_or_lit(ast.children_[0])));
    }
    if (ident_or_lit(expr) ||
        (expr instanceof js.ExpressionStatement &&
           expr.children_[0] &&
           ident_or_lit(expr.children_[0])))
      return [pe[0], undefined];

    //if ((expr instanceof js.Identifier) ||
    //    (expr instanceof js.Literal) ||
    //    (expr instanceof js.ExpressionStatement &&
    //      (expr.children_[0] instanceof js.Identifier ||
    //       expr.children_[0] instanceof js.Literal)))
    //  return [pe[0], undefined];

    // TODO Array/object literals may also be able to be ignored.
    //// TODO! Check Environment to confirm the identifier is local.
    //// Global variables, which may have getters, are not ignorable.

    return pe;
  });
};

// Special Form Handlers
// =====================

var special_form_handlers = {};
var special_symbol_handlers = {};

function special_form(name, spec, handler) {
  var matcher = NodeMatcherDSL.makeMatcher(spec);
  function special_op_impl(node, env, context) {
    var arg = matcher(node);
    if (arg.fail) {
      //console.log("SPOP-FAIL: " + JSON.stringify(arg));
      var loc = arg.node || node;
      this.onerror_(CompilerMessage.Error.invalidSpecialForm(loc, node[0].val));
      return [undefined, undefined];
    }
    return handler.call(this, arg.value, node, env, context);
  }
  util.a_of(name).forEach(function (name) {
    special_form_handlers[name] = special_op_impl;
  });
};

function special_symbol(name, handler) {
  special_symbol_handlers[name] = handler;
}


function asts_to_statements(asts) {
  var a = asts.filter(function (x) { return x; });
  return a.length > 0 ? js.Statements().setChildren(a) : undefined;
}

var make_filename_ast = function (compiletime_path) {
  return js.Literal(Node.makeStr(compiletime_path));
};

var make_symbol_func_ast = function (env, compiletime_path) {
  var v = makeIdentifier("v");
  var l = makeIdentifier("l");
  var c = makeIdentifier("c");
  var ctpath_sym = env.registerUtilValue("_compiletime_path", function () {
    return make_filename_ast(compiletime_path);
  });
  var tostring = js.FunctionExpression(undefined, js.FormalParameterList(),
                                       js.SourceElements(
                                         js.ReturnStatement(js.Dot(makeIdentifier("this"),
                                                                   makeIdentifierName("val")))));
  return js.FunctionExpression(
    undefined,
    js.FormalParameterList(v, l, c),
    js.SourceElements(
      js.ReturnStatement(
        js.ObjectLiteral(
          js.PropertyAssignment(Node.makeSymbol("nodetype"), "SYMBOL"),
          js.PropertyAssignment(Node.makeSymbol("line"), l),
          js.PropertyAssignment(Node.makeSymbol("col"), c),
          js.PropertyAssignment(Node.makeSymbol("val"), v),
          js.PropertyAssignment(Node.makeSymbol("toString"), tostring),
          js.PropertyAssignment(Node.makeSymbol("filename"), ctpath_sym)))));
};

var make_array_node_func_ast = function (env, compiletime_path) {
  var a = makeIdentifier("a");
  var l = makeIdentifier("l");
  var c = makeIdentifier("c");
  var ctpath_sym = env.registerUtilValue("_compiletime_path", function () {
    return make_filename_ast(compiletime_path);
  });
  return js.FunctionExpression(
    undefined,
    js.FormalParameterList(a, l, c),
    js.SourceElements(
      js.ReturnStatement(
        js.Comma_Multi(
          js.Assign(js.Dot(a, makeIdentifierName("nodetype")), "ARRAY"),
          js.Assign(js.Dot(a, makeIdentifierName("line")), l),
          js.Assign(js.Dot(a, makeIdentifierName("col")), c),
          js.Assign(js.Dot(a, makeIdentifierName("filename")), ctpath_sym),
          a))));
};

function generate_quoted(self, node, env) {
  var ast;
  if (Node.isType(node, "ARRAY")) {
    var quoted_children = node.map(function (ch) {
      return generate_quoted(self, ch, env);
    });

    var array_node_sym = env.registerUtilValue("__anode", function () {
      return make_array_node_func_ast(env, self.compiletime_path_);
    });
    ast = js.Call(
            array_node_sym,
            js.Arguments(
              js.ArrayLiteral().setChildren(quoted_children),
              node.line,
              node.col));
  } else if (Node.is(node, "SYMBOL", "true") || Node.is(node, "SYMBOL", "false")) {
    ast = js.Identifier(node);

  } else if (Node.isType(node, "SYMBOL")) {
    var symbol_sym = env.registerUtilValue("__sym", function () {
      return make_symbol_func_ast(env, self.compiletime_path_);
    });
    ast = js.Call(symbol_sym, js.Arguments(node.val, node.line, node.col));
  } else if (Node.isType(node, "STR") || Node.isType(node, "NUM")) {
    ast = js.Literal(node);
  } else {
    devel.neverReach();
  }
  return ast;
}

special_form("<<quote>>",
  [ "<<quote>>", o("value") ],
  function (arg, node, env, context) {
    return context.apply([
      undefined,
      generate_quoted(this, arg.value, env),
    ]);
  }
);

function generate_quasiquoted(self, nest, node, env, context) {
  var ast;
  if (Node.isType(node, "ARRAY")) {
    var array_node_sym = env.registerUtilValue("__anode", function () {
      return make_array_node_func_ast(env, self.compiletime_path_);
    });

    var be_declarative = (nest > 0);
    if (!be_declarative) {
      var num_unquote_splicing = util.count(node, function (ch) {
        return Node.isArrayWithHead(ch, "<<unquote-splicing>>");
      });
      be_declarative = (num_unquote_splicing === 0);
    }

    // If the sequence includes no expansion for unquote-splicing,
    // the JavaScript code generated here can be written in declarative style.
    if (be_declarative) {

      var pses = util.unzipMapped(node, function (ch) {
        if (Node.isArrayWithHead(ch, "<<unquote>>")) {
          Node.confirmArity(ch, '"," (<<unquote>>', 1, 1, self.onerror_);
          return (nest === 0)
                   ? self.generate_(ch[1], env, AsExpression)
                   : generate_quasiquoted(self, nest - 1, ch, env, AsExpression);
        } else if (Node.isArrayWithHead(ch, "<<unquote-splicing>>")) {
          Node.confirmArity(ch, '",@" (<<unquote-splicing>>)', 1, 1, self.onerror_);
          return generate_quasiquoted(self, nest - 1, ch, env, AsExpression);
        } else if (Node.isArrayWithHead(ch, "<<quasiquote>>")) {
          return generate_quasiquoted(self, nest + 1, ch, env, AsExpression);
        } else {
          return generate_quasiquoted(self, nest, ch, env, AsExpression);
        }
      });
      return context.apply([
        (pses[0].length > 0)
          ? js.Statements().setChildren(pses[0])
          : undefined,
        js.Call(
          array_node_sym,
          js.Arguments(
            js.ArrayLiteral().setChildren(pses[1]),
            node.line,
            node.col))
      ]);

    // When the sequence includes one or more unquote-splicing, it
    // causes one-many mapping... this means that the code generated
    // here can only be written in imperative style.  In other words,
    // the result value have to be constructed from an empty array.
    // For example, when the input has the following structure:
    //
    //     `(foo ,@x bar ,z)
    //
    // this clause generates the code something like:
    //
    //     var result = [];
    //     result.push( symbol("foo") );
    //     result.push.apply( result, x );
    //     result.push( symbol("bar") );
    //     result.push( z );
    //
    // Calling `result.push.apply` for `x` makes it impossible to write
    // this in declarative style.
    // (Note for nitpickers: this observation is not necessarily correct,
    // especially if we have a utility function that performs one-many
    // mapping.  But we don't to do so, to reduce such utilities and
    // function calls.)
    } else {

      var ident_push = makeIdentifierName("push");
      var ident_apply = makeIdentifierName("apply");

      function ast_callPush(recv, arg) {
        return js.Call( js.Dot(recv, ident_push),
                        js.Arguments(arg) );
      }
      function ast_callPushApply(recv, arg) {
        return js.Call( js.Dot(js.Dot(recv, ident_push), ident_apply),
                        js.Arguments(recv, arg) );
      }

      var qqv_node = env.uniqueSymbol("_qqv", node);
      env.registerUnique(qqv_node);
      var ps = [];
      var constructor_stmts = js.Statements(js.Assign(qqv_node, js.ArrayLiteral()));

      node.forEach(function (ch) {
        var pe;
        if (Node.isArrayWithHead(ch, "<<unquote>>")) {
          Node.confirmArity(ch, '"," (<<unquote>>)', 1, 1, self.onerror_);
          pe = (nest === 0)
                  ? self.generate_(ch[1], env, AsExpression)
                  : generate_quasiquoted(self, nest - 1, ch, env, AsExpression);
          ps.push(pe[0]);
          constructor_stmts.append(ast_callPush(qqv_node, pe[1]));

        } else if (Node.isArrayWithHead(ch, "<<unquote-splicing>>")) {
          Node.confirmArity(ch, '",@" (<<unquote-splicing>>)', 1, 1, self.onerror_);
          pe = (nest === 0)
                  ? self.generate_(ch[1], env, AsExpression)
                  : generate_quasiquoted(self, nest - 1, ch, env, AsExpression);
          ps.push(pe[0]);
          // TOTHINK should confirm whether the pe[1] is an array or not?
          constructor_stmts.append(ast_callPushApply(qqv_node, pe[1]));

        } else if (Node.isArrayWithHead(ch, "<<quasiquote>>")) {
          pe = generate_quasiquoted(self, nest + 1, ch, env, AsExpression);
          ps.push(pe[0]);
          constructor_stmts.append(ast_callPush(qqv_node, pe[1]));

        } else {
          pe = generate_quasiquoted(self, nest, ch, env, AsExpression);
          ps.push(pe[0]);
          constructor_stmts.append(ast_callPush(qqv_node, pe[1]));
        }
      });

      return context.apply([
        (ps.length == 0) ? constructor_stmts
                         : js.Statements().setChildren(ps).append(constructor_stmts),
        js.Call(
          array_node_sym,
          js.Arguments(qqv_node, node.line, node.col))
      ]);
    }

  } else if (Node.is(node, "SYMBOL", "true") || Node.is(node, "SYMBOL", "false")) {
    return context.apply([undefined, js.Identifier(node)]);

  } else if (Node.isType(node, "SYMBOL")) {
    var symbol_sym = env.registerUtilValue("__sym", function () {
      return make_symbol_func_ast(env, self.compiletime_path_);
    });
    return context.apply([
      undefined,
      js.Call(symbol_sym, js.Arguments(node.val, node.line, node.col))
    ]);
  } else if (Node.isType(node, "STR") || Node.isType(node, "NUM")) {
    return context.apply([undefined, js.Literal(node)]);
  } else {
    devel.neverReach();
  }
}

special_form("<<quasiquote>>",
  [ "<<quasiquote>>", o("value") ],
  function (arg, node, env, context) {
    return generate_quasiquoted(this, 0, arg.value, env, context);
  }
);

special_form("<<array>>",
  [ "<<array>>", o("values", [0, N]) ],
  function (arg, node, env, context) {
    var self = this;
    var vs = util.partition(arg.values, function (n) { return Node.isArrayWithHead(n, ":"); });
    var prop_decls = vs[0];
    var elem_values = vs[1];

    var array_pses = util.unzipMapped(elem_values, function (ch) {
      return self.generate_(ch, env, AsExpression);
    });

    if (prop_decls.length === 0) {
      return context.apply([
        asts_to_statements(array_pses[0]),
        js.ArrayLiteral().setChildren(array_pses[1]),
      ]);

    } else {
      var assignee = env.uniqueSymbol("_array", node);
      env.registerUnique(assignee);
      var ident_assignee = js.Identifier(assignee);
      var array_pses = util.unzipMapped(elem_values, function (ch) {
        return self.generate_(ch, env, AssignTo(ident_assignee));
      });
      var prop_pses = util.unzipMapped(prop_decls, function (ch) {
        Node.confirmType(ch[1], "a property name of <<array>>", ["SYMBOL", "NUM", "STR"], self.onerror_);
        var propname_ast = Node.isJSIdentifierDotAccessible(ch[1])
                              ? js.Dot(ident_assignee, js.IdentifierName(ch[1]))
                              : js.Bracket(ident_assignee, ch[1]);
        return self.generate_(ch[2], env, AssignTo(propname_ast));
      });

      return context.apply([
        js.Statements()
          .append(array_pses[0])
          .append(prop_pses[0])
          .append(AssignTo(ident_assignee)(js.ArrayLiteral().setChildren(array_pses[1])))
          .append(prop_pses[1]),
        ident_assignee
      ]);
    }
  }
);

special_form("<<object>>",
  [
    "<<object>>",
    o("props", [0, N],
        o("abbrev", SymbolButNot(":")),
        o("full", [":", o("name"), o("value")]))
  ],
  function (arg, node, env, context) {
    var self = this;
    var props = arg.props.map(function (p) { return p.full || { name: p.abbrev, value: p.abbrev }; });
    var pses = util.unzipMapped(props, function (v) {
      Node.confirmType(v.name, "a property name of <<object>>", ["SYMBOL", "NUM", "STR"], self.onerror_);
      var pe = self.generate_(v.value, env, AsExpression);
      return [
        pe[0],
        js.PropertyAssignment(v.name, pe[1]),
      ];
    });
    var ps = pses[0];
    var es = pses[1];
    return context.apply([
      asts_to_statements(ps),
      js.ObjectLiteral().setChildren(es),
    ]);
  }
);

function make_maybe_pe(self, cond_pe, ret_pe, else_pe1, env, context) {
  else_pe1 || (else_pe1 = makeUndefined(env));
  if (!ret_pe[0] && !context.ignorable()) {
    var pe = context.apply([
      cond_pe[0],
      js.Conditional(cond_pe[1], ret_pe[1], else_pe1)
    ]);
  } else {
    var ctxs = context.extractDistributable(env, "_val");
    var dist_context = ctxs[0];
    var ret_context = ctxs[1];
    var then_pe = dist_context.apply(ret_pe);
    var else_pe = dist_context.apply([undefined, else_pe1]);
    var pe = ret_context.apply([
      js.Statements(cond_pe[0],
                    js.IfStatement(cond_pe[1],
                                   js.Statements(then_pe[0], then_pe[1]),
                                   js.Statements(else_pe[0], else_pe[1]))),
      undefined
    ]);
  }
  pe.maybe = {
    cond_pe: cond_pe,
    pe: context.apply(ret_pe),
  };
  return pe;
}

function generate_propref(self, recv, prop, env, context) {
    var recv_context = (context === AsLeftHandSide) ? AsLeftHandSide : AsExpression;
    var recv_pe = self.generate_(recv, env, recv_context);
    var prop_pe = [undefined, undefined];

    var cond_pe;
    if (recv_pe.maybe) {
      cond_pe = recv_pe.maybe.cond_pe;
      recv_pe = recv_pe.maybe.pe;
    }

    var expr;
    if (Node.isType(prop, "SYMBOL")) {
      expr = (Node.isJSIdentifierDotAccessible(prop))
                 ? js.Dot(recv_pe[1], js.IdentifierName(prop))
                 : js.Bracket(recv_pe[1], prop.val);
    } else if (Node.isArrayWithHead(prop, "<<array>>")) {
      if (prop.length == 2) {
        prop_pe = self.generate_(prop[1], env, AsExpression);
        expr = js.Bracket(recv_pe[1], prop_pe[1]);
      } else {
        // TOTHINK May support slicer foo.{x, y}
        // TOTHINK May support slicer foo.[x, y]
        // TOTHINK May support slicer foo.[a, (x, y), z]
        self.onerror_(CompilerMessage.Error.unintelligibleDotExpression(prop));
      }
    } else {
      self.onerror_(CompilerMessage.Error.unintelligibleDotExpression(prop));
    }
    var ret_pe = [
      (recv_pe[0] && prop_pe[0]) ? js.Statements(recv_pe[0], prop_pe[0])
                                 : (recv_pe[0] || prop_pe[0]),
      expr
    ];

    if (!cond_pe) {
      return context.apply(ret_pe);
    } else {
      return make_maybe_pe(self, cond_pe, ret_pe, undefined, env, context);
    }
}

special_form("<<dot>>",
  [ "<<dot>>", o("obj"), o("prop"), ],
  function (arg, node, env, context) {
    return generate_propref(this, arg.obj, arg.prop, env, context);
  }
);

special_form("@",
  [ "@", o("value") ],
  function (arg, node, env, context) {
    var this_sym = Node.makeSymbol("this", node);
    return generate_propref(this, this_sym, arg.value, env, context);
  }
);


special_form("<<question-dot>>",
  [ "<<question-dot>>", o("obj"), o("prop"), ],
  function (arg, node, env, context) {
    var sym = env.uniqueSymbol("_ref", arg.obj);
    env.registerUnique(sym);

    var recv_context = (context === AsLeftHandSide) ? AsLeftHandSide : AsExpression;
    var obj_pe = this.generate_(arg.obj, env, recv_context);
    var ref_pe = generate_propref(this, sym, arg.prop, env, AsExpression);

    var cond_ast = js.Ne(js.Assign(js.Identifier(sym), obj_pe[1]), makeIdentifier("null"));

    return make_maybe_pe(this, [obj_pe[0], cond_ast], ref_pe, undefined, env, context);
  }
);

special_form("=",
  [ "=", o("lhs"), o("rhs") ],
  function (arg, node, env, context) {
    // ECMA 5.1 11.13.1 Simple Assignment (=)

    if (Node.isType(arg.lhs, "SYMBOL")) {

      // Reject "eval" and "arguments" for the lhs. See ECMA 5.1 11.13.1.
      if (Node.is(arg.lhs, "SYMBOL", "eval") || Node.is(arg.lhs, "SYMBOL", "arguments"))
        this.onerror_(CompilerMessage.Warning.assigningToConfusing(arg.lhs));
      if (env.isInvariable(arg.lhs.val))
        this.onerror_(CompilerMessage.Warning.assigningToConstant(arg.lhs));

      Node.confirmIsValidJSVarName(arg.lhs, this.onerror_);

      // A peephole optimization: no need to assign undefined, the initial value of yet-known variables.
      if (!env.isKnownSymbol(arg.lhs)
           && (Node.is(arg.rhs, "SYMBOL", "undefined") && !env.isKnownVariable("undefined"))) {
        env.registerVariable(arg.lhs.val, util.stringIsUPPERCASE(arg.lhs.val));
        return context.apply([undefined, js.Identifier(arg.lhs)]);
      }

      // A peephole optimization: no need to assign itself. (i.e. x = x)
      // Note that these assignments can be removed only if it a known (local) variable
      // since global variables or property references may invoke a getter/setter.
      //
      // TODO! CURRENTLY DISABLED SINCE WE CANNOT DETECT WHETER A KNOWN VARIABLE IS LOCAL OR NOT (GLOBAL).
      //if (env.isKnownVariable(arg.lhs) && Node.is(arg.rhs, "SYMBOL", arg.lhs.val)) {
      //}

      env.registerVariable(arg.lhs.val, util.stringIsUPPERCASE(arg.lhs.val));
      var pe = this.generate_(arg.rhs, env, AssignTo(js.Identifier(arg.lhs)));
      return context.apply(pe);

    } else if (Node.isArrayWithHead(arg.lhs, "<<array>>")
            || Node.isArrayWithHead(arg.lhs, "<<object>>")) {
      var pe = this.generate_(arg.rhs, env, AsVariable(env, "_assignee", arg.rhs));
      var m = make_matcher(this, pe[1], arg.lhs, env);
      if (m.binder_asts.length == 0) {
        // Error. Notice that control reaches here if additonal conditions are given.
        this.onerror_(CompilerMessage.Error.nothingToBind(arg.lhs));
      }
      var ast = (m.tester_ast)
                  ? js.Statements(
                      js.IfStatement(
                        js.Not(m.tester_ast),
                        js.ThrowStatement(Node.makeStr("MatchFailure", node))),
                      asts_to_statements(m.binder_asts))
                  : asts_to_statements(m.binder_asts);
      return context.apply([
        (pe[0] || ast) ? js.Statements(pe[0], ast) : undefined,
        pe[1],
      ]);

    } else {
      // i.e. obj.property, functioncall() or etc.
      // Ugh! Should these conditions be written explicitly?

      var lhs_pe = this.generate_(arg.lhs, env, AsLeftHandSide);
      var rhs_pe = this.generate_(arg.rhs, env, AssignTo(lhs_pe[1]));
      return context.apply([
        js.Statements(lhs_pe[0], rhs_pe[0]),
        rhs_pe[1],
      ]);
    }
  }
);

function generate_sequential(self, body, env, context) {
  if (body.length == 0)
    return [undefined, js.EmptyStatement()];

  var asts = [];
  var last = body.length - 1;
  for (var i = 0; i < last; ++i) {
    var pe = self.generate_(body[i], env, Ignore(env));
    asts.push(pe[0], pe[1]);
  }
  var pe = self.generate_(body[last], env, context);
  asts.push(pe[0]);
  return [
    asts_to_statements(asts),
    pe[1]
  ];
}

special_form("->",
  [
    "->",
    o("body", [0, N]),
  ],
  function (arg, node, env, context) {
    return generate_sequential(this, arg.body, env, context);
  }
);

var obj_prop_matcher = NodeMatcherDSL.makeMatcher([":", o("prop"), o("value")]);

function make_matcher_x(self, matchee_ast, cond_node, env,
                        result_struct_cond_asts, result_binder_asts, result_additional_cond_asts,
                        nest_count) {

  if (Node.isLiteral(cond_node)) {
    result_struct_cond_asts.push(js.StrictEq(matchee_ast, cond_node));

  } else if (Node.isArrayWithHead(cond_node, "<<quote>>")) {

    if (cond_node.length !== 2 || cond_node[1].nodetype !== "SYMBOL")
      self.onerror_(CompilerMessage.Error.unintelligiblePattern(cond_node, "<<quote>> in patterns only accept a symbol."));
    var condsym = cond_node[1];
    result_struct_cond_asts.push(
        js.StrictEq(js.Dot(matchee_ast, makeIdentifierName("nodetype")),
                    js.Literal(Node.makeStr("SYMBOL", condsym))),
        js.StrictEq(js.Dot(matchee_ast, makeIdentifierName("val")),
                    js.Literal(Node.makeStr(condsym.val, condsym))));

  } else if (Node.isArrayWithHead(cond_node, "<<quasiquote>>")) {
    self.onerror_(CompilerMessage.Error.unintelligiblePattern(cond_node, "<<quasiquote>> is not valid as a pattern."));

  } else if (Node.isType(cond_node, "SYMBOL")) {
    if (cond_node.val !== "_") {
      // `(,(cond_node) = ,matchee_ast)
      Node.confirmIsValidJSVarName(cond_node, self.onerror_);
      if (env.isInvariable(cond_node.val))
        self.onerror_(CompilerMessage.Warning.assigningToConstant(cond_node));
      env.registerVariable(cond_node.val, util.stringIsUPPERCASE(cond_node.val));
      result_binder_asts.push(js.Assign(cond_node, matchee_ast));
    } else {
      // Do nothing
    }

  } else if (Node.isArrayWithHead(cond_node, "<<array>>")) {

    // Add: `(,matchee_ast instanceof Array)
    var symbol_array = Node.makeSymbol("Array", cond_node);
    var check_type_ast = js.Instanceof(matchee_ast, symbol_array);
    result_struct_cond_asts.push(check_type_ast);

    var len_ast = js.Dot(matchee_ast, js.IdentifierName(Node.makeSymbol("length")));
    var dots_iss = util.filterWithIndices(cond_node, Node.isSymbolThreeDotted, 1);
    if (dots_iss.length > 1)
      self.onerror_(CompilerMessage.Error.tooManyDottedSymbols(dots_iss[0].value));

    if (dots_iss.length === 0) {
      // the simple case: no dots in the pattern. i.e. ["request", resource, timestamp]

      // Add: `(,(matchee_ast).length == ,(cond_node.length - 1))
      var check_len_ast = js.Eq(len_ast, cond_node.length - 1);  // -1 for <<array>>
      result_struct_cond_asts.push(check_len_ast);

      // Add: make_matcher_x(matchee_ast[i])
      cond_node.slice(1).forEach(function (child_node, i) {
        var child_matchee_ast = js.Bracket(matchee_ast, i);
        make_matcher_x(self, child_matchee_ast, child_node, env,
                       result_struct_cond_asts, result_binder_asts,
                       result_additional_cond_asts, nest_count + 1);
      });

    } else {
      // the complexed case: dots in the pattern.
      // (i.e. ["restparams", id, ...values, lastmodified])

      // Length Check.
      // Add: `(,(matchee_ast).length >= ,(cond_node.length - 2))
      if (cond_node.length - 2 > 0) {
        var check_len_ast = js.Ge(len_ast, cond_node.length - 2);  // -2 for <<array>> and the dotted (i.e. "...values")
        result_struct_cond_asts.push(check_len_ast);
      }

      var dots_idx = dots_iss[0].index;
      var dots_sym = Node.symbolStrippedThreeDots(dots_iss[0].value);

      // Before Dots: match normally.
      //   i.e. ["restparams", id, ...values, lastmodified]
      //         -----------------
      // Add: make_matcher_x(`(matchee_ast[i]))
      cond_node.slice(1, dots_idx).forEach(function (child_node, i) {
        var child_matchee_ast = js.Bracket(matchee_ast, i);
        make_matcher_x(self, child_matchee_ast, child_node, env,
                       result_struct_cond_asts, result_binder_asts,
                       result_additional_cond_asts, nest_count + 1);
      });

      // Dots:
      //   i.e. ["restparams", id, ...values, lastmodified]
      //                           ---------
      // Add: `(,dots_sym = ,(matchee_ast).slice(,dots_idx, ,(matchee_ast.length - ,(cond_node.length - dots_idx - 1))))
      if (dots_sym.val !== "") {
        if (env.isInvariable(dots_sym.val))
          self.onerror_(CompilerMessage.Warning.assigningToConstant(dots_sym));
        env.registerVariable(dots_sym.val, util.stringIsUPPERCASE(dots_sym.val));
        var begin_idx = dots_idx - 1;  // -1 for <<array>>
        var num_after_dots = cond_node.length - dots_idx - 1;
        var end_idx_ast = (num_after_dots != 0) ? js.Sub(len_ast, num_after_dots)
                                                : len_ast;
        var slice_ast = js.Dot(matchee_ast, makeIdentifierName("slice"))
        var assign_ast = js.Assign(js.Identifier(dots_sym),
                                   js.Call(slice_ast, js.Arguments(begin_idx, end_idx_ast)));
        result_binder_asts.push(assign_ast);
      }

      // After Dots: match the last elements.
      //   i.e. ["restparams", id, ...values, lastmodified]
      //                                      ------------
      // make_matcher_x(`(matchee_ast[matchee_ast.length - ,(cond_node.length - (dots_idx + 1 + i))]))
      cond_node.slice(dots_idx + 1).forEach(function (child_node, i) {
        var target_idx_ast = js.Sub(len_ast, cond_node.length - (dots_idx + 1 + i));
        var child_matchee_ast = js.Bracket(matchee_ast, target_idx_ast);
        make_matcher_x(self, child_matchee_ast, child_node, env,
                       result_struct_cond_asts, result_binder_asts,
                       result_additional_cond_asts, nest_count + 1);
      });
    }

  } else if (Node.isArrayWithHead(cond_node, "<<object>>")) {
    //// `(,matchee_ast && typeof ,matchee_ast === "object")
    //result_struct_cond_asts.push(matchee_ast,
    //                        js.StrictEq(js.Typeof(matchee_ast), "object"));

    // `(,matchee_ast instanceof Object)
    result_struct_cond_asts.push(js.Instanceof(matchee_ast, makeIdentifier("Object")));

    cond_node.slice(1).forEach(function (child_node) {
      // `(,(stringify child_node[1]) in ,matcher_ast)
      var p = obj_prop_matcher(child_node);
      if (p.fail && Node.isType(child_node, "SYMBOL"))
        p.value = { prop: child_node, value: child_node };
      if (p.value) {
        Node.confirmType(p.value.prop, "a property name of <<object>>", ["SYMBOL", "NUM", "STR"], self.onerror_);
        result_struct_cond_asts.push(js.In(Node.toInLeftArgument(p.value.prop), matchee_ast));
        var child_matchee_ast = Node.isJSIdentifierDotAccessible(p.value.prop)
                                   ? js.Dot(matchee_ast, js.IdentifierName(p.value.prop))
                                   : js.Bracket(matchee_ast, p.value.prop);
        make_matcher_x(self, child_matchee_ast, p.value.value, env,
                       result_struct_cond_asts, result_binder_asts,
                       result_additional_cond_asts, nest_count + 1);
      } else {
        self.onerror_(CompilerMessage.Error.unintelligiblePattern(child_node));
      }
    });

  } else if (Node.isArrayWithHead(cond_node, "if")
          || Node.isArrayWithHead(cond_node, "unless")) {

    if (nest_count > 1)
      self.onerror_(CompilerMessage.Error.ifPatternCannotBeNested(cond_node));
    Node.confirmArity(cond_node, "if/unless-pattern", 1, 1, self.onerror_);
    var pe = self.generate_(cond_node[1], env, AsExpression);
    if (pe[0])
      self.onerror_(CompilerMessage.Error.limitationProhibitsStatement(cond_node[1]));
    var e = (cond_node[0].val === "unless") ? js.Not(pe[1]) : pe[1];
    result_additional_cond_asts.push(e);

  } else if (Node.isArrayWithHead(cond_node, "instanceof")) {
    var instanceof_asts = cond_node.slice(1).map(function (ch) {
      var pe = self.generate_(ch, env, AsExpression);
      if (pe[0])
        self.onerror_(CompilerMessage.Error.limitationProhibitsStatement(ch));
      return js.Instanceof(matchee_ast, pe[1]);
    });
    result_struct_cond_asts.push(js.Or_Multi().setChildren(instanceof_asts));

  } else if (Node.isArrayWithHead(cond_node, "typeof")) {
    var typeof_asts = cond_node.slice(1).map(function (ch) {
      if (!Node.isType(ch, "STR"))
        self.onerror_(CompilerMessage.Error.typeofPatternNeedsStringLiteral(ch));
      var pe = self.generate_(ch, env, AsExpression);
      // ASSERT (!pe[0]);
      return js.StrictEq(js.Typeof(matchee_ast), pe[1]);
    });
    result_struct_cond_asts.push(js.Or_Multi().setChildren(typeof_asts));

  } else if (cond_node instanceof Array) {
    // Not (Node.isType(cond_node, "ARRAY")) since cond_node may be
    // constructed by NodeMatcherDSL.  See `special_form("match", ...)`.

    var nirrefutable = util.count(cond_node, function (n) { return Node.isType(n, "SYMBOL"); });
    if (nirrefutable > 1)
      self.onerror_(CompilerMessage.Warning.multipleIrrefutablePatterns(c.cond));

    cond_node.forEach(function (child_node, i) {
      make_matcher_x(self, matchee_ast, child_node, env,
                     result_struct_cond_asts, result_binder_asts,
                     result_additional_cond_asts, nest_count + 1);
    });

  } else {
    self.onerror_(CompilerMessage.Error.unintelligiblePattern(cond_node));
  }
}

function make_matcher(self, matchee_ast, cond_node, env) {
  var structure_cond_asts = [], binder_asts = [], additional_cond_asts = [];
  make_matcher_x(self, matchee_ast, cond_node, env,
                 structure_cond_asts, binder_asts,
                 additional_cond_asts, 0);

  if (additional_cond_asts.length == 0) {
    return {
      tester_ast: structure_cond_asts.length > 0
                      ? js.And_Multi().setChildren(structure_cond_asts)
                      : undefined,
      binder_asts: binder_asts,
    };

  } else if (binder_asts.length == 0) {
    // Additional conditions are given but no binding are introduced...
    // This means that additional conditions need not to be evaluated *after* binding.
    // In other words, they can be treated as same as structural conditions.

    var ast = js.And_Multi();
    (structure_cond_asts.length > 0) && ast.append(structure_cond_asts);
    ast.append(additional_cond_asts);
    return {
      tester_ast: ast,
      binder_asts: binder_asts,
    };

  } else {
    // The most complex case...
    // The generated code must perform (1) test strcutural conditions,
    // (2) bind matched variables, and then (3) test additional conditions
    // because additional conditions may refer variables introduced by the step (2).

    var ast = js.And_Multi();
    (structure_cond_asts.length > 0) && ast.append(structure_cond_asts);
    var additional_ast = js.And_Multi().setChildren(additional_cond_asts);
    if (binder_asts.length > 0) {
      ast.append(js.Comma_Multi().setChildren(binder_asts).append(additional_cond_asts));
    } else {
      ast.append(additional_cond_asts);
    }
    return {
      tester_ast: ast,
      binder_asts: [],
    };
  }
}

function generate_match(self, expr, cases, default_pe, env, context) {
  //default_pe || (default_pe = [undefined, makeUndefined(env)]);
  if (!default_pe) {
    default_pe = [
      js.ThrowStatement(js.Call(makeIdentifier("Error"),
                                js.Arguments(js.Literal(Node.makeStr("match failure", expr))))),
      makeUndefined(env)
    ];
  }

  if (cases.length === 0)
    devel.neverReach();

  var ndefault = util.count(cases, function (c) { return Node.is(c.cond, "SYMBOL", "_"); });
  var be_switch = (ndefault <= 1) && (cases.length > 2) && cases.every(function (c) {
    return Node.isLiteral(c.cond) || Node.is(c.cond, "SYMBOL", "_");
  });

  var ctxs = context.extractDistributable(env, "_match_result", expr);
  var dist_context = ctxs[0];
  context = ctxs[1];

  // the match expression can be described as a switch statement.
  if (be_switch) {
    var expr_pe = self.generate_(expr, env, AsExpression);
    var switch_ast = js.SwitchStatement(expr_pe[1]);

    var generated = cases.map(function (c) {
      var body_pe = self.generate_(c.body, env, dist_context);
      var stmts = js.Statements(body_pe[0], body_pe[1], js.BreakStatement());
      var cond_pe = self.generate_(c.cond, env, AsExpression);
      // ASSERT cond_pe[0] === undefined
      return Node.is(c.cond, "SYMBOL", "_") ? js.DefaultClause(stmts)
                                            : js.CaseClause(cond_pe[1], stmts);
    });
    switch_ast.append(generated);
    if (ndefault == 0)
      switch_ast.append(dist_context.apply(default_pe));
    return context.apply([
      js.Statements(expr_pe[0], switch_ast),
      undefined
    ]);

  // The match expression cannot be described as a switch statement.
  // Generate an if-elseif chain.
  } else {
    var expr_pe = self.generate_(expr, env, AsVariable(env, "_matchee", expr));

    var ast = cases.reduceRight(function (acc, c, i) {
      var m = make_matcher(self, expr_pe[1], c.cond, env);
      var body_pe = self.generate_(c.body, env, dist_context);
      var case_body = js.Statements().setChildren(m.binder_asts)
                                     .append([body_pe[0], body_pe[1]]);
      if (m.tester_ast) {
        return js.IfStatement(m.tester_ast, case_body, acc);
      } else {
        // This is an irrefutable pattern.
        // Should be the last one, otherwise the followng patterns are never matched.
        if (i < cases.length - 1)
          self.onerror_(CompilerMessage.Warning.nonLastIrrefutablePattern(c.cond));
        return case_body;
      }
    }, js.Statements().append(dist_context.apply(default_pe)));

    return context.apply([
      js.Statements(expr_pe[0], ast),  // exclude expr_pe[1] since its just a variable name
      undefined
    ]);
  }
}

special_form("match",
  [
    "match",
    o("expr"),
    o("cases", [1, N],
        [
          o("cond", [1, N]),
          o("body")
        ]),
  ],
  function (arg, node, env, context) {
    return generate_match(this, arg.expr, arg.cases, undefined, env, context);
  }
);

special_form("if",
  [
    "if",
    o("cond"),
    o("then_clause"),
    o([0, 1],
        [ "else", o("else_clause") ],
        o("else_clause")
      )
  ],
  function (arg, node, env, context) {

    if (context.ignorable()) {
      // TODO ONLYOPT Don't enter this path when debug
      // TOTHINK Should generate a comment instead of omitting?
      // ASSERT context.distributable()
      var ctxs = context.extractDistributable(env, "_neverused", node);
      var dist_context = ctxs[0];
      context = ctxs[1];
      var cond_pe = this.generate_(arg.cond, env, AsExpression);
      var then_pe = this.generate_(arg.then_clause, env, dist_context);
      var else_pe = arg.else_clause
                       ? this.generate_(arg.else_clause, env, dist_context)
                       : dist_context.apply([undefined, makeUndefined(env)]);

      function empty(pe) { return !pe[0] && !pe[1]; }

      if (empty(then_pe) && empty(else_pe)) {
        // TOTHINK Actually even cond_pe can be ignored... but should do so? (esp. readability)
        return context.apply([js.Statements(cond_pe[0], cond_pe[1]), undefined]);
      }

      return context.apply([
          js.Statements(cond_pe[0],
                        js.IfStatement(cond_pe[1],
                                       empty(then_pe) ? undefined
                                                      : js.Statements(then_pe[0], then_pe[1]),
                                       empty(else_pe) ? undefined
                                                      : js.Statements(else_pe[0], else_pe[1]))),
          undefined
      ]);
    }

    var cond_pe = this.generate_(arg.cond, env, AsExpression);
    var then_pe = this.generate_(arg.then_clause, env, AsExpression);

    var else_pe = arg.else_clause
                     ? this.generate_(arg.else_clause, env, AsExpression)
                     : [undefined, makeUndefined(env)];
    if (!then_pe[0] && !else_pe[0]) {
      return context.apply([
        cond_pe[0],
        js.Conditional(cond_pe[1], then_pe[1], else_pe[1])
      ]);
    } else {
      var ctxs = context.extractDistributable(env, "_if_result", node);
      var dist_context = ctxs[0];
      context = ctxs[1];
      then_pe = dist_context.apply(then_pe);
      else_pe = dist_context.apply(else_pe);
      return context.apply([
        js.Statements(
          cond_pe[0],
          js.IfStatement(cond_pe[1],
            js.Statements(then_pe[0], then_pe[1]),
            js.Statements(else_pe[0], else_pe[1]))),
        undefined
      ]);
    }
  }
);

function generate_argument_bind(self, args, env) {
  var arg_names = args.map(function (a) { return a.name; });

  var dots_iss = util.filterWithIndices(arg_names, Node.isSymbolThreeDotted);
  if (dots_iss.length > 1) {
    self.onerror_(CompilerMessage.Error.tooManyDottedSymbols(dots_iss[1].value));
  }

  var ret_ast = js.Statements();

  var arg_ast = makeIdentifier("arguments");
  var arglen_ast = js.Dot(arg_ast, makeIdentifierName("length"));
  if (dots_iss.length === 1) {
    var speclen = arg_names.length;
    var dots_idx = dots_iss[0].index;
    var dots_sym = Node.symbolStrippedThreeDots(dots_iss[0].value);

    var slice_ast = js.Dot(js.Dot(js.ArrayLiteral(),
                                  makeIdentifierName("slice")),
                           makeIdentifierName("call"));

    if (dots_sym.val !== "") {
      // Generate code to initialize the dotted argument (i.e. ...foo) by slicing `arguments`.
      // Here we intentionally skip `env.isInvariable()` because this is the first assignment.
      // Code: `(,dots_sym = Array.prototype.slice.call(arguments, ,begin_idx, ,end_idx_ast))
      var begin_idx = dots_idx;
      var num_after_dots = speclen - (dots_idx + 1);
      var end_idx_ast = (num_after_dots != 0) ? js.Sub(arglen_ast, num_after_dots)
                                              : arglen_ast;
      ret_ast.append(js.Assign(js.Identifier(dots_sym),
                               js.Call(slice_ast, js.Arguments(arg_ast, begin_idx, end_idx_ast))));
    }

    // Generate code to initialize the arguments following the dotted argument.
    // Also intentionally skip `env.isInvariable()` because these are the first assignment of each value.
    // Code: `(,(arg_names[i]) = arguments[_i + ,src_i])
    var i_ast = env.uniqueSymbol("_i");
    var assign_after_dots_asts = [];
    for (var name_i = dots_idx + 1, src_i = 0; name_i < speclen; ++name_i, ++src_i) {
      var assign_ast = js.Assign(arg_names[name_i], js.Bracket(arg_ast, js.Add(i_ast, src_i)));
      assign_after_dots_asts.push(assign_ast);
    }
    if (assign_after_dots_asts.length > 0) {
      env.registerUnique(i_ast);
      var math_max_ast = js.Dot(makeIdentifier("Math"), makeIdentifierName("max"));
      var set_i_ast =
            js.Assign(i_ast,
                      js.Call(math_max_ast,
                              js.Arguments(js.Sub(arglen_ast, speclen - (dots_idx + 1)),
                                           dots_idx)));
      ret_ast.append(js.IfStatement(js.Gt(arglen_ast, dots_idx),
                                    js.Statements()
                                      .append(set_i_ast)
                                      .append(assign_after_dots_asts)));
    }
  }

  // Generate code to assign default values.
  // Also intentionally skip `env.isInvariable()`.
  var defvals_asts = args.map(function (arg, i) {
    if (!arg.defaultValue)
      return undefined;
    // `(,arg.name == null && (,arg.name = ,arg.defaultValue))
    var defvalue_pe = self.generate_(arg.defaultValue, env, AssignTo(arg.name));
    var not_given_ast = js.Eq(arg.name, makeUndefined(env));  // Use Eq for null/undefined
    return (!defvalue_pe[0])
             ? js.And(not_given_ast, defvalue_pe[1])
             : js.IfStatement(not_given_ast,
                              js.Statements(defvalue_pe[0], defvalue_pe[1]));
  });

  ret_ast.append(defvals_asts);
  return ret_ast;
}

function generate_function(self, args, body, env) {
  env.enterScope();
  try {
    var after_dots = false;
    var argnames_before_dots = [], argnames_after_dots = [];
    args.forEach(function (arg) {
      after_dots = (after_dots || Node.isSymbolThreeDotted(arg.name));
      var name = Node.symbolStrippedThreeDots(arg.name);
      if (name !== "")
        (after_dots ? argnames_after_dots : argnames_before_dots).push(name);
    });

    argnames_before_dots.forEach(function (argname) {
      env.registerArgument(argname.val, util.stringIsUPPERCASE(argname.val));
    });
    argnames_after_dots.forEach(function (argname) {
      env.forceRegisterVariable(argname.val, util.stringIsUPPERCASE(argname.val));
    });
    var paramlist_ast = js.FormalParameterList().setChildren(argnames_before_dots);
    var argbind_ast = generate_argument_bind(self, args, env);

    var body_pe = generate_sequential(self, body, env, Return);
    var body_ast = js.Statements().append(argbind_ast)
                                  .append([body_pe[0], body_pe[1]]);

    var src_ast = js.SourceElements();
    var vars = env.variableSymbolsInScope();
    vars.length > 0 && src_ast.append(js.VariableStatement_NoAssign().setChildren(vars));

    var uvs = env.utilValues();
    var uvs_decl_ast = uvs.map(function (uv) { return js.VariableDeclaration(uv.symbol, uv.val); });
    uvs.length > 0 && src_ast.append(js.VariableStatement_Direct().setChildren(uvs_decl_ast));

    src_ast.append(body_ast);

    var ret = js.FunctionExpression(undefined, paramlist_ast, src_ast);
    ret.data("varinfo", env.variableInfoInScope());
    return ret;

  } finally {
    env.leaveScope();
  }
}

special_form(["#", "<<macro-definition>>"],
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
  function (arg, node, env, context) {
    var args = arg.args ? (arg.args.list || [arg.args]) : [];
    var fun_ast = generate_function(this, args, arg.body, env);
    return context.apply([undefined, fun_ast]);
  }
);

// WILLBEREMOVED
//function generate_funcall(self, node, call_method, env, context) {
//  //var pses = util.unzipMapped(node, function (ch) {
//  //  return self.generate_(ch, env, AsExpression);
//  //});
//  //var ps = pses[0];
//  //var es = pses[1];
//  //var fun = es.shift();
//  //return context.apply([
//  //  asts_to_statements(ps),
//  //  call_method(fun, js.Arguments().setChildren(es))
//  //]);
//}

function generate_funcall(self, fun, args, call_method, env, context) {
  var fun_pe = self.generate_(fun, env, AsExpression);
  var pses = util.unzipMapped(args, function (ch) {
    return self.generate_(ch, env, AsExpression);
  });
  var ps = pses[0];
  var es = pses[1];

  var cond_pe;
  if (fun_pe.maybe) {
    cond_pe = fun_pe.maybe.cond_pe;
    fun_pe = fun_pe.maybe.pe;
  }

  ps.unshift(fun_pe[0]);
  var ret_pe = [
    asts_to_statements(ps),
    call_method(fun_pe[1], js.Arguments().setChildren(es))
  ];

  if (!cond_pe) {
    return context.apply(ret_pe);
  } else {
    return make_maybe_pe(self, cond_pe, ret_pe, undefined, env, context);
  }
}

special_form("?",
  [ "?", o("fun"), o("args") ],
  function (arg, node, env, context) {
    var sym = env.uniqueSymbol("_fun", arg.fun);
    env.registerUnique(sym);

    var args = (arg.args.length == 1 && arg.args[0].length === 0) ? [] : arg.args;

    var fun_pe = this.generate_(arg.fun, env, AsExpression);
    var call_pe = generate_funcall(this, sym, args, js.Call, env, AsExpression);

    // `(typeof (,sym = ,(fun_pe[1])) === "function")
    var cond_ast = js.StrictEq(js.Typeof(js.Assign(js.Identifier(sym), fun_pe[1])),
                               Node.makeStr("function", args.fun));
    return make_maybe_pe(this, [fun_pe[0], cond_ast], call_pe, js.Identifier(sym), env, context);
  }
);

special_form("return",
  [ "return", o("value") ],
  function (arg, node, env, context) {
    var pe = this.generate_(arg.value, env, Return);
    return context.apply([(pe[1] ? js.Statements(pe[0], pe[1]) : pe[0]), undefined]);
  }
);

special_form("throw",
  [ "throw", o("value") ],
  function (arg, node, env, context) {
    var pe = this.generate_(arg.value, env, Throw);
    return context.apply([(pe[1] ? js.Statements(pe[0], pe[1]) : pe[0]), undefined]);
  }
);

special_form("try",
  [
    "try",
    o("body"),
    o("catches", [0, N],
       [ o("head", "catch"), o("cond"), o("body") ]),
    o([0, 1],
       [ "finally", o("finally") ])
  ],
  function (arg, node, env, context) {
    var ctxs = context.extractDistributable(env, "_tryval", node);
    var dist_context = ctxs[0];
    context = ctxs[1];

    var body_pe = this.generate_(arg.body, env, dist_context);
    var body_ast = js.Block(body_pe[0], body_pe[1]);
    var catch_ast, finally_ast;

    if (arg.catches.length > 0) {
      var exc_node = env.uniqueSymbol("_exc", arg.catches[0].head);
      env.registerUnique(exc_node);
      var rethrow_pe = [js.ThrowStatement(js.Identifier(exc_node)), makeUndefined(env)];
      var match_pe = generate_match(this, exc_node, arg.catches, rethrow_pe, env, dist_context);
      catch_ast = js.Catch(js.Identifier(exc_node), js.Block(match_pe[0], match_pe[1]));
    }
    if (arg.finally) {
      var finally_pe = this.generate_(arg.finally, env, Ignore(env));
      finally_ast = js.Finally(js.Block(finally_pe[0], finally_pe[1]));
    }

    return context.apply([js.TryStatement(body_ast, catch_ast, finally_ast), undefined]);
  }
);

special_form("while",
  [
    "while",
    o("test"),
    o("label", [0, 1],
        [ "label", o("label", SymbolButNot("->")) ]),
    o("body")
  ],
  function (arg, node, env, context) {
    var test_pe = this.generate_(arg.test, env, AsExpression);
    var body_pe = this.generate_(arg.body, env, Ignore(env));

    // Common case.
    if (!test_pe[0]) {
      // while (test_pe[1]) {
      //   body_pe[0];
      //   body_pe[1];
      // }
      var while_ast = js.WhileStatement(test_pe[1], js.Statements(body_pe[0], body_pe[1]));

    // Rare case: the test clause includes a statement.
    } else {
      // for (;;) {
      //   test_pe[0];
      //   if (!test_pe[1]) break;
      //   body_pe[0];
      //   body_pe[1];
      // }
      var test_ast = js.IfStatement(js.Not(test_pe[1]), js.BreakStatement());
      var while_ast = js.ForStatement(undefined, undefined, undefined,
                                      js.Statements(test_pe[0], test_ast, body_pe[0], body_pe[1]));
    }

    if (arg.label)
      while_ast = js.LabelledStatement(js.Identifier(arg.label.label), while_ast);
    return context.apply([while_ast, makeUndefined(env)]);
  }
);

special_form(["for", "for-own"],
  [
    o("head"),
    o("cond",
        o("empty", []),
        o("tuple", ["<<tuple>>", o("init"), o("test"), o("step")]),
        o("in",
            [ "in",
              o("lhs",
                  o("key", Symbol),
                  o(["<<tuple>>", o("key", Symbol), o("val", Symbol)])),
              o("rhs") ])),
    o("label", [0, 1],
        [ "label", o("label", SymbolButNot("->")) ]),
    o("body")
  ],
  function (arg, node, env, context) {
    var onlyown = (arg.head.val === "for-own");

    // o("empty", []),
    if (arg.cond.empty) {
      if (onlyown)
        this.onerror_(CompilerMessage.Error.invalidForOwn(head));

      var body_pe = this.generate_(arg.body, env, Ignore(env));
      var for_ast = js.ForStatement(undefined, undefined, undefined,
                                    js.Statements(body_pe[0], body_pe[1]));
      if (arg.label)
        for_ast = js.LabelledStatement(js.Identifier(arg.label.label), for_ast);
      return context.apply([for_ast, makeUndefined(env)]);

    // ["<<tuple>>", o("init"), o("test"), o("step")]
    } else if (arg.cond.tuple) {
      if (onlyown)
        this.onerror_(CompilerMessage.Error.invalidForOwn(head));

      var tuplecond = arg.cond.tuple;
      var init_pe = this.generate_(tuplecond.init, env, AsExpression);
      var test_pe = this.generate_(tuplecond.test, env, AsExpression);
      var step_pe = this.generate_(tuplecond.step, env, AsExpression);
      var body_pe = this.generate_(arg.body, env, Ignore(env));

      if (step_pe[0])
        this.onerror_(CompileError.limitationProhibitsStatement(tuplecond.step));

      // Common case.
      if (!test_pe[0]) {
        // init_pe[0];
        // for (init_pe[1]; test_pe[1]; step_pe[1]) {
        //   body_pe[0];
        //   body_pe[1];
        // }
        var for_ast = js.ForStatement(init_pe[1], test_pe[1], step_pe[1],
                                      js.Statements(body_pe[0], body_pe[1]));

      // Rare case: the test clause includes a statement.
      } else {
        // init_pe[0];
        // for (init_pe[1]; ; step_pe[1]) {
        //   test_pe[0];
        //   if (!test_pe[1]) break;
        //   body_pe[0];
        //   body_pe[1];
        // }
        var test_ast = js.IfStatement(js.Not(test_pe[1]), js.BreakStatement());
        var for_ast = js.ForStatement(init_pe[1], undefined, step_pe[1],
                                      js.Statements(test_pe[0], test_ast, body_pe[0], body_pe[1]));
      }

      if (arg.label)
        for_ast = js.LabelledStatement(js.Identifier(arg.label.label), for_ast);
      return context.apply([js.Statements(init_pe[0], for_ast), makeUndefined(env)]);

    // [ "in",
    //   o("lhs",
    //       o("key", Symbol),
    //       o(["<<tuple>>", o("key", Symbol), o("val", Symbol)])),
    //   o("rhs") ])),
    } else if (arg.cond.in) {
      var incond = arg.cond.in;
      var rhs_context = (onlyown || incond.lhs.val) ? AsVariable(env, "_rhs", incond.rhs) : AsExpression;
      var inrhs_pe = this.generate_(incond.rhs, env, rhs_context);
      var body_pe = this.generate_(arg.body, env, Ignore(env));

      if (util.stringIsUPPERCASE(incond.lhs.key.val))
        this.onerror_(CompilerMessage.Warning.forInByConstant(incond.lhs.key));
      env.registerVariable(incond.lhs.key, false);

      var val_ast;
      if (incond.lhs.val) {
        if (util.stringIsUPPERCASE(incond.lhs.val.val))
          this.onerror_(CompilerMessage.Warning.forInByConstant(incond.lhs.val));
        env.registerVariable(incond.lhs.val, false);
        // `(,val = ,rhs[,key])
        val_ast = js.Assign(js.Identifier(incond.lhs.val),
                            js.Bracket(inrhs_pe[1], js.Identifier(incond.lhs.key)));
      }

      var own_ast;
      if (onlyown) {
        // `(if (! {}.hasOwnProperty.call(,rhs, ,key)) continue;)
        var hasprop_ast = env.registerUtilValue("_hasOwnProp", function () {
          return js.Dot(js.ObjectLiteral(), makeIdentifierName("hasOwnProperty"));
        });
        own_ast = js.IfStatement(
                     js.Not(js.Call(js.Dot(hasprop_ast, makeIdentifierName("call")),
                                    js.Arguments(inrhs_pe[1], js.Identifier(incond.lhs.key)))),
                     js.ContinueStatement());
      }
      var for_ast = js.ForInStatement(js.Identifier(incond.lhs.key), inrhs_pe[1],
                                      js.Statements(own_ast, val_ast, body_pe[0], body_pe[1]));
      if (arg.label)
        for_ast = js.LabelledStatement(js.Identifier(arg.label.label), for_ast);
      return context.apply([js.Statements(inrhs_pe[0], for_ast), makeUndefined(env)]);
    }
  }
);

function special_symbol__simple_statement(name, op) {
  special_symbol(name,
    function (node, env, context) {
      return context.apply([op(), undefined]);
    }
  );
}

special_symbol__simple_statement("break", js.BreakStatement);
special_symbol__simple_statement("continue", js.ContinueStatement);
special_symbol__simple_statement("debugger", js.DebuggerStatement);

function special_form__label_jump_statement(name, op) {
  special_form(name,
    [
      name,
      o("label", Symbol)
    ],
    function (arg, node, env, context) {
      return context.apply([op(js.Identifier(arg.label)), undefined]);
    }
  );
}

special_form__label_jump_statement("break", js.BreakStatement);
special_form__label_jump_statement("continue", js.ContinueStatement);


// OPERATORS
// ---------

var identity = function (x) { return x; };

function special_form__operator_variadic(name, operator, unary) {
  special_form(name,
    [
      o(),
      o("values", [0, N])
    ],
    function (arg, node, env, context) {
      var self = this;

      if (arg.values.length === 0) {
        return context.apply([undefined, makeUndefined(env)]);
      } else if (arg.values.length === 1) {
        var pe = self.generate_(arg.values[0], env, AsExpression);
        return context.apply([pe[0], unary(pe[1])]);
      }

      var pses = util.unzipMapped(arg.values, function (value) {
        return self.generate_(value, env, AsExpression);
      });
      return context.apply([
        js.Statements().setChildren(pses[0]),
        operator().setChildren(pses[1])
      ]);
    }
  );
}

special_form__operator_variadic("+",   js.Add_Multi,     js.UnaryPlus);
special_form__operator_variadic("-",   js.Sub_Multi,     js.UnaryMinus);
special_form__operator_variadic("*",   js.Mul_Multi,     identity);
special_form__operator_variadic("/",   js.Div_Multi,     function (x) { return js.Div(1, x); });
special_form__operator_variadic("%",   js.Mod_Multi,     identity);
special_form__operator_variadic("<<",  js.LSfhit_Multi,  identity);
special_form__operator_variadic(">>",  js.SRShift_Multi, identity);
special_form__operator_variadic(">>>", js.URShift_Multi, identity);
special_form__operator_variadic("&",   js.BitAnd_Multi,  identity);
special_form__operator_variadic("|",   js.BitOr_Multi,   identity);
special_form__operator_variadic("^",   js.BitXor_Multi,  identity);

function generate_logical(operator, ascond, self, lhs_pe, rhs_pe, env, context) {
  if (!rhs_pe[0]) {
    return context.apply([
      lhs_pe[0],
      operator(lhs_pe[1], rhs_pe[1])
    ]);
  } else {
    var ctxs = context.extractDistributable(env, "_logicresult");
    var dist_context = ctxs[0];
    context = ctxs[1];
    lhs_pe = AsVariable(env, "_logiclhs").apply(lhs_pe);
    dist_lhs_pe = dist_context.apply([undefined, lhs_pe[1]]);
    dist_rhs_pe = dist_context.apply(rhs_pe);

    return context.apply([
      js.Statements(lhs_pe[0],
                    js.IfStatement(ascond(lhs_pe[1]),
                                   js.Statements(dist_lhs_pe[0], dist_lhs_pe[1]),
                                   js.Statements(dist_rhs_pe[0], dist_rhs_pe[1]))),
      undefined
    ]);
  }
}

function special_form__operator_logical(name, operator, binary, unary, ascond) {
  special_form(name,
    [
      o(),
      o("values", [0, N])
    ],
    function (arg, node, env, context) {
      var self = this;

      if (arg.values.length === 0) {
        return context.apply([undefined, makeUndefined(env)]);
      } else if (arg.values.length === 1) {
        var pe = self.generate_(arg.values[0], env, AsExpression);
        return context.apply([pe[0], unary(pe[1])]);
      }

      var pes = arg.values.map(function (v) { return self.generate_(v, env, AsExpression); });

      var no_prologue = pes.slice(1).every(function (pe) { return !pe[0] });
      if (no_prologue) {
        return context.apply([
          pes[0][0],
          operator().setChildren(pes.map(function (pe) { return pe[1]; }))
        ]);
      }

      return pes.reduce(function (acc, v) {
        return generate_logical(binary, ascond, self, acc, v, env, context);
      });
    }
  );
}

special_form__operator_logical(["&&", "and"], js.And_Multi, js.And, identity, js.Not);
special_form__operator_logical(["||", "or"],  js.Or_Multi,  js.Or,  identity, identity);

function special_form__operator_relational(name, operator, combinator) {
  special_form(name,
    [
      o(),
      o("values", [2, N])   // TOTHINK Should support unary call like Common Lisp?
    ],
    function (arg, node, env, context) {
      var self = this;

      var pses = util.unzipMapped(arg.values, function (value) {
        return self.generate_(value, env, AsExpression);
      });
      var ps = pses[0].filter(identity);
      var es = pses[1];
      var and_ast = combinator();
      for (var i = 0; i < es.length - 1; ++i)
        and_ast.append(operator(es[i], es[i + 1]));

      return context.apply([
        (ps.length === 0) ? undefined : js.Statements().setChildren(ps),
        and_ast
      ]);
    }
  );
}

special_form__operator_relational("js==", js.Eq,       js.And_Multi);
special_form__operator_relational("js!=", js.Ne,       js.Or_Multi);
special_form__operator_relational("==",   js.StrictEq, js.And_Multi);
special_form__operator_relational("!=",   js.StrictNe, js.Or_Multi);
special_form__operator_relational(">",    js.Gt,       js.And_Multi);
special_form__operator_relational(">=",   js.Ge,       js.And_Multi);
special_form__operator_relational("<",    js.Lt,       js.And_Multi);
special_form__operator_relational("<=",   js.Le,       js.And_Multi);

function special_form__operator_unary(name, operator) {
  special_form(name,
    [ o(), o("value") ],
    function (arg, node, env, context) {
      var pe = this.generate_(arg.value, env, AsExpression);
      return context.apply([pe[0], operator(pe[1])]);
    }
  );
}

special_form__operator_unary("++",         js.PreInc);
special_form__operator_unary("--",         js.PreDec);
special_form__operator_unary("<<post++>>", js.PostInc);
special_form__operator_unary("<<post-->>", js.PostDec);
special_form__operator_unary("~",          js.BitNot);
special_form__operator_unary(["!", "not"], js.Not);
special_form__operator_unary("delete",     js.Delete);
special_form__operator_unary("void",       js.Void);
special_form__operator_unary("typeof",     js.Typeof);

function special_form__operator_binary(name, operator) {
  special_form(name,
    [ name, o("lhs"), o("rhs") ],
    function (arg, node, env, context) {
      var lhs_pe = this.generate_(arg.lhs, env, AsExpression);
      var rhs_pe = this.generate_(arg.rhs, env, AsExpression);
      return context.apply([
        js.Statements(lhs_pe[0], rhs_pe[0]),
        operator(lhs_pe[1], rhs_pe[1]),
      ]);
    }
  );
}

special_form__operator_binary("in", js.In);
special_form__operator_binary("instanceof", js.Instanceof);

function special_form__operator_compound(name, operator) {
  special_form(name,
    [ name, o("lhs"), o("rhs") ],
    function (arg, node, env, context) {

      if (Node.isType(arg.lhs, "SYMBOL")) {

        // Reject "eval" and "arguments" for the lhs. See ECMA 5.1 11.13.2.
        if (Node.is(arg.lhs, "SYMBOL", "eval") || Node.is(arg.lhs, "SYMBOL", "arguments"))
          this.onerror_(CompilerMessage.Warning.assigningToConfusing(arg.lhs));
        if (env.isInvariable(arg.lhs.val))
          this.onerror_(CompilerMessage.Warning.assigningToConstant(arg.lhs));
        Node.confirmIsValidJSVarName(arg.lhs, this.onerror_);

        var pe = this.generate_(arg.rhs, env, AssignTo(js.Identifier(arg.lhs), operator));
        return context.apply(pe);

      } else {
        // i.e. obj.property, functioncall() or etc.
        // Ugh! Should write these conditions explicitly?

        var lhs_pe = this.generate_(arg.lhs, env, AsLeftHandSide);
        var rhs_pe = this.generate_(arg.rhs, env, AssignTo(lhs_pe[1], operator));
        return context.apply([
          js.Statements(lhs_pe[0], rhs_pe[0]),
          rhs_pe[1]
        ]);
      }
    }
  );
}

special_form__operator_compound("+=",   js.AddAssign);
special_form__operator_compound("-=",   js.SubAssign);
special_form__operator_compound("*=",   js.MulAssign);
special_form__operator_compound("/=",   js.DivAssign);
special_form__operator_compound("%=",   js.ModAssign);
special_form__operator_compound("<<=",  js.LShiftAssign);
special_form__operator_compound(">>=",  js.SRShiftAssign);
special_form__operator_compound(">>>=", js.URShiftAssign);
special_form__operator_compound("&=",   js.BitAndAssign);
special_form__operator_compound("|=",   js.BitOrAssign);
special_form__operator_compound("^=",   js.BitXorAssign);
special_form__operator_compound("&&=",  function (a, b) { return js.And(a, js.Assign(a, b)); });
special_form__operator_compound("||=",  function (a, b) { return js.Or(a, js.Assign(a, b)); });

special_form("new",
  [ "new", o("fun"), o("args", [0, N]) ],
  function (arg, node, env, context) {
    return generate_funcall(this, arg.fun, arg.args, js.New, env, context);
  }
);

//////////////////////////////////////////////////////////////


module.exports = klass({

  initialize: function (onerror) {
    this.onerror_ = onerror || function (e) {
      if (e.type === "error") throw CompilerMessage.FATAL;
    };
    this.compiletime_path_ = "(unknown)";
  },

  setCompileTimePath: function (filename) {
    if (filename)
      this.compiletime_path_ = filename;
    else
      this.compiletime_path_ = "(unknown)";
  },

  generate_: function (node, env, context) {
    try {
      switch (node.nodetype) {
      case "ARRAY":
        if (node.length == 0) {
          // Primitive []
          return context.apply([undefined, makeUndefined(env)]);
        } else {
          var head = node[0];
          if (Node.isType(head, "SYMBOL") && head.val in special_form_handlers) {
            return special_form_handlers[head.val].call(this, node, env, context);
          } else {
            return generate_funcall(this, node[0], node.slice(1), js.Call, env, context);
          }
        }
        break;
      case "SYMBOL":
        if (node.val in special_symbol_handlers)
          return special_symbol_handlers[node.val].call(this, node, env, context);
        if (context === AsLeftHandSide && env.isInvariable(node.val))
          this.onerror_(CompilerMessage.Warning.assigningToConstant(node));
        env.touchVariable(node.val);
        return context.apply([undefined, js.Identifier(node)]);
      case "NUM":
      case "STR":
      case "REGEXP":
        return context.apply([undefined, js.Literal(node)]);
      default:
        var err = CompilerMessage.Error.unexpected(node, "value nodetype:" + node.nodetype, "CompileError",
                                                   "A COMPILER BUG...? The given value is: " + JSON.stringify(node));
        this.onerror_(err);
        return context.apply([undefined, undefined]);
      }
    } catch (e) {
      if (e instanceof JavaScriptAST.StructuralError) {
        this.onerror_(CompilerMessage.Error.generatingInvalidJavaScript(node, e.message));
      } else {
        throw e;
      }
    }
  },

  generate: function (nodes, env) {
    var node;

    if (!nodes)
      throw Error("Logic Error: Generator#generate() requires `node' argument");
    nodes = nodes.filter(function (n) { return n });
    if (nodes.length === 0)
      return js.Nil();

    env.enterScope();
    try {
      var pes = [];
      for (var i = 0; i < nodes.length - 1; ++i) {
        node = Node.normalize(nodes[i]);
        var pe = this.generate_(node, env, Ignore(env));
        pes.push.apply(pes, pe);
      }
      node = Node.normalize(nodes[nodes.length - 1]);
      var pe = this.generate_(node, env, AsExpression);
      pes.push.apply(pes, pe);
      var vars = env.variableSymbolsInScope();
      var vars_ast = (vars.length > 0)
                        ? js.VariableStatement_NoAssign().setChildren(vars)
                        : undefined;

      var uvs = env.utilValues();
      var uvs_decl_ast = uvs.map(function (uv) { return js.VariableDeclaration(uv.symbol, uv.val); });
      var uvvars_ast = (uvs.length > 0)
                          ? js.VariableStatement_Direct().setChildren(uvs_decl_ast)
                          : undefined;
      return js.Statements(uvvars_ast, vars_ast).append(pes);
    } finally {
      env.leaveScope();
    }
  },

});

