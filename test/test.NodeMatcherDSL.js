// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var util = require("../src/base/util");
var expect = require("chai").expect;

var testutil = require("./testutil");
var NodeUtil = testutil.NodeUtil;
var sym   = NodeUtil.sym,
    quote = NodeUtil.quote,
    dot   = NodeUtil.dot;

var NodeMatcherDSL = require("../src/core/NodeMatcherDSL");
var makeMatcher  = NodeMatcherDSL.makeMatcher,
    Symbol       = NodeMatcherDSL.Symbol,
    SymbolButNot = NodeMatcherDSL.SymbolButNot,
    //Any        = NodeMatcherDSL.Any,
    o            = NodeMatcherDSL.o,
    N            = NodeMatcherDSL.N;



function input(args___) {
	args___ = Array.prototype.slice.call(arguments);
	return { __input_indices__: args___ };
}

function pickInput(idxs, node) {
	var r = node;
	for (var i = 0; i < idxs.length; ++i) {
		r = r[idxs[i]];
		if (!r)
		  return { indices: idxs, undefinedAt: idxs.slice(0, i) };
	}
	return r;
}

function expandInput(o, node) {
	if (o && o.__input_indices__)
		return pickInput(o.__input_indices__, node);
	if (o && typeof o == "object")
		return util.map(o, function (v) { return expandInput(v, node); });
	return o;
}


function test(capt, spec, capt2, model, ans) {
	var node = NodeUtil.makePseudoNode(model);
	var match = (spec instanceof Array) ? makeMatcher(spec) : spec;
	var ansobj = expandInput(ans, node);

	it(capt + " matches " + capt2, function () {
		var r = match(node);
		var result = testutil.detectObjectDifference(r.value, ansobj);
		expect(result).equal("");
	});
}

function fail(capt, spec, capt2, model, ans) {
	var node = NodeUtil.makePseudoNode(model);
	var match = (spec instanceof Array) ? makeMatcher(spec) : spec;
	var ansobj = expandInput(ans, node);

	it(capt + " fails to match " + capt2, function () {
		var r = match(node);
		var result = testutil.detectObjectDifference(r, ansobj);
    if (result !== "") {
      console.log("matched " + JSON.stringify(r));
      console.log("expected " + JSON.stringify(ansobj));
    }
		expect(result).equal("");
	});
}


describe("NodeMatcherDSL", function () {

  var capt;
  var m;

  capt = "empty"
  m = makeMatcher([ o("empty", []) ]);

  fail(capt, m, "(a 1)", [
       sym("a"),
       1
    ], {
      fail: true,
      serious: false,
      node: input(0),
    }
  );

  test(capt, m, "(())", [[]], { empty: input(0) });


	capt = "('t a b c)";
	m = makeMatcher([ "t", o("a"), o("b"), o("c"), ]);

	test(capt, m, "(t 1 (a2 foo) ccd)", [
		  sym("t"),
		  1,
		  [sym("a2"), "foo"],
		  "ccd",
		], {
			a: input(1),
			b: input(2),
			c: input(3),
		});

	test(capt, m, "(t a1 (a2 foo) (ccd))", [
		  sym("t"),
			sym("a1"),
		  [sym("a2"), "foo"],
		  ["ccd"],
		], {
			a: input(1),
			b: input(2),
			c: input(3),
		});

	fail(capt, m, "(t 1 2)", [
			sym("t"),
			1,
			2,
		], {
			fail: true,
		  serious: "t",
		  node: input(),
		});

	fail(capt, m, "(f 1 2 3)", [
			sym("f"),
			1,
			2,
			3,
		], {
			fail: true,
		  serious: false,
		  node: input(0),
		});


	capt = "fun";
	m = makeMatcher([
    "fun",
    o("args",
        [ "<<tuple>>",
          o("tuple", [0, N],
              o("name", Symbol),
              [o("name", Symbol), o("default")]) ],
        o( o("name", Symbol),
           [o("name", Symbol), o("default")] ) ),
    o("body"),
    o("catches", [0, 1],
        [ "catch",
          o([0, N],
              [ o( o("name", Symbol),
                   [o("name", Symbol), o("klass")] ),
                o("body") ]) ]),
    o("finally", [0, 1],
        ["finally", o("body")]),
	]);

	test(capt, m, "(fun s (<<seq>> (+= s 3) (* s s)) (catch (e (log e))))", [
		  sym("fun"),
			sym("s"),
		  [sym("<<seq>>"),
			  [sym("+="), sym("s"), 3],
				[sym("*"), sym("s"), sym("s")]],
			[sym("catch"),
				[sym("e"),
				  [sym("log"), sym("e")]]]
		], {
			args: {
				name: input(1),
			},
			body: input(2),
			catches: [
				{
					name: input(3, 1, 0),
			    body: input(3, 1, 1),
			  },
			],
		});

	test(capt, m, "(fun (<<tuple>> (s 100) x (foo (+ a 1))) (+= s 3) (finally (e (log e))))", [
		  sym("fun"),
			[sym("<<tuple>>"),
			  [sym("s"), 100],
				sym("x"),
				[sym("foo"),
				  [sym("+"), sym("a"), 1]]],
			[sym("+="), sym("s"), 3],
			[sym("finally"),
				[sym("e"),
				  [sym("log"), sym("e")]]]
		], {
			args: {
				tuple: [
		      { name: input(1, 1, 0), default: input(1, 1, 1) },
		      { name: input(1, 2) },
		      { name: input(1, 3, 0), default: input(1, 3, 1) },
		    ],
			},
			body: input(2),
			finally: {
				body: input(3, 1),
			},
		});

	test(capt, m, "(fun (x foo) (+= s 3) (catch ((e1 eklass) 42) (e (log e))) (finally -10))", [
		  sym("fun"),
			[sym("x"), sym("foo")],
			[sym("+="), sym("s"), 3],
			[sym("catch"),
			  [[sym("e1"), sym("eklass")],
				  42],
				[sym("e"),
				  [sym("log"), sym("e")]]],
			[sym("finally"), -10]
		], {
			args: {
				name: input(1, 0),
				"default": input(1, 1),
			},
			body: input(2),
		  catches: [
		    {
					name: input(3, 1, 0, 0),
					klass: input(3, 1, 0, 1),
					body: input(3, 1, 1),
				},
		    {
					name: input(3, 2, 0),
					body: input(3, 2, 1),
				},
			],
			finally: {
				body: input(4, 1),
			},
		});

	fail(capt, m, "(fun ((foo 3) bar) (+= s 3))", [
		  sym("fun"),
			[[sym("foo"), 3],
			 sym("bar")],
			[sym("+="), sym("s"), 3],
		], {
			fail: true,
		  serious: "fun",
		  node: input(1),
		});


  capt = "('#old ...args { name:Symbol, defalutValue? } (-> ...body))";
	m = makeMatcher([
    "#old",
    o("args", [0, N],
        o("name", Symbol),
        [o("name", Symbol), o("defaultValue")]),
    o([
        "->",
        o("body", [0, N])
      ])
  ]);

  test(capt, m, '(#old -> "foo")', [
      sym("#old"),
      [sym("->"),
       "foo"]
    ], {
      args: [],
      body: [input(1, 1)]
    });

  test(capt, m, '(#old a (b 100) -> "foo")', [
      sym("#old"),
      sym("a"),
      [sym("b"),
       100],
      [sym("->"),
       "foo"]
    ], {
      args: [
        { name: input(1) },
        { name: input(2, 0), defaultValue: input(2, 1) }
      ],
      body: [input(3, 1)]
    });

  capt = "('# args (-> ...body))";
	m = makeMatcher([
    "#",
    o("args", [0, 1],
        // Unary
        o("name", Symbol),
        ["=", o("name", Symbol), o("defaultValue")],
        // N-ary
        [
          o([0, 1], "<<tuple>>"),   // Accepts both a tuple and a list.
          o("list", [0, N],
              o("name", SymbolButNot("->")),
              ["=", o("name", Symbol), o("defaultValue")])
        ]),
    o([
        "->",
        o("body", [0, N])
      ])
  ]);

  test(capt, m, '(# -> a)', [
      sym("#"),
      [sym("->"),
       sym("a")]
    ], {
      body: [input(1, 1)]
    });

  test(capt, m, '(#() -> a)', [
      sym("#"),
      [],
      [sym("->"),
       sym("a")]
    ], {
      args: { list: input(1) },
      body: [input(2, 1)]
    });

  test(capt, m, '(# a -> a)', [
      sym("#"),
      sym("a"),
      [sym("->"),
       sym("a")]
    ], {
      args: { name: input(1) },
      body: [input(2, 1)]
    });

  test(capt, m, '(# (a b) -> a .+ b)', [
      sym("#"),
      [sym("a"),
       sym("b")],
      [sym("->"),
       [sym("+"), sym("a"), sym("b")]]
    ], {
      args: {
        list: [
          { name: input(1, 0), },
          { name: input(1, 1), }
        ],
      },
      body: [input(2, 1)]
    });

  test(capt, m, '(# (a (b .= 100) c) -> a .+ b)', [
      sym("#"),
      [sym("a"),
       [sym("="), sym("b"), 100],
       sym("c")],
      [sym("->"),
       [sym("+"), sym("a"), sym("b")]]
    ], {
      args: {
        list: [
          { name: input(1, 0), },
          { name: input(1, 1, 1), defaultValue: input(1, 1, 2)},
          { name: input(1, 2), }
        ],
      },
      body: [input(2, 1)]
    });


  test(capt, m, '(#(,) -> a) (((,) may not parsible))', [
      sym("#"),
      [sym("<<tuple>>")],
      [sym("->"),
       sym("a")]
    ], {
      args: { list: [] },
      body: [input(2, 1)]
    });

  test(capt, m, '(# (a,) -> a) (((a,) may not parsible))', [
      sym("#"),
      [sym("<<tuple>>"),
       sym("a")],
      [sym("->"),
       sym("a")]
    ], {
      args: {
        list: [
          {name: input(1, 1)}
        ],
      },
      body: [input(2, 1)]
    });

  test(capt, m, '(# (a, b) -> a .+ b)', [
      sym("#"),
      [sym("<<tuple>>"),
       sym("a"),
       sym("b")],
      [sym("->"),
       [sym("+"), sym("a"), sym("b")]]
    ], {
      args: {
        list: [
          { name: input(1, 1), },
          { name: input(1, 2), }
        ],
      },
      body: [input(2, 1)]
    });

  test(capt, m, '(# (a, (b .= 100), c) -> a .+ b)', [
      sym("#"),
      [sym("<<tuple>>"),
       sym("a"),
       [sym("="), sym("b"), 100],
       sym("c")],
      [sym("->"),
       [sym("+"), sym("a"), sym("b")]]
    ], {
      args: {
        list: [
          { name: input(1, 1), },
          { name: input(1, 2, 1), defaultValue: input(1, 2, 2)},
          { name: input(1, 3), }
        ],
      },
      body: [input(2, 1)]
    });


});

