var Node, NodeMatcherDSL, o, N, Symbol, SymbolButNot, static_evaluators_symbol, static_evaluators, static_evaluation, static_evaluation_node, Value, constant_propagation, static_evaluate_x, static_evaluate;
Node = require("../core/Node");
NodeMatcherDSL = require("../core/NodeMatcherDSL");
if (!(NodeMatcherDSL instanceof Object && ("o" in NodeMatcherDSL) && ("N" in NodeMatcherDSL) && ("Symbol" in NodeMatcherDSL) && ("SymbolButNot" in NodeMatcherDSL))) throw "MatchFailure";
o = NodeMatcherDSL.o;
N = NodeMatcherDSL.N;
Symbol = NodeMatcherDSL.Symbol;
SymbolButNot = NodeMatcherDSL.SymbolButNot;
static_evaluators_symbol = {};
static_evaluators = [];
static_evaluation_symbol(function (symname, handler) {
  return static_evaluation_symbol[symname] = handler;
});
static_evaluation = function (spec, handler) {
  var matcher;
  if (spec instanceof Array) {
    matcher = NodeMatcherDSL.makeMatcher(spec);
  } else if ((typeof spec === "string")) {
    matcher = function (node) {
      return Node.is(node, "SYMBOL", node) ? { value: node } : {
        fail: true,
        serious: false,
        node: node
      };
    };
  } else {
    matcher = undefined;
  }
  return static_evaluators.push(function (node, env) {
    var arg, _logiclhs;
    arg = matcher(node);
    _logiclhs = !arg.fail;
    if (!_logiclhs) {
      return [
        false,
        undefined
      ];
    }
    return [
      true,
      handler(arg.value, node, env)
    ];
  });
};
static_evaluation_node = function (nodetype, handler) {
  var matcher;
  matcher = function (node) {
    return Node.isType(node, nodetype) ? { value: node } : {
      fail: true,
      serious: false,
      node: node
    };
  };
  return static_evaluators.push(function (node, env) {
    var arg, _logiclhs;
    arg = matcher(node);
    _logiclhs = !arg.fail;
    if (!_logiclhs) {
      return [
        false,
        undefined
      ];
    }
    return [
      true,
      handler(arg.value, node, env)
    ];
  });
};
Value = function (node, type, val) {
  var _logiclhs;
  _logiclhs = this instanceof Value;
  if (!_logiclhs) {
    return new Value(node, type, val);
  }
  this.node = node;
  this.type = type || "unknown";
  this.val = val || undefined;
  return this;
};
static_evaluation("true", function (arg, node, env) {
  return Value(node, "boolean", true);
});
static_evaluation("false", function (arg, node, env) {
  return Value(node, "boolean", false);
});
static_evaluation("null", function (arg, node, env) {
  return Value(node, "null", null);
});
static_evaluation_node("NUM", function (arg, node, env) {
  return Value(node, "number", Number(node.val));
});
static_evaluation_node("STR", function (arg, node, env) {
  var raw;
  raw = node.val.replace(new RegExp("^\\\"|\\\"$", "g"), "");
  return Value(node, "string", raw);
});
static_evaluation_node("SYMBOL", function (arg, node, env) {
  return Value(node);
});
constant_propagation = function (op, handler) {
  return static_evaluation([
    op,
    o("values", [
      2,
      N
    ])
  ], function (arg, node, env) {
    var sevs, ret, gaveup, head, reduced;
    arg.head = node[0];
    sevs = arg.values.map(function (a) {
      return static_evaluate_x(a, env);
    });
    if (sevs[0].type === "unknown" || sevs[1].type === "unknown") {
      return Value(node);
    }
    ret = [arg.head];
    gaveup = false;
    head = sevs.shift();
    reduced = sevs.reduce(function (acc, sev) {
      var v;
      if (gaveup) {
        return ret.push(sev.node);
      } else if ((sev.type === "unknown")) {
        ret.push(acc, sev.node);
        return gaveup = true;
      } else {
        v = handler(acc, sev.val);
        if ((typeof v !== "number") || Math.floor(v) === v) {
          return v;
        } else {
          ret.push(acc, sev.node);
          return gaveup = true;
        }
      }
    }, head.val);
    return gaveup ? Value(Node.arrayFromArray(node.line, node.col, ret)) : Value(reduced, typeof reduced, reduced);
  });
};
constant_propagation("+", function (a, b) {
  return a + b;
});
constant_propagation("-", function (a, b) {
  return a - b;
});
constant_propagation("*", function (a, b) {
  return a * b;
});
constant_propagation("/", function (a, b) {
  return a / b;
});
static_evaluation([
  o("head", "!", "not"),
  o("negatee", o("eq", [
    "==",
    o("values", [
      2,
      N
    ])
  ]), o("ne", [
    "!=",
    o("values", [
      2,
      N
    ])
  ]), o("and_or", [
    o("head", "||", "or", "&&", "and"),
    o("values", [
      2,
      N
    ])
  ]), o("general"))
], function (arg, node, env) {
  var neg, sev, _qqv, _qqv0;
  var __array_node = function (a, l, c) {
    a.nodetype = "ARRAY";
    a.line = l;
    a.col = c;
    return a;
  }, __sym = function (v, l, c) {
    return {
      nodetype: "SYMBOL",
      line: l,
      col: c,
      val: v
    };
  };
  neg = arg.negatee;
  console.log(JSON.stringify(neg));
  if (neg.eq) {
    _qqv0 = [];
    _qqv0.push(__sym("!=", 156, 36));
    _qqv0.push.apply(_qqv0, neg.eq.values);
    return static_evaluate_x(__array_node(_qqv0, 156, 36), env);
  } else if (neg.ne) {
    _qqv = [];
    _qqv.push(__sym("==", 157, 36));
    _qqv.push.apply(_qqv, neg.ne.values);
    return static_evaluate_x(__array_node(_qqv, 157, 36), env);
  } else if (neg.and_or) {
    return Value(node);
  } else if (neg.general) {
    sev = static_evaluate_x(neg.general, env);
    console.log(JSON.stringify(sev));
    if (sev.type === "unknown") {
      return Value(node);
    } else {
      return Value(__array_node([
        __sym("not", 165, 21),
        sev.node
      ], 165, 21), "boolean", !sev.val);
    }
  } else {
    return undefined;
  }
});
static_evaluate_x = function (node, env) {
  var sev, evaluated;
  evaluated = static_evaluators.some(function (se) {
    var succ, _assignee;
    _assignee = se(node, env);
    if (!(_assignee instanceof Array && _assignee.length == 2)) throw "MatchFailure";
    succ = _assignee[0];
    sev = _assignee[1];
    return succ;
  });
  if (evaluated) {
    return sev;
  }
  if (!Node.isType(node, "ARRAY")) {
    return Value(node);
  }
  return Value(node.map(function (ch) {
    return static_evaluate_x(ch, env).node;
  }));
};
static_evaluate = function (node, env) {
  var sev;
  sev = static_evaluate_x(node, env);
  return sev.node;
};
module.exports = static_evaluate;