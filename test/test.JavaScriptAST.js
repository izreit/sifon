// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var util = require("../src/base/util");
var Node = require("../src/core/Node");
var JavaScriptAST = require("../src/core/JavaScriptAST");

var expect = require("chai").expect;
var NodeUtil = require("./testutil").NodeUtil;

var js = JavaScriptAST;

var node = NodeUtil.makePseudoNode;

function sym(model) {
  return node({ ident: model });
}


var evaluating = function (jsast) {
  var evali = eval;
  var caption = jsast.codeOneliner()
                     .replace(/([\s\S]{0,48})([\s\S]*)/,
                              function(s, a, b) { return a + (b ? "..." : ""); });
  return {
    asJSON: {
      willBe: function (value) {
        it("generates " + caption, function () {
          expect(JSON.stringify(evali(jsast.codeOneliner()))).equal(value);
        });
      },
    },
    willBe: function (value) {
      it("generates " + caption, function () {
        expect(evali(jsast.codeOneliner())).equal(value);
      });
    },
  };
};


describe("JavaScriptAST", function () {

  evaluating( js.Literal(node(3)) ).willBe( 3 );

  evaluating(
    js.Add(
      js.Mul(
        js.Literal(node(3)),
        js.Literal(node(100))),
      js.Add(
        js.Literal(node(4)),
        js.Literal(node(10))))
  ).willBe(
    314
  );

  evaluating(
    js.Add_Multi(
      js.Literal(node(3)),
      js.Literal(node("foo")),
      js.Literal(node(100)))
  ).willBe(
    "3foo100"
  );

  evaluating(
    js.Typeof(
      js.Not(
        js.Literal(sym(true))))
  ).willBe(
    "boolean"
  );

  evaluating(
    js.Call(
      js.Dot( js.Identifier(sym("Math")),
              js.IdentifierName(sym("abs")) ),
      js.Arguments(
        js.Literal( node(-45) )))
  ).willBe(
    45
  );

  evaluating(
    js.Dot( js.Identifier(sym("JSON")),
            js.IdentifierName(sym("stringify")) )
  ).willBe(
    JSON.stringify
  );

  evaluating(
    js.ExpressionStatement(
      js.Comma_Multi(
        js.Literal(node("foo")),
        js.Literal(node("zoo"))))
  ).willBe(
    "zoo"
  );

  evaluating(
    js.Block(
      js.VariableStatement_NoAssign(
        js.Identifier(sym("a"))))
  ).willBe(
    undefined
  );

  evaluating(
    js.Block(
      js.VariableStatement(
        js.VariableDeclarationList(
          js.VariableDeclaration(
            js.Identifier(sym("b")),
            js.Literal(node(100))))),
      js.ExpressionStatement(
        js.Identifier(sym("b"))))
  ).willBe(
    100
  );

  evaluating(
    js.Block(
      js.VariableStatement_NoAssign(
        js.Identifier(sym("a")),
        js.Identifier(sym("b"))),
      js.ExpressionStatement(
        js.Comma_Multi(
          js.Assign(
            js.Identifier(sym("a")),
            js.Literal(node("foo"))),
          js.Assign(
            js.Identifier(sym("b")),
            js.Literal(node("zoo"))))),
      js.Add_Multi(
        js.Identifier(sym("a")),
        js.Identifier(sym("b")),
        js.Identifier(sym("a"))))
  ).willBe(
    "foozoofoo"
  );

  evaluating(
    js.Call(
      js.FunctionExpression(
        undefined,
        js.FormalParameterList(
          js.Identifier(sym("p1")),
          js.Identifier(sym("p2")),
          js.Identifier(sym("p3"))),
        js.SourceElements(
          js.DoStatement(
            js.AddAssign(
              js.Identifier(sym("p1")),
              js.Identifier(sym("p2"))),
            js.Ge(
              js.PreDec(
                js.Identifier(sym("p3"))),
              js.Literal(node(0)))),
          js.ReturnStatement(
            js.Identifier(sym("p1"))))),
      js.Arguments(
        js.Literal(node(100)),
        js.Literal(node(3)),
        js.Literal(node(10))))
  ).willBe(
    133
  );

  function functionize (name, block) {
    return js.Call(
      js.FunctionExpression(
        name ? js.Identifier(sym(name)) : undefined,
        js.FormalParameterList(),
        block),
      js.Arguments());
  }

  evaluating(
    functionize("f", js.SourceElements(
      js.VariableStatement_Direct(
        js.VariableDeclaration(
          js.Identifier(sym("foo")),
          js.Literal(node(42)))),
      js.SwitchStatement(
        js.Identifier(sym("foo")),
        js.CaseClause(
          js.Literal(node(41)),
          js.ReturnStatement(
            js.Add(
              js.Literal(node("match 1st ")),
              js.Identifier(sym("foo"))))),
        js.DefaultClause(
          js.ReturnStatement(
            js.Add(
              js.Literal(node("match default ")),
              js.Identifier(sym("foo"))))),
        js.CaseClause(
          js.Literal(node(43)),
          js.ReturnStatement(
            js.Add(
              js.Literal(node("match 2st ")),
              js.Identifier(sym("foo"))))))))
  ).willBe(
    "match default 42"
  );

  // Literal shortcut 
  evaluating(
    js.Add(
      "LiteralShortCutTest",
      42
    )
  ).willBe(
    "LiteralShortCutTest42"
  );

  // Identifier shortcut
 evaluating(
    functionize("IdentifierShortCutTest", js.SourceElements(
      js.VariableStatement_Direct(
        js.VariableDeclaration(
          sym("foo"),
          42)),
      js.ReturnStatement(
        js.Mul(
          sym("foo"),
          3))))
  ).willBe(
    42 * 3
  );

  // XXX_Multi() with one argument.
  evaluating(
    js.Div_Multi( 144 )
  ).willBe(
    144
  );

  // Regression: And_Multi has a higher precedence than Or_Multi.
  // If evaluating (0 && (0 || 1)) generates (0 && 0 || 1) which is
  // identical to ((0 && 0) || 1), the result will be 1.
  evaluating(
    js.And_Multi(
      0,
      js.Or_Multi(
        0,
        1))
  ).willBe(
    0
  );

});

