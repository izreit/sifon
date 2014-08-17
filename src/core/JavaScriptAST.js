// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var devel = require("./../base/devel");
var util = require("./../base/util");
var Template = require("./../base/Template");
var Node = require("./Node");

// JavaScriptAST
// =============
//
// An Abstract Syntax Tree (AST) for JavaScript code.
//
// Using this module ... ((to be written...))
//
// To simplify the implementation, this module doesn't have ability
// to describe several inessential constructions such as elision
// in array literals (i.e. `[foo,]` or `[0,,2]`), peculiar and confusing
// line terminators and `new` without arguments (i.e. `(new Foo)`).

var onerror_stack = [function (e) { throw e; }];

var JavaScriptAST = {

  StructuralError: klass({
    initialize: function (message) {
      this.message = message;
    },
  }),

  // TOTHINK Need not to be a stack...?
  pushOnError: function (handler) { onerror_stack.push(handler); },
  popOnError: function () { onerror_stack.pop(); },

  onerror: function (v) {
    var handler = onerror_stack[onerror_stack.length - 1];
    return handler(v);
  },

  // Actually almost all properties of this object are described
  // by a DSL defined below.  As commented later ((not yet!)),
  // expr() denots Expressions and stmt() denots Statement.

};

module.exports = JavaScriptAST;

function decodeRawCode(raw_code, indent, start_indent) {
  (!indent || indent <= 0) && (indent = 2);
  nest = start_indent || 0;
  return raw_code.replace(/<@[+-n]@>/g, function (m) {
    switch (m) {
    case "<@n@>": return "\n" + util.spacer(nest);
    case "<@+@>": nest += indent; break;
    case "<@-@>": nest -= indent; break;
    default: break;
    }
    return "";
  });
}

var ASTNodeBase = klass({

  initialize: function () {
    this.data_ = {};
    this.children_ = [];
  },

  loc: function (loc) {
    return (loc !== undefined) ? (this.loc_ = loc) : this.loc_;
  },

  name: "(base)",

  setChild: function () { devel.pureVirtual(); },

  setChildren: function (children, from_idx) {
    from_idx || (from_idx = 0);
    var that = this;
    var i = from_idx;
    children.forEach(function (v) {
        that.setChild(i, v) && i++;
    });
    return this;
  },

  append: function (ch) {
    if (ch instanceof Array)
      this.setChildren(ch, this.children_.length);
    else
      this.setChild(this.children_.length, ch);
    return this;
  },


  code: function (toplevel, indent, start_indent) {
    (toplevel === undefined) && (toplevel = true);
    return decodeRawCode(this.rawCode(undefined, toplevel), indent, start_indent);
  },

  codeOneliner: function (toplevel) {
    (toplevel === undefined) && (toplevel = true);
    return this.rawCode(undefined, toplevel).replace(/<@[+-]@>/g, "").replace(/<@n@>/g, " ");
  },


  rawCode: function () { devel.pureVirtual(); },

  rawCodeOfChild_: function (idx, toplevel) {
    toplevel || (toplevel = false);
    return this.children_[idx].rawCode(this, toplevel);
  },

  rawCodeOfChildren_: function (toplevel, force_toplevel) {
    toplevel || (toplevel = false);
    force_toplevel || (force_toplevel = false);
    return this.children_.map(function (ch, i) {
      return ch && ch.rawCode(this, force_toplevel || (toplevel && i === 0));
    });
  },


  data: function (key, val) {
    return (arguments.length < 2) ? this.data_[key] : (this.data_[key] = val);
  },

  traverse: function (context, pre, post) {
    pre || (function () { return { direction: "down" }; });
    var pre_result = pre(context, name, this, this.children_);
    if (pre_result.direction === "up") {
      return pre_result.value;
    } else {
      var children_result = this.children_.map(function (c) { return c.traverse(context, pre, post); });
      return post(context, name, this, this.children_, children_result);
    }
  },

});


// The Precedence of Expressions
// -----------------------------
//
// Based on ECMA 262 5th A.3 "Expressions."
//
var PRECEDENCE = {

  Primary: 0,

  // Note that this PRECEDENCE doesn't have properties named
  // "New", "Call" and "LeftHandSide", which correspond
  // NewExpression, CallExpression and LeftHandSideExpression
  // defined in ECMA 262 5th respectively.
  //
  // We can omit them because we never use arguments-less `new`.
  // With this restriction, these can be considered as
  // MemberExpression.  Moreover, without this restriction,
  // the order of precedence cannot be described as a totally
  // ordered set (as this object denotes), but a directed
  // acyclic graph (DAG) .
  // See ECMA 262 5th, 11.2 "Left-Hand-Side Expressions."
  Member: 1,
  // (Simply speaking, we don't want to be bothered by the
  // difference between `new Foo()` and `(new Foo)()`.  The
  // latter uses arguments-less `new`, and hence it is not
  // identical to the former but `new Foo()()`.)

  Postfix: 2,
  Unary: 3,
  Multiplicative: 4,
  Additive: 5,
  Shift: 6,
  Relational: 7,
  Equality: 8,
  BitwiseAND: 9, 
  BitwiseXOR: 10,
  BitwiseOR: 11,
  LogicalAND: 12,
  LogicalOR: 13,
  Conditional: 14,
  Assignment: 15,
  Expression: 16,

  // Although JavaScript `in` expression is defined as a
  // RelationalExpression, we here treat it separately to
  // simplify the implementation by ignoring the "NoIn"
  // non-terminals in ECMA 262 5th, such as
  // RelationalExpressionNoIn, EqualityExpressionNoIn and so on.
  // Instead of using them, we always enclose an `in`
  // expression in parentheses.  Hence the precedence for `in`
  // must be lower than any other expressions.
  In: 100,
};

// A special value: SKIPIT.
//
// When makeSpecMatcher().match() returns SKIPIT, the caller
// should perform as if `ch` does not exist.  This is not just
// only to prohibit to set `ch` to a child of `parent`, but
// also the values following `ch`, if exist, must be "shifted."
// (i.e. the first value of the values following `ch` have to
// be set to the `idx`-th child (but not `(idx + 1)`-th) of
// `parent`.)
var SKIPIT = { dummy: "SKIPIT" };
// NOTE: This is primarily for JavaScript.Statements.  For instance,
//     JavaScriptAST.Statements(undefined, JavaScriptAST.Add(1, 2))
// is better to be considered as like:
//     JavaScriptAST.Statements(JavaScriptAST.Add(1, 2))
// than the original form since the code produced by the former
// includes an unnecessary EmptyStatement corresponding `undefined`.
//     {
//       ;
//       1 + 2;
//     }

// *makeSpecMatcher*: the heart of the JavaScriptAST type validator.
//
function makeSpecMatcher(spec) {
  spec = spec.slice();

  var varlen = (spec[spec.length - 1] === "...");
  if (varlen)
    spec.pop();
  var last = spec.length - 1;

  var match = function (parent, idx, ch) {

    if (!varlen && idx > last)
      return false;

    if (ch === undefined) {
      if (!varlen || idx < last)
        return ch;

      return SKIPIT;
    }

    var s = spec[Math.min(idx, last)];

    // Inessential short-circuit: recognize and accept an abbreviated Literal or Identifier.
    if (typeof ch === "number") {
      return match(parent, idx, JavaScriptAST.Literal(Node.makeNum(ch)));
    } else if (typeof ch === "string") {
      return match(parent, idx, JavaScriptAST.Literal(Node.makeStr(ch)));
    } else if (s !== Node) {
      if (Node.isType(ch, "SYMBOL")) {
        return match(parent, idx, JavaScriptAST.Identifier(ch));
      } else if (Node.isType(ch, "NUM") || Node.isType(ch, "STR")) {
        return match(parent, idx, JavaScriptAST.Literal(ch));
      }
    }

    // Wrap a Statements object by { } if needed...
    // This is the reason for the existence of Statements.
    if (ch instanceof JavaScriptAST.Statements) {
      if ((parent instanceof JavaScriptAST.Statements) ||
          (parent instanceof JavaScriptAST.Block) ||
          (parent instanceof JavaScriptAST.SourceElements)) {
        if (ch.children_.length == 0)
          return SKIPIT;
      } else {
        ch = JavaScriptAST.Block(ch);
      }
    }

    if (typeof s === "number") {
      if (ch.prec === undefined)
        return false;
      return (ch.prec() <= s) ? ch : JavaScriptAST.Paren(ch);

    } else if (typeof s === "function") {

      // Inessential short-circuit: recognize and accept an abbreviated ExpressionStatement.
      if ((ch.prec !== undefined) && (s.prototype.prec === undefined)) {
        return JavaScriptAST.ExpressionStatement(ch);
      }

      return (ch instanceof s) && ch;

    } else if (typeof s === "string") {
      spec[Math.min(idx, last)] = JavaScriptAST[s];
      return match(parent, idx, ch);

    } else if (s === Node) {
      // Exceptional Case: Node is not a klass...
      return !!Node.isNode(ch) && ch;

    } else {
      return false;
    }
  };

  return {
    match: match,
    nth: function (idx) {
      return spec[Math.min(idx, last)];
    },
  };
}

// DSL
// ---

function createASTNode(name, base_klass, prec, children_spec, codifier) {
  base_klass || (base_klass = ASTNodeBase);
  (typeof base_klass == "string") && (base_klass = JavaScriptAST[base_klass]);

  var spec_matcher = makeSpecMatcher(children_spec);

  var theKlass = klass({

    baseKlass: base_klass,

    initialize: function ctor(args___) {
      var that = (this instanceof ctor) ? this : Object.create(ctor.prototype);
      args___ = Array.prototype.slice.call(arguments);
      base_klass.call(that);
      that.setChildren(args___);
      return that;
    },

    prec: (typeof prec === "number")
             ? (function () { return prec; })
             : prec,

    rawCode: (function () {
      var impl;
      if (typeof codifier == "string") {
        var templ = new Template(codifier);
        impl = function codifier_wrapper (parent, toplevel) {
          return templ.makeWithArray(this.rawCodeOfChildren_(toplevel, false));
        };
      } else {
        impl = codifier;
      }
      //*
      return impl;
      /*/
      return function () {
        return Template("<###><@+@><@n@>###</###><@-@><@n@>", name, impl.call(this), name);
      };
      ///*/
    })(),

    setChild: function (idx, ch) {
      var matched = spec_matcher.match(this, idx, ch);
      if (matched === false) {

        // Throwing debug info: WILL BE REMOVED.
        //
        // function stringifyNode(v) { return v !== Node ? v : "(Node)"; }
        // var message = Template("Invalid argument for ###::setChild(###, ###). / "
        //                         + "  (DebugInfo: spec_matcher says it requires ###) / "
        //                         + "  (DebugInfo: given specs ###)",
        //                           name, idx,
        //                           (ch.code ? "<code: " + ch.code() + ">" : JSON.stringify(ch)),
        //                           stringifyNode(spec_matcher.nth(idx)),
        //                           JSON.stringify(children_spec.map(stringifyNode)));

        var ii = (idx + 1) + ([, "st", "nd", "rd"][(idx + 1) > 20 ? ((idx + 1) % 10) : (idx + 1)] || "th");
        var message = Template("The ### child of ### cannot be ###.",
                               ii, name, (ch.code ? "<code: " + ch.code() + ">" : JSON.stringify(ch)));
        throw new JavaScriptAST.StructuralError(message);

      } else if (matched === SKIPIT) {
        return false;
      }
      this.children_[idx] = matched;
      return true;
    },

  });

  JavaScriptAST[name] = theKlass;
  return theKlass;
}

function joins(sep, wrap) {
  if (wrap)
    return function (parent, toplevel) {
      return Template(wrap, this.rawCodeOfChildren_(toplevel).join(sep));
    };
  else
    return function (parent, toplevel) {
      return this.rawCodeOfChildren_(toplevel).join(sep);
    };
}


function abstractnode(name, base) {
  base || (base = ASTNodeBase);
  (typeof base == "string") && (base = JavaScriptAST[base]);
  var ret = klass({
    baseKlass: base,
    name: name,
    initialize: function () {
      base.call(this);
    },
  });
  JavaScriptAST[name] = ret;
  return ret;
}

function node_with_base(name, base, children_spec, codifier) {
  return createASTNode(name, base, undefined, children_spec, codifier);
}

function node(name, children_spec, codifier) {
  return node_with_base(name, undefined, children_spec, codifier);
}

function stmt(name, children_spec, codifier) {
  return node_with_base(name, "Statement", children_spec, codifier);
}

function expr(name, prec, children_spec, codifier) {
  return createASTNode(name, undefined, prec, children_spec, codifier);
}



var p = PRECEDENCE;


// Expressions
// -----------

expr("Identifier", p.Primary, [Node], function () {
  //Node.confirmIsJSIdentifier(this.children_[0], JavaScriptAST.onerror);
  return this.children_[0].val;
});

expr("Literal", p.Primary, [Node], function () {
  return this.children_[0].val;
});

expr("ArrayLiteral",
  p.Primary,
  [p.Expression, "..."],
  function () {
    var len = this.children_.length;
    return len === 0 ? "[]"
         : len === 1 ? Template("[###]", this.rawCodeOfChild_(0))
                     : Template("[<@+@><@n@>###<@-@><@n@>]",
                                this.rawCodeOfChildren_().join(",<@n@>"));
  }
);

expr("ObjectLiteral",
  p.Primary,
  ["PropertyAssignment", "..."],
  function (parent, toplevel) {
    var len = this.children_.length;
    var ret = len === 0 ? "{}"
            : len === 1 ? Template("{ ### }", this.rawCodeOfChild_(0))
                        : Template("{<@+@><@n@>###<@-@><@n@>}",
                                   this.rawCodeOfChildren_().join(",<@n@>"));
    return toplevel ? Template("(###)", ret) : ret;
  }
);

// The child of Paren is p.In, because parentheses wrap up any
// expressions, even the `in` operator, which we treat as
// lower-precedence expressions than general expressions.
// See comments in the above PRECEDENCE.
expr("Paren",
  p.Primary,
  [p.In],
  joins("", "(###)")
);

node("PropertyAssignment",
  [Node, p.Assignment],
  function () {
    // todo? getter/setter literals
    var name = Node.toPropertyName(this.children_[0]);
    var value = this.children_[1].rawCode();
    return Template("###: ###", name, value);
  });

expr("FunctionExpression",
  p.Primary,
  ["Identifier", "FormalParameterList", "SourceElements"],
  function (parent, toplevel) {
    var anonymous = !this.children_[0];
    var ret = Template("function ###(###) {<@+@><@n@>###<@-@><@n@>}",
                       (anonymous ? "" : this.rawCodeOfChild_(0)),
                       this.rawCodeOfChild_(1),
                       this.rawCodeOfChild_(2));
    return toplevel ? Template("(###)", ret) : ret;
  }
);

node("FormalParameterList",
  ["Identifier", "..."],
  joins(", ")
);

expr("Bracket", p.Member, [p.Member, p.Expression], "###[###]");
expr("Dot", p.Member, [p.Member, "IdentifierName"], "###.###");
expr("New", p.Member, [p.Member, "Arguments"], "new ###(###)");
expr("Call", p.Member, [p.Member, "Arguments"], "###(###)");

node("IdentifierName", [Node], function () {
  return this.children_[0].val;
}),

node("Arguments", [p.Assignment, "..."], joins(", "));

expr("PostInc", p.Postfix, [p.Member], "###++");
expr("PostDec", p.Postfix, [p.Member], "###--");
  
expr("Delete", p.Unary, [p.Unary], "delete ###");
expr("Void", p.Unary, [p.Unary], "void ###");
expr("Typeof", p.Unary, [p.Unary], "typeof ###");
expr("PreInc", p.Unary, [p.Unary], "++###");
expr("PreDec", p.Unary, [p.Unary], "--###");
expr("UnaryPlus", p.Unary, [p.Unary], "+###");
expr("UnaryMinus", p.Unary, [p.Unary], "-###");
expr("BitNot", p.Unary, [p.Unary], "~###");
expr("Not", p.Unary, [p.Unary], "!###");

expr("Mul", p.Multiplicative, [p.Multiplicative, p.Unary], "### * ###");
expr("Div", p.Multiplicative, [p.Multiplicative, p.Unary], "### / ###");
expr("Mod", p.Multiplicative, [p.Multiplicative, p.Unary], "### % ###");

expr("Add", p.Additive, [p.Additive, p.Multiplicative], "### + ###");
expr("Sub", p.Additive, [p.Additive, p.Multiplicative], "### - ###");

expr("LSfhit", p.Shift, [p.Shift, p.Additive], "### << ###");
expr("SRShift", p.Shift, [p.Shift, p.Additive], "### >> ###");
expr("URShift", p.Shift, [p.Shift, p.Additive], "### >>> ###");
  
expr("Lt", p.Relational, [p.Relational, p.Shift], "### < ###");
expr("Gt", p.Relational, [p.Relational, p.Shift], "### > ###");
expr("Le", p.Relational, [p.Relational, p.Shift], "### <= ###");
expr("Ge", p.Relational, [p.Relational, p.Shift], "### >= ###");
expr("Instanceof", p.Relational, [p.Relational, p.Shift], "### instanceof ###");
  
expr("In", p.In, [p.Relational, p.Shift], "### in ###");
  
expr("Eq", p.Equality, [p.Equality, p.Relational], "### == ###");
expr("Ne", p.Equality, [p.Equality, p.Relational], "### != ###");
expr("StrictEq", p.Equality, [p.Equality, p.Relational], "### === ###");
expr("StrictNe", p.Equality, [p.Equality, p.Relational], "### !== ###");
  
expr("BitAnd", p.BitwiseAND, [p.BitwiseAND, p.Equality], "### & ###");
expr("BitXor", p.BitwiseXOR, [p.BitwiseXOR, p.BitwiseAND], "### ^ ###");
expr("BitOr", p.BitwiseOR,  [p.BitwiseOR, p.BitwiseXOR], "### | ###");
  
expr("And", p.LogicalAND, [p.LogicalAND, p.BitwiseOR], "### && ###");
expr("Or", p.LogicalOR,  [p.LogicalOR, p.LogicalAND], "### || ###");
  
expr("Conditional", p.Conditional, [p.LogicalOR, p.Assignment, p.Assignment], "### ? ### : ###");
  
expr("Assign", p.Assignment, [p.Member, p.Assignment], "### = ###");
expr("AddAssign", p.Assignment, [p.Member, p.Assignment], "### += ###");
expr("SubAssign", p.Assignment, [p.Member, p.Assignment], "### -= ###");
expr("MulAssign", p.Assignment, [p.Member, p.Assignment], "### *= ###");
expr("DivAssign", p.Assignment, [p.Member, p.Assignment], "### /= ###");
expr("ModAssign", p.Assignment, [p.Member, p.Assignment], "### %= ###");
expr("LShiftAssign", p.Assignment, [p.Member, p.Assignment], "### <<= ###");
expr("SRShiftAssign", p.Assignment, [p.Member, p.Assignment], "### >>= ###");
expr("URShiftAssign", p.Assignment, [p.Member, p.Assignment], "### >>>= ###");
expr("BitAndAssign", p.Assignment, [p.Member, p.Assignment], "### &= ###");
expr("BitXorAssign", p.Assignment, [p.Member, p.Assignment], "### ^= ###");
expr("BitOrAssign", p.Assignment, [p.Member, p.Assignment], "### |= ###");
  
expr("Comma", p.Expression, [p.Expression, p.Assignment], "###, ###");

// Expression ('multiple' versions of binary operators)
// -----------------------------------------------------

function childItselfOr(prec) {
  return function () {
    return (this.children_.length === 1) ? this.children_[0].prec() : prec;
  }
}

expr("Mul_Multi",     childItselfOr(p.Multiplicative), [p.Unary, "..."],          joins(" * "));
expr("Div_Multi",     childItselfOr(p.Multiplicative), [p.Unary, "..."],          joins(" / "));
expr("Mod_Multi",     childItselfOr(p.Multiplicative), [p.Unary, "..."],          joins(" % "));
expr("Add_Multi",     childItselfOr(p.Additive),       [p.Multiplicative, "..."], joins(" + "));
expr("Sub_Multi",     childItselfOr(p.Additive),       [p.Multiplicative, "..."], joins(" - "));
expr("LSfhit_Multi",  childItselfOr(p.Shift),          [p.Additive, "..."],       joins(" << "));
expr("SRShift_Multi", childItselfOr(p.Shift),          [p.Additive, "..."],       joins(" >> "));
expr("URShift_Multi", childItselfOr(p.Shift),          [p.Additive, "..."],       joins(" >>> "));
expr("BitAnd_Multi",  childItselfOr(p.BitwiseAND),     [p.Equality, "..."],       joins(" & "));
expr("BitXor_Multi",  childItselfOr(p.BitwiseXOR),     [p.BitwiseAND, "..."],     joins(" ^ "));
expr("BitOr_Multi",   childItselfOr(p.BitwiseOR),      [p.BitwiseXOR, "..."],     joins(" | "));
expr("And_Multi",     childItselfOr(p.LogicalAND),     [p.BitwiseOR, "..."],      joins(" && "));
expr("Or_Multi",      childItselfOr(p.LogicalOR),      [p.LogicalAND, "..."],     joins(" || "));
expr("Comma_Multi",   childItselfOr(p.Expression),     [p.Assignment, "..."],     joins(", "));

// Statement
// ---------

abstractnode("SourceElement");
abstractnode("Statement", "SourceElement");

// Statements: not in the spec.

stmt("Statements",
  ["Statement", "..."],
  function (parent) {
    var rcs = this.rawCodeOfChildren_(false, true);
    if (rcs.length == 0)
      return ";";
    return rcs.join("<@n@>");
  }
);

// Block

stmt("Block",
  ["Statement", "..."],
  function () {
    var rcs = this.rawCodeOfChildren_(false, true);
    //if (rcs.length == 0)
    //  return ";";
    return Template("{<@+@><@n@>###<@-@><@n@>}", rcs.join("<@n@>"));
  }
);

// VariableStatement

stmt("VariableStatement",
  ["VariableDeclarationList"],
  "var ###;"
);

node("VariableDeclarationList",
  ["VariableDeclaration", "..."],
  joins(", ")
);

node("VariableDeclaration",
  ["Identifier", p.Assignment],
  function () {
    if (this.children_[1]) {
      return Template("### = ###", this.rawCodeOfChild_(0), this.rawCodeOfChild_(1));
    } else {
      return Template("###", this.rawCodeOfChild_(0));
    }
  }
);

stmt("VariableStatement_Direct", ["VariableDeclaration", "..."], joins(", ", "var ###;"));
stmt("VariableStatement_NoAssign", ["Identifier", "..."], joins(", ", "var ###;"));

// EmptyStatement
stmt("EmptyStatement", [], ";");

// Nil: Not in the spec. Just for dummy.
stmt("Nil", [], "");

// ExpressionStatement
stmt("ExpressionStatement", [p.Expression], "###;");

// IfStatement
stmt("IfStatement",
  [p.In, "Statement", "Statement"],
  function () {
    var rc2 = (this.children_[2]) && this.rawCodeOfChild_(2);
    if (rc2 && rc2 !== ";") {  // Ugh! Ad-hoc condition...
      var indent_then = !(this.children_[1] instanceof JavaScriptAST.Block);
      var indent_else = !(this.children_[2] instanceof JavaScriptAST.Block
                          || this.children_[2] instanceof JavaScriptAST.IfStatement);
      var rc1 = this.rawCodeOfChild_(1);
      if (rc1 !== ";") {  // Ugh! Ad-hoc condition...
        return Template("if (###) " + (indent_then ? "<@+@><@n@>###<@-@><@n@>" : "### ")
                          + "else " + (indent_else ? "<@+@><@n@>###<@-@>" : "###"),
                        this.rawCodeOfChild_(0), rc1, this.rawCodeOfChild_(2));
      } else {
        return Template("if (###) " + (indent_else ? "<@+@><@n@>###<@-@>" : "###"),
                        JavaScriptAST.Not(this.children_[0]).rawCode(this, false),
                        this.rawCodeOfChild_(2));
      }
    } else {
      return Template("if (###) ###",
                      this.rawCodeOfChild_(0),
                      this.rawCodeOfChild_(1))
    }
  }
);

// IterationStatement

stmt("DoStatement",
  ["Statement", p.Expression],
  "do ### while (###);"
);
stmt("WhileStatement",
  [p.Expression, "Statement"],
  "while (###) ###"
);

stmt("ForStatement",
  [p.Expression, p.Expression, p.Expression, "Statement"],
  function () {
    var self = this;
    var chs = this.children_.map(function (ch, i) { return ch ? self.rawCodeOfChild_(i) : ""; });

    if (!chs[0] && !chs[1] && !chs[2])
      return Template("for (;;) ###", chs[3]);
    return (new Template("for (###; ###; ###) ###")).makeWithArray(chs);
  }
);
stmt("ForVarStatement",
  ["VariableDeclarationList", p.Expression, p.Expression, "Statement"],
  function () {
    var self = this;
    var chs = this.children_.map(function (ch, i) { return ch ? self.rawCodeOfChild_(i) : ""; });

    if (!chs[0] && !chs[1] && !chs[2])
      return Template("for (;;) ###", chs[3]);
    return (new Template("for (var ###; ###; ###) ###")).makeWithArray(chs);
  }
);

stmt("ForInStatement",
  [p.Member, p.Expression, "Statement"],
  "for (### in ###) ###"
);
stmt("ForVarInStatement",
  ["VariableDeclaration", p.Expression, "Statement"],
  "for (var ### in ###) ###"
);

// JumpStatement
//
// Not in the spec.
// An Abstract node to group `continue`, `break`, `throw` and `return` statement.
//
abstractnode("JumpStatement", "Statement");

// ContinueStatement
node_with_base("ContinueStatement",
  "JumpStatement",
  ["Identifier"],
  function () {
    return this.children_[0]
              ? Template("continue ###;", this.rawCodeOfChild_(0))
              : "continue;";
  }
);
  
// BreakStatement
node_with_base("BreakStatement",
  "JumpStatement",
  ["Identifier"],
  function () {
    return this.children_[0]
              ? Template("break ###;", this.rawCodeOfChild_(0))
              : "break;";
  }
);

// ReturnStatement
node_with_base("ReturnStatement",
  "JumpStatement",
  [p.Expression],
  function () {
    return this.children_[0]
              ? Template("return ###;", this.rawCodeOfChild_(0))
              : "return;";
  }
);

// WithStatement
stmt("WithStatement", [p.Expression, "Statement"], "with (###) ###");

// LabelledStatement
stmt("LabelledStatement", ["Identifier", "Statement"], "###: ###");

// SwitchStatement

stmt("SwitchStatement",
  [p.Expression, "CaseOrDefaultClause", "..."],
  function () {
    var rcs = this.rawCodeOfChildren_();
    var head = rcs.shift();
    return Template("switch (###) {<@n@>###<@n@>}", head, rcs.join("<@n@>"));
  }
);

abstractnode("CaseOrDefaultClause");

node_with_base("CaseClause",
  "CaseOrDefaultClause",
  [p.Expression, "Statement", "..."],
  function () {
    var rcs = this.rawCodeOfChildren_();
    var head = rcs.shift();
    return Template("case ###:<@+@><@n@>###<@-@>", head, rcs.join("<@n@>"));
  }
);

node_with_base("DefaultClause",
  "CaseOrDefaultClause",
  ["Statement", "..."],
  joins("<@n@>", "default:<@+@><@n@>###<@-@>")
);

// ThrowStatement
node_with_base("ThrowStatement", "JumpStatement", [p.Expression], "throw ###;");

// TryStatement

stmt("TryStatement",
  ["Block", "Catch", "Finally"],
  function () {
    var b = this.rawCodeOfChild_(0);
    var c = this.children_[1] ? this.rawCodeOfChild_(1) : "";
    var f = this.children_[2] ? this.rawCodeOfChild_(2) : "";
    return (c === "") ? Template("try ### ###", b, f)
         : (f === "") ? Template("try ### ###", b, c)
                      : Template("try ### ### ###", b, c, f);
  }
);

stmt("TryCatchStatement", ["Block", "Catch"], "try ### ###");
stmt("TryFinallyStatement", ["Block", "Finally"], "try ### ###"); 
stmt("TryCatchFinallyStatement", ["Block", "Catch", "Finally"], "try ### ### ###");

node("Catch", ["Identifier", "Block"], "catch (###) ###");
node("Finally", ["Block"], "finally ###");

// DebuggerStatement
stmt("DebuggerStatement", [], "debugger;");


// Program
// -------

node("SourceElements",
  ["SourceElement", "..."],
  function (parent, toplevel) {
    return this.rawCodeOfChildren_(toplevel, true).join("<@n@>");
  }
);

node_with_base("FunctionDeclaration",
  "SourceElement",
  ["Identifier", "FormalParameterList", "SourceElements"],
  function () {
    return Template("function ###(###) {<@+@><@n@>###<@-@><@n@>}",
                    this.rawCodeOfChild_(0),
                    this.rawCodeOfChild_(1),
                    this.rawCodeOfChild_(2));
  }
);

node("Program", ["SourceElements"], "###");

