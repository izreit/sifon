// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var ScopingEval = require("../src/base/ScopingEval");
var expect = require("chai").expect;

describe("ScopingEval", function () {

  var seval = new ScopingEval(true);

  seval.add("var x = 100, y = 'outside';");
  seval.add("x += 10;");
  seval.add("var double = function (x) { return x * 2 };");

  var se2 = seval.injectScope();
  se2.add("var z = x - 1;");
  se2.add("if (x > 100) z = double(z);");

  it("should refer the outer `y` until the inside `y` is defined", function () {
    var v = se2.eval("y");
    expect(v).equals("outside");
  });

  it("should handle a variable in an injected scope", function () {
    expect(se2.eval("z")).equals(218); 
  });

  it("should refer the inner `y`", function () {
    se2.add("var y = 'inside';");
    expect(se2.eval("y")).equals("inside");
  });

  it("should not modify the outer `y` when the inner `y` modified", function () {
    expect(seval.eval("y")).equals("outside");
  });

  var se3, se31;

  it("should refer altered `y` from inside", function () {
    se2.flush();
    se3 = seval.injectScope();
    se3.add("y = 'overwritten';");

    expect(se3.eval("y")).equals("overwritten");
  });

  it("should refer altered `y` even outside", function () {
    se3.flush();
    expect(seval.eval("y")).equals("overwritten");
  });

  it("should not modify the outer `z`", function () {
    se3.add("var z = 1;");
    se31 = se3.injectScope();
    se31.add("var z = 2;");
    se31.flush();

    expect(se3.eval("z")).equals(1);
  });

  it("should not propagate inner variable to outside", function () {
    var global_z;
    try {
      global_z = z;
      expect(seval.eval("try{ z } catch (e) { typeof e }")).equals(global_z);
    } catch (e) {
      expect(seval.eval("try{ z } catch (e) { typeof e }")).equals("object");
    }
  });


  it("should refer the previously defined variable", function () {
    var seval = new ScopingEval(true);
    seval.add("var g = 12;");
    seval.add("var s; s = 42;");
    seval.injectScope().add("var s; s = 142");
    expect(seval.eval("(function () { ++s; return s })()")).equals(43);
  });
});

