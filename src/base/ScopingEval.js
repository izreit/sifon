// vim: set ts=2 sts=2 sw=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License:.

var klass = require("./../base/klass");
var util = require("./../base/util");

// This small module emulates nested static/lexical scopes *dynamically*.
// Yes, dynamically.  We don't talk about dynamic scope but emulating
// static scope dynamically.  Sounds strange?  I think so too.
//
// We need to emulate static scope because, alongside compiling a source code
// to JavaScript, we also partially *inteprete* them.  Interpreting them is
// required because, of course, we have macros.  Macros (i.e. functions which
// take a form and return another form) and functions called from macros have
// to be evaluated at compile time.
// 
// To emulate static scope, we use a technique that we call "Eval over Eval."
// ((This should be explained more precisely... To be written.))

// NOTE that the emulation is not perfect. In some cases it is impossible
// to behave like the static JavaScript since we are dynamic.  For instance,
// consider the following example that includes two `x`s:
//
//     var x = "outside";
//     (function f() {
//       console.log(x);
//       var x = "inside";
//     })();
//
// If this is written statically, then `console.log(x)` will print "undefined"
// but neither "inside" nor even "outside".  Because the `x` here is a local
// variable of `f` and it is not assigned any value yet.  But when we emulate
// this code dynamically, `console.log(x)` may be evaluated before we found
// the declaration of the second, inside `x`... then it will print "outside".
// To avoid this problem, we should prohibit to refer outer variables that
// have a name used as a local variable later (NOT YET! This is a TODO).

var ScopingEval = klass({

  _static: {
    EvalError: klass({
      initialize: function (exc, code) {
        this.originalException = exc;
        this.evaluatedCode = code;
      },
    }),
  },

	initialize: function (dumps, context_eval) {
    var dump_ = !!dumps ? [] : undefined;
    context_eval || (context_eval = eval);
		this.buffer_ = [];
    this.be_scope_ = true;
		this.context_eval_ = context_eval;
    this.dump_ = dump_;
	},

  eval_: function (src) {
    try {
      return this.context_eval_(src);
    } catch (e) {
      throw new ScopingEval.EvalError(e, src);
    }
  },

	add: function (src, nonvar) {
    if (!nonvar)
      this.be_scope_ = true;
		this.buffer_.push(src);
	},

  eval: function (src) {
    if (this.buffer_.length > 0)
      this.flush();
    this.dump_ && this.dump_.push("[evaluate] " + src);
    return this.eval_(src);
  },

	flush: function () {
    this.dump_ && this.dump_.push.apply(this.dump_, this.buffer_);

		var code = this.buffer_.join("");
		this.buffer_ = [];
    if (this.be_scope_) {
      code = "(function(){" + code + " return function () { return eval(arguments[0]) } })()";
      this.be_scope_ = false;
      this.context_eval_ = this.eval_(code);
    } else if (code !== "") {
      this.eval_(code);
    }
	},

	injectScope: function () {
    this.flush();
		var ret = new ScopingEval(!!this.dump_, this.context_eval_);
    this.dump_ && this.dump_.push(ret);
    return ret;
	},

  dump: function () {
    // Ugh! Duplicated from JavaScriptAST.js... Should be commonalized in util.js?
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
    return decodeRawCode(this.rawDump_());
  },

  rawDump_: function () {
    if (!this.dump_) return "[unlogged]";
    if (this.dump_.length == 0) return "[empty]";
    return this.dump_.map(function (v) {
      return (v instanceof ScopingEval)
                ? "[scope] (<@+@><@n@>" + v.rawDump_() + "<@-@><@n@>)"
                : v;
    }).join("<@n@>");
  },

});

// FRAGMENTS OF DOCUMENTS
// ----------------------
// 
// To be written...
//
//     plenv = plenv.add("var x; x = 3;");
//     plenv = plenv.add("var y; y = 42;");
//     p =  plenv.injectScope();
//     p.add("var a = 12");
//     plenv.add("var z = function () { var a = 12; return a + x + y };");
// 
// ----
// 
//     eval((function () {
//       var x, y;
//       x = 42;
//       y = 3;
//     
//       (function () {
//         var x, y;
//         x = 42;
//         y = 3;
//       
//         return function () { return eval(arguments[0]) }
//       })
//     
//       (
//         var z = x + y;
//         if (z) y++;
//         return function () { return eval(arguments[0]) }  // NOTE no need to nest eval, if no `var`
//       )
//       return function () { return eval(arguments[0]) }
//     })())
//

module.exports = ScopingEval;

