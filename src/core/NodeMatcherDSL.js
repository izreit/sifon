// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var devel = require("./../base/devel");
var util = require("./../base/util");
var Node = require("./Node");

// DSL for Node pattern matching
// -----------------------------

// A dummy value to indicate the infinite length in the DSL.
// No rationale for the real value.  See comments of o() for usage.
var N = 1 << 28;

// [
//  "fun",
//  o("args", [0, N],
//      o("name", Symbol),
//      [o("name", Symbol), o("default")]),
//  o("body"),
//  o("catches", [0, 1]
//      [ "catch",
//        o([1, N],
//            [ o(o("name", Symbol),
//                [o("name", Symbol), o("klass")]),
//              o("body") ]) ]),
//  o("finally", [0, 1],
//      ["finally", o("body")]),
// ]
//

function MatchedNodes () {}

var partialize = function (matcher) {
  var wrapped = function (node, from, dir, limit) {
    var m = matcher(node[from]);
    if (m.fail) {
      m.node || (m.node = node[from] || node);
      return m;
    } else {
      return { value: m.value, next: from + dir };
    }
  };
  return { name: undefined, variable: false, matcher: wrapped };
};

var makePrimitiveMatcher = function (test) {
  var wrapped = function (node, from, dir, limit) {
    if (limit === 0 || test(node[from])) {
      return { value: node[from], next: from + dir };
    } else {
      return { fail: true, serious: false, node: node[from] || node };
    }
  };
  return { name: undefined, variable: false, matcher: wrapped };
}

var Any = makePrimitiveMatcher(function (node) {
  return !!node
});

var Symbol = makePrimitiveMatcher(function (node) {
  return (!!node && Node.isType(node, "SYMBOL"));
});
var SymbolButNot = function (excluded) {
  excluded = util.dictionarize(util.a_of(excluded));
  return makePrimitiveMatcher(function (node) {
    return !!node && Node.isType(node, "SYMBOL") && !(node.val in excluded);
  });
}

var o = function (name, quantity, specs___) {

  function isQuantity(v) {
    return (v && (v instanceof Array) && (v.length == 2)
              && (typeof v[0] == "number") && (typeof v[1] == "number"));
  }

  // Displace arguments. any parameters are optional...
  var args = Array.prototype.slice.call(arguments);
  name = (typeof args[0] === "string") ? args.shift() : undefined;
  quantity = (isQuantity(args[0])) ? args.shift() : [1, 1];
  specs___ = (args.length == 0) ? [Any] : args.map(function (v) {
    if (v.matcher)
      return v;
    else if (v instanceof Array)
      return partialize(makeMatcher(v));
    else
      return makePrimitiveMatcher(function (node) {
        return !!node && Node.is(node, "SYMBOL", v);
      });
  });

  var len = specs___.length;
  var min = quantity[0], max = quantity[1];
  var variable = specs___.some(function (v) { return v.variable });

  var single = function one_of(node, from, dir, limit) {
    var matched, result, serious_failed;
    for (var i = 0; i < len; ++i) {
      var spec = specs___[i]
      matched = spec.matcher(node, from, dir, limit);
      if (matched.fail) {
        serious_failed || (matched.serious && (serious_failed = matched));
        continue;
      }
      if (matched.value && spec.name) {
        result = new MatchedNodes();
        result[spec.name] = matched.value;
        return { value: result, next: matched.next };
      }
      return matched;
    }
    return serious_failed || { fail: true, serious: false, node: node[from] || node };
  }

  function optional(node, from, dir, limit) {
    limit = (limit !== undefined) ? Math.min(limit, 1) : 1;
    var matched;
    if (!node[from] || limit == 0)
      return { value: undefined, next: from };
    matched = single(node, from, dir);
    if (matched.fail && !matched.serious)
      return { value: undefined, next: from };
    return matched;
  }

  function repeated(node, from, dir, limit) {
    limit = (limit !== undefined) ? Math.min(limit, max) : max;
    var push = (dir > 0) ? "push" : "unshift";
    var ret = [], matched;
    while (node[from] && ret.length < limit) {
      matched = single(node, from, dir);
      if (matched.fail) break;
      ret[push](matched.value);
      from = matched.next;
    }
    if (matched && matched.fail && matched.serious)
      return m;
    if (ret.length < min)
      return { fail: true, serious: false, node: node[from] || node };
    return { value: ret, next: from };
  }

  var m = (min == 1 && max == 1) ? single
        : (min == 0 && max == 1) ? optional
                                 : repeated;

  return {
    name: name,
    variable: variable || (max === N),
    matcher: m,
  };
}

function makeMatcher(specs) {

  var serious_name = (typeof specs[0] === "string") ? specs[0] : false;

  function failure(serious, node) {
    return { fail: true, serious: serious, node: node };
  }

  specs = specs.map(function (spec) {
    return (typeof spec === "string")
              ? makePrimitiveMatcher(function (node) {
                  return !!node && Node.is(node, "SYMBOL", spec);
                })
              : spec;
  });

  return function (node) {
    var from = 0;
    var dir = 1;
    var spec, si, matched, result = new MatchedNodes();

    if (!node)
      return failure(false, node);
    if (specs.length === 0) {
      return (!("length" in node) || node.length > 0) ? failure(false, node)
                                                      : { value: [], next: from };
    }
    if (!("length" in node))
      return failure(false, node);

    function matchAndStore(spec, node, from, dir, limit) {
      dir || (dir = 1);
      (limit === undefined) && (limit = N);
      var matched;
      if ((matched = spec.matcher(node, from, dir, limit)).fail)
        return matched;
      if (matched.value) {
        if (spec.name) {
          result[spec.name] = matched.value;

        } else if (matched.value instanceof MatchedNodes) {
          // Matching results given by unnamed patterns are
          // *propagated* to its surrounding pattern.
          util.overwrite(result, matched.value);

        } else if (matched.value instanceof Array) {
          result = matched.value;
        }
      }
      return matched;
    }

    for (si = 0; si < specs.length; ++si) {
      spec = specs[si];
      if (spec.variable)
        break;
      if ((matched = matchAndStore(spec, node, from, 1)).fail)
        return failure(matched.serious || ((si > 0) && serious_name),
                       (matched.node || node[from] || node));
      from = matched.next;
    }

    // Control reaches here when (a) all patterns have been matched,
    // or (b) the variable-length pattern found.

    // Case (a), all patterns have been matched.
    if (si >= specs.length) {
      // The match fails when not all nodes in `node` have been consumed.
      if (from < node.length)
        return failure((si > 0) && serious_name, (node[from] || node));

      // Othewise the match succeeds.
      return { value: result };
    }

    // Case (b), the variable-length pattern found.
    // If the pattern is not the last one, we need to match backword.
    // Otherwise the pattern consumes all remaining nodes...
    var r_from = node.length - 1;
    if (spec.variable && si < specs.length - 1) {
      for (var r_si = specs.length - 1; r_si > si; --r_si) {
        spec = specs[r_si];
        if ((matched = matchAndStore(spec, node, r_from, -1)).fail)
          return failure(matched.serious || ((si > 0) && serious_name),
                         (matched.node || node[from] || node));
        r_from = matched.next;
      }

      // Consumed some nodes twice. Seems an ambiguous spec given... 
      if (from > r_from + 1) {
        devel.dthrow("NodeMatcherDSL.makeMatcher(): consumed a node twice. An ambiguous spec?");
        return failure((si > 0) && serious_name, (node[r_from] || node));
      }
    }

    // Finally, we consume the remaining nodes by the variable-length pattern.
    spec = specs[si];
    if ((matched = matchAndStore(spec, node, from, 1, ((r_from + 1) - from))).fail)
      return failure(matched.serious || ((si > 0) && serious_name),
                     (matched.node || node[from] || node));
    if (matched.next < r_from + 1)
      return failure((si > 0) && serious_name, (node[matched.next] || node));
    return { value: result };
  }
}

module.exports = {
  makeMatcher: makeMatcher,
  Symbol: Symbol,
  SymbolButNot: SymbolButNot,
  Any: Any,
  o: o,
  N: N,
};

