// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var devel = require("./../base/devel");
var T = require("./../base/Template");

var filename_stack = [""];

var CompilerMessage = klass({

  _static: {

    enterFile: function (filename) { filename_stack.push(filename); },
    leaveFile: function () { filename_stack.pop(); },
    currentFileName: function () { return filename_stack[filename_stack.length - 1]; },

    FATAL: { dummy: "CompilerMessage.FATAL" },  // a dummy object just for throwing.

    Error: {
      unexpected: function (loc, unexpected, type, msg) {
        (type && (type += ":")) || (type = "");
        msg || (msg = "");
        return new CompilerMessage(loc, T("### Unexpected ###. ###", type, unexpected, msg));
      },
      invalidShallowIndentInMultilineString: function (loc) {
        return new CompilerMessage(loc, "Invalid shallow indent in a multiline string.");
      },
      invalidSpecialForm: function (loc, head) {
        return new CompilerMessage(loc, T("Invalid special form `###'.", head));
      },
      invalidJSIdentifier: function (loc, name) {
        return new CompilerMessage(loc, T("`###' is not a valid JavaScript identifier", name));
      },
      tooFewArg: function (loc, name, min, real) {
        var msg = T("Too few arguments for `###' (at least ### but ### given.)", name, min, real)
        return new CompilerMessage(loc, msg);
      },
      tooManyArg: function (loc, name, max, real) {
        var msg = T("Too many arguments for `###' (at most ### but ### given.)", name, max, real);
        return new CompilerMessage(loc, msg);
      },
      tooManyDottedSymbols: function (loc) {
        return new CompilerMessage(loc,
            "More than one symbols with three-dots (...foo) appeared in a sequence.");
      },
      unintelligibleDotExpression: function (loc) {
        return new CompilerMessage(loc, "Unintelligible <<dot>> expression.");
      },
      unintelligiblePattern: function (loc, msg) {
        return new CompilerMessage(loc, "Unintelligible pattern." + (msg ? (" " + msg) : ""));
      },
      ifPatternCannotBeNested: function (loc) {
        return new CompilerMessage(loc,
            "Nested `if' pattern: The `if' patterns can only be appeared at the top-level of patterns.");
      },
      limitationProhibitsStatement: function (loc) {
        return new CompilerMessage(loc,
            "IMPLEMENTATION_LIMITATION: Expressions which will be compiled to JavaScript statements cannot appear here.");
      },
      typeofPatternNeedsStringLiteral: function (loc) {
        return new CompilerMessage(loc,
            "IMPLEMENTATION_LIMITATION: The `typeof' patterns require one or more string literals.");
      },
      nothingToBind: function (loc) {
        return new CompilerMessage(loc, "The assignment expression have nothing to bind.");
      },
      exceptionThrownIn: function (name, loc, exc, code) {
        return new CompilerMessage(loc,
            T("An exception thrown in ### says ###.###",
              name, exc, (code ? T(" The evaluated code (might include the cause): ###", code) : "")));
      },
      generatingInvalidJavaScript: function (loc, message) {
        return new CompilerMessage(loc, message);
      },
      invalidForOwn: function (loc) {
        return new CompilerMessage(loc, "Invalid for-own: use `for' for the classic `for' statements.");
      },
    },

    Warning: {
      // Added by the following warning().
    },

    Info: {
      metaCode: function (loc, code) {
       return new CompilerMessage(loc, "A `meta' special form evaluates: " + code, "info");
      },
      metaDoCode: function (loc, code) {
       return new CompilerMessage(loc, "A `meta-do' special form evaluates: " + code, "info");
      },
      macroDef: function (loc, mactype, name, code) {
       return new CompilerMessage(loc, T("Defining a ### named ###: ###", mactype, name, code), "info");
      },
    },

  },

  initialize: function (loc, message, type) {
    this.type = type || "error";
    this.message = message;
    this.line = loc.line + 1;  // +1 to make it one-based.
    this.col = loc.col + 1;    // ditto.
    this.filename = loc.filename || CompilerMessage.currentFileName();
    this.loc_ = loc;

    if (type !== "info")
      debugger;
  },

  formatLocation: function () {
    return (this.filename || "(the current compile target)")
         + ":" + (this.line || "?")
         + (this.col ? (":" + this.col) : "");
  },

  toString: function () {
    var type = (this.type === "error")   ? "ERROR"
             : (this.type === "warning") ? "WARNING"
             : (this.type === "info")    ? "INFO"
             : "(UNKNOWN_MESSAGE)";
    return this.formatLocation() + ": " + type + ": " + this.message;
  },
});

// Warnings
// --------

var warning = function (meth, name, msg) {
  CompilerMessage.Warning[meth] = function (loc) {
    return new CompilerMessage(loc, name + ": " + msg, "warning");
  };
};

warning("indentIncludingTab",
  "INDENT_INCLUDING_TAB",
  "Found an indentation including a tab character. "
    + "They will be replaced by 4 whitespace characters but not recommended."
);

warning("confusingArrayLiteral",
  "CONFUSING_ARRAY_LITERAL",
  "Array literals should be preceded by whitespaces. "
    + "Or you may need a dot? (i.e. obj.[prop])"
);

warning("unquoteFollowedBySpace",
  "UNQUOTE_FOLLOWED_BY_SPACE",
  "Unquote (,) and unquote-splicing (,@) should not be followed by whitespaces. "
    + "Or maybe you should remove whitespaces before the comma? "
    + "(i.e. you can use either of forms like [foo, bar] (as a comma) or `[foo ,bar] (as an unquote).)"
);

warning("commaNotFollowedBySpace",
  "COMMA_NOT_FOLLOWED_BY_SPACE",
  "Comma (,) should be followed by whitespaces. "
    + "Or you should add whitespaces before, if you need an unquote but not a comma. "
    + "(i.e. you can use either of forms like [foo, bar] (as a comma) or [foo ,bar] (as an unquote).)"
);

warning("assigningToConstant",
  "ASSIGNING_TO_CONSTANT",
  "Found two or more assignments to a constant (CAPITALIZED) symbol."
);

warning("forInByConstant",
  "FOR_IN_BY_CONSTANT",
  "A constant (CAPITALIZED) symbol is used as a for-in/of variable."
);

warning("assigningToConfusing",
  "ASSIGNING_TO_CONFUSING",
  "Assigning to `eval' or `arguments' is not recommended. It causes error in strict mode."
);

warning("nonLastIrrefutablePattern",
  "NON_LAST_IRREFUTABLE_PATTERN",
  "Found an irrefutable pattern which is not the last one. The following patterns never match."
);

warning("multipleIrrefutablePatterns",
  "MULTIPLE_IRREFUTABLE_PATTERNS",
  "Two ore more irrefutable patterns found."
);

module.exports = CompilerMessage;

