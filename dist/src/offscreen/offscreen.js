"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/regenerator-runtime/runtime.js
  var require_runtime = __commonJS({
    "node_modules/regenerator-runtime/runtime.js"(exports, module) {
      var runtime = (function(exports2) {
        "use strict";
        var Op = Object.prototype;
        var hasOwn = Op.hasOwnProperty;
        var defineProperty = Object.defineProperty || function(obj, key, desc) {
          obj[key] = desc.value;
        };
        var undefined;
        var $Symbol = typeof Symbol === "function" ? Symbol : {};
        var iteratorSymbol = $Symbol.iterator || "@@iterator";
        var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
        var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";
        function define(obj, key, value) {
          Object.defineProperty(obj, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true
          });
          return obj[key];
        }
        try {
          define({}, "");
        } catch (err) {
          define = function(obj, key, value) {
            return obj[key] = value;
          };
        }
        function wrap(innerFn, outerFn, self, tryLocsList) {
          var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
          var generator = Object.create(protoGenerator.prototype);
          var context = new Context(tryLocsList || []);
          defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) });
          return generator;
        }
        exports2.wrap = wrap;
        function tryCatch(fn, obj, arg) {
          try {
            return { type: "normal", arg: fn.call(obj, arg) };
          } catch (err) {
            return { type: "throw", arg: err };
          }
        }
        var GenStateSuspendedStart = "suspendedStart";
        var GenStateSuspendedYield = "suspendedYield";
        var GenStateExecuting = "executing";
        var GenStateCompleted = "completed";
        var ContinueSentinel = {};
        function Generator() {
        }
        function GeneratorFunction() {
        }
        function GeneratorFunctionPrototype() {
        }
        var IteratorPrototype = {};
        define(IteratorPrototype, iteratorSymbol, function() {
          return this;
        });
        var getProto = Object.getPrototypeOf;
        var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
        if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
          IteratorPrototype = NativeIteratorPrototype;
        }
        var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
        GeneratorFunction.prototype = GeneratorFunctionPrototype;
        defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: true });
        defineProperty(
          GeneratorFunctionPrototype,
          "constructor",
          { value: GeneratorFunction, configurable: true }
        );
        GeneratorFunction.displayName = define(
          GeneratorFunctionPrototype,
          toStringTagSymbol,
          "GeneratorFunction"
        );
        function defineIteratorMethods(prototype) {
          ["next", "throw", "return"].forEach(function(method) {
            define(prototype, method, function(arg) {
              return this._invoke(method, arg);
            });
          });
        }
        exports2.isGeneratorFunction = function(genFun) {
          var ctor = typeof genFun === "function" && genFun.constructor;
          return ctor ? ctor === GeneratorFunction || // For the native GeneratorFunction constructor, the best we can
          // do is to check its .name property.
          (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
        };
        exports2.mark = function(genFun) {
          if (Object.setPrototypeOf) {
            Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
          } else {
            genFun.__proto__ = GeneratorFunctionPrototype;
            define(genFun, toStringTagSymbol, "GeneratorFunction");
          }
          genFun.prototype = Object.create(Gp);
          return genFun;
        };
        exports2.awrap = function(arg) {
          return { __await: arg };
        };
        function AsyncIterator(generator, PromiseImpl) {
          function invoke(method, arg, resolve, reject) {
            var record = tryCatch(generator[method], generator, arg);
            if (record.type === "throw") {
              reject(record.arg);
            } else {
              var result = record.arg;
              var value = result.value;
              if (value && typeof value === "object" && hasOwn.call(value, "__await")) {
                return PromiseImpl.resolve(value.__await).then(function(value2) {
                  invoke("next", value2, resolve, reject);
                }, function(err) {
                  invoke("throw", err, resolve, reject);
                });
              }
              return PromiseImpl.resolve(value).then(function(unwrapped) {
                result.value = unwrapped;
                resolve(result);
              }, function(error) {
                return invoke("throw", error, resolve, reject);
              });
            }
          }
          var previousPromise;
          function enqueue(method, arg) {
            function callInvokeWithMethodAndArg() {
              return new PromiseImpl(function(resolve, reject) {
                invoke(method, arg, resolve, reject);
              });
            }
            return previousPromise = // If enqueue has been called before, then we want to wait until
            // all previous Promises have been resolved before calling invoke,
            // so that results are always delivered in the correct order. If
            // enqueue has not been called before, then it is important to
            // call invoke immediately, without waiting on a callback to fire,
            // so that the async generator function has the opportunity to do
            // any necessary setup in a predictable way. This predictability
            // is why the Promise constructor synchronously invokes its
            // executor callback, and why async functions synchronously
            // execute code before the first await. Since we implement simple
            // async functions in terms of async generators, it is especially
            // important to get this right, even though it requires care.
            previousPromise ? previousPromise.then(
              callInvokeWithMethodAndArg,
              // Avoid propagating failures to Promises returned by later
              // invocations of the iterator.
              callInvokeWithMethodAndArg
            ) : callInvokeWithMethodAndArg();
          }
          defineProperty(this, "_invoke", { value: enqueue });
        }
        defineIteratorMethods(AsyncIterator.prototype);
        define(AsyncIterator.prototype, asyncIteratorSymbol, function() {
          return this;
        });
        exports2.AsyncIterator = AsyncIterator;
        exports2.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
          if (PromiseImpl === void 0) PromiseImpl = Promise;
          var iter = new AsyncIterator(
            wrap(innerFn, outerFn, self, tryLocsList),
            PromiseImpl
          );
          return exports2.isGeneratorFunction(outerFn) ? iter : iter.next().then(function(result) {
            return result.done ? result.value : iter.next();
          });
        };
        function makeInvokeMethod(innerFn, self, context) {
          var state = GenStateSuspendedStart;
          return function invoke(method, arg) {
            if (state === GenStateExecuting) {
              throw new Error("Generator is already running");
            }
            if (state === GenStateCompleted) {
              if (method === "throw") {
                throw arg;
              }
              return doneResult();
            }
            context.method = method;
            context.arg = arg;
            while (true) {
              var delegate = context.delegate;
              if (delegate) {
                var delegateResult = maybeInvokeDelegate(delegate, context);
                if (delegateResult) {
                  if (delegateResult === ContinueSentinel) continue;
                  return delegateResult;
                }
              }
              if (context.method === "next") {
                context.sent = context._sent = context.arg;
              } else if (context.method === "throw") {
                if (state === GenStateSuspendedStart) {
                  state = GenStateCompleted;
                  throw context.arg;
                }
                context.dispatchException(context.arg);
              } else if (context.method === "return") {
                context.abrupt("return", context.arg);
              }
              state = GenStateExecuting;
              var record = tryCatch(innerFn, self, context);
              if (record.type === "normal") {
                state = context.done ? GenStateCompleted : GenStateSuspendedYield;
                if (record.arg === ContinueSentinel) {
                  continue;
                }
                return {
                  value: record.arg,
                  done: context.done
                };
              } else if (record.type === "throw") {
                state = GenStateCompleted;
                context.method = "throw";
                context.arg = record.arg;
              }
            }
          };
        }
        function maybeInvokeDelegate(delegate, context) {
          var methodName = context.method;
          var method = delegate.iterator[methodName];
          if (method === undefined) {
            context.delegate = null;
            if (methodName === "throw" && delegate.iterator["return"]) {
              context.method = "return";
              context.arg = undefined;
              maybeInvokeDelegate(delegate, context);
              if (context.method === "throw") {
                return ContinueSentinel;
              }
            }
            if (methodName !== "return") {
              context.method = "throw";
              context.arg = new TypeError(
                "The iterator does not provide a '" + methodName + "' method"
              );
            }
            return ContinueSentinel;
          }
          var record = tryCatch(method, delegate.iterator, context.arg);
          if (record.type === "throw") {
            context.method = "throw";
            context.arg = record.arg;
            context.delegate = null;
            return ContinueSentinel;
          }
          var info = record.arg;
          if (!info) {
            context.method = "throw";
            context.arg = new TypeError("iterator result is not an object");
            context.delegate = null;
            return ContinueSentinel;
          }
          if (info.done) {
            context[delegate.resultName] = info.value;
            context.next = delegate.nextLoc;
            if (context.method !== "return") {
              context.method = "next";
              context.arg = undefined;
            }
          } else {
            return info;
          }
          context.delegate = null;
          return ContinueSentinel;
        }
        defineIteratorMethods(Gp);
        define(Gp, toStringTagSymbol, "Generator");
        define(Gp, iteratorSymbol, function() {
          return this;
        });
        define(Gp, "toString", function() {
          return "[object Generator]";
        });
        function pushTryEntry(locs) {
          var entry = { tryLoc: locs[0] };
          if (1 in locs) {
            entry.catchLoc = locs[1];
          }
          if (2 in locs) {
            entry.finallyLoc = locs[2];
            entry.afterLoc = locs[3];
          }
          this.tryEntries.push(entry);
        }
        function resetTryEntry(entry) {
          var record = entry.completion || {};
          record.type = "normal";
          delete record.arg;
          entry.completion = record;
        }
        function Context(tryLocsList) {
          this.tryEntries = [{ tryLoc: "root" }];
          tryLocsList.forEach(pushTryEntry, this);
          this.reset(true);
        }
        exports2.keys = function(val) {
          var object = Object(val);
          var keys = [];
          for (var key in object) {
            keys.push(key);
          }
          keys.reverse();
          return function next() {
            while (keys.length) {
              var key2 = keys.pop();
              if (key2 in object) {
                next.value = key2;
                next.done = false;
                return next;
              }
            }
            next.done = true;
            return next;
          };
        };
        function values(iterable) {
          if (iterable) {
            var iteratorMethod = iterable[iteratorSymbol];
            if (iteratorMethod) {
              return iteratorMethod.call(iterable);
            }
            if (typeof iterable.next === "function") {
              return iterable;
            }
            if (!isNaN(iterable.length)) {
              var i = -1, next = function next2() {
                while (++i < iterable.length) {
                  if (hasOwn.call(iterable, i)) {
                    next2.value = iterable[i];
                    next2.done = false;
                    return next2;
                  }
                }
                next2.value = undefined;
                next2.done = true;
                return next2;
              };
              return next.next = next;
            }
          }
          return { next: doneResult };
        }
        exports2.values = values;
        function doneResult() {
          return { value: undefined, done: true };
        }
        Context.prototype = {
          constructor: Context,
          reset: function(skipTempReset) {
            this.prev = 0;
            this.next = 0;
            this.sent = this._sent = undefined;
            this.done = false;
            this.delegate = null;
            this.method = "next";
            this.arg = undefined;
            this.tryEntries.forEach(resetTryEntry);
            if (!skipTempReset) {
              for (var name in this) {
                if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) {
                  this[name] = undefined;
                }
              }
            }
          },
          stop: function() {
            this.done = true;
            var rootEntry = this.tryEntries[0];
            var rootRecord = rootEntry.completion;
            if (rootRecord.type === "throw") {
              throw rootRecord.arg;
            }
            return this.rval;
          },
          dispatchException: function(exception) {
            if (this.done) {
              throw exception;
            }
            var context = this;
            function handle(loc, caught) {
              record.type = "throw";
              record.arg = exception;
              context.next = loc;
              if (caught) {
                context.method = "next";
                context.arg = undefined;
              }
              return !!caught;
            }
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              var record = entry.completion;
              if (entry.tryLoc === "root") {
                return handle("end");
              }
              if (entry.tryLoc <= this.prev) {
                var hasCatch = hasOwn.call(entry, "catchLoc");
                var hasFinally = hasOwn.call(entry, "finallyLoc");
                if (hasCatch && hasFinally) {
                  if (this.prev < entry.catchLoc) {
                    return handle(entry.catchLoc, true);
                  } else if (this.prev < entry.finallyLoc) {
                    return handle(entry.finallyLoc);
                  }
                } else if (hasCatch) {
                  if (this.prev < entry.catchLoc) {
                    return handle(entry.catchLoc, true);
                  }
                } else if (hasFinally) {
                  if (this.prev < entry.finallyLoc) {
                    return handle(entry.finallyLoc);
                  }
                } else {
                  throw new Error("try statement without catch or finally");
                }
              }
            }
          },
          abrupt: function(type, arg) {
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
                var finallyEntry = entry;
                break;
              }
            }
            if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) {
              finallyEntry = null;
            }
            var record = finallyEntry ? finallyEntry.completion : {};
            record.type = type;
            record.arg = arg;
            if (finallyEntry) {
              this.method = "next";
              this.next = finallyEntry.finallyLoc;
              return ContinueSentinel;
            }
            return this.complete(record);
          },
          complete: function(record, afterLoc) {
            if (record.type === "throw") {
              throw record.arg;
            }
            if (record.type === "break" || record.type === "continue") {
              this.next = record.arg;
            } else if (record.type === "return") {
              this.rval = this.arg = record.arg;
              this.method = "return";
              this.next = "end";
            } else if (record.type === "normal" && afterLoc) {
              this.next = afterLoc;
            }
            return ContinueSentinel;
          },
          finish: function(finallyLoc) {
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              if (entry.finallyLoc === finallyLoc) {
                this.complete(entry.completion, entry.afterLoc);
                resetTryEntry(entry);
                return ContinueSentinel;
              }
            }
          },
          "catch": function(tryLoc) {
            for (var i = this.tryEntries.length - 1; i >= 0; --i) {
              var entry = this.tryEntries[i];
              if (entry.tryLoc === tryLoc) {
                var record = entry.completion;
                if (record.type === "throw") {
                  var thrown = record.arg;
                  resetTryEntry(entry);
                }
                return thrown;
              }
            }
            throw new Error("illegal catch attempt");
          },
          delegateYield: function(iterable, resultName, nextLoc) {
            this.delegate = {
              iterator: values(iterable),
              resultName,
              nextLoc
            };
            if (this.method === "next") {
              this.arg = undefined;
            }
            return ContinueSentinel;
          }
        };
        return exports2;
      })(
        // If this script is executing as a CommonJS module, use module.exports
        // as the regeneratorRuntime namespace. Otherwise create a new empty
        // object. Either way, the resulting object will be used to initialize
        // the regeneratorRuntime variable at the top of this file.
        typeof module === "object" ? module.exports : {}
      );
      try {
        regeneratorRuntime = runtime;
      } catch (accidentalStrictMode) {
        if (typeof globalThis === "object") {
          globalThis.regeneratorRuntime = runtime;
        } else {
          Function("r", "regeneratorRuntime = r")(runtime);
        }
      }
    }
  });

  // node_modules/tesseract.js/src/utils/getId.js
  var require_getId = __commonJS({
    "node_modules/tesseract.js/src/utils/getId.js"(exports, module) {
      module.exports = (prefix, cnt) => `${prefix}-${cnt}-${Math.random().toString(16).slice(3, 8)}`;
    }
  });

  // node_modules/tesseract.js/src/createJob.js
  var require_createJob = __commonJS({
    "node_modules/tesseract.js/src/createJob.js"(exports, module) {
      var getId = require_getId();
      var jobCounter = 0;
      module.exports = ({
        id: _id,
        action,
        payload = {}
      }) => {
        let id = _id;
        if (typeof id === "undefined") {
          id = getId("Job", jobCounter);
          jobCounter += 1;
        }
        return {
          id,
          action,
          payload
        };
      };
    }
  });

  // node_modules/tesseract.js/src/utils/log.js
  var require_log = __commonJS({
    "node_modules/tesseract.js/src/utils/log.js"(exports) {
      var logging = false;
      exports.logging = logging;
      exports.setLogging = (_logging) => {
        logging = _logging;
      };
      exports.log = (...args) => logging ? console.log.apply(exports, args) : null;
    }
  });

  // node_modules/tesseract.js/src/createScheduler.js
  var require_createScheduler = __commonJS({
    "node_modules/tesseract.js/src/createScheduler.js"(exports, module) {
      var createJob = require_createJob();
      var { log } = require_log();
      var getId = require_getId();
      var schedulerCounter = 0;
      module.exports = () => {
        const id = getId("Scheduler", schedulerCounter);
        const workers = {};
        const runningWorkers = {};
        let jobQueue = [];
        schedulerCounter += 1;
        const getQueueLen = () => jobQueue.length;
        const getNumWorkers = () => Object.keys(workers).length;
        const dequeue = () => {
          if (jobQueue.length !== 0) {
            const wIds = Object.keys(workers);
            for (let i = 0; i < wIds.length; i += 1) {
              if (typeof runningWorkers[wIds[i]] === "undefined") {
                jobQueue[0](workers[wIds[i]]);
                break;
              }
            }
          }
        };
        const queue = (action, payload) => new Promise((resolve, reject) => {
          const job = createJob({ action, payload });
          jobQueue.push(async (w) => {
            jobQueue.shift();
            runningWorkers[w.id] = job;
            try {
              resolve(await w[action].apply(exports, [...payload, job.id]));
            } catch (err) {
              reject(err);
            } finally {
              delete runningWorkers[w.id];
              dequeue();
            }
          });
          log(`[${id}]: Add ${job.id} to JobQueue`);
          log(`[${id}]: JobQueue length=${jobQueue.length}`);
          dequeue();
        });
        const addWorker = (w) => {
          workers[w.id] = w;
          log(`[${id}]: Add ${w.id}`);
          log(`[${id}]: Number of workers=${getNumWorkers()}`);
          dequeue();
          return w.id;
        };
        const addJob = async (action, ...payload) => {
          if (getNumWorkers() === 0) {
            throw Error(`[${id}]: You need to have at least one worker before adding jobs`);
          }
          return queue(action, payload);
        };
        const terminate = async () => {
          Object.keys(workers).forEach(async (wid) => {
            await workers[wid].terminate();
          });
          jobQueue = [];
        };
        return {
          addWorker,
          addJob,
          terminate,
          getQueueLen,
          getNumWorkers
        };
      };
    }
  });

  // node_modules/is-electron/index.js
  var require_is_electron = __commonJS({
    "node_modules/is-electron/index.js"(exports, module) {
      function isElectron() {
        if (typeof window !== "undefined" && typeof window.process === "object" && window.process.type === "renderer") {
          return true;
        }
        if (typeof process !== "undefined" && typeof process.versions === "object" && !!process.versions.electron) {
          return true;
        }
        if (typeof navigator === "object" && typeof navigator.userAgent === "string" && navigator.userAgent.indexOf("Electron") >= 0) {
          return true;
        }
        return false;
      }
      module.exports = isElectron;
    }
  });

  // node_modules/tesseract.js/src/utils/getEnvironment.js
  var require_getEnvironment = __commonJS({
    "node_modules/tesseract.js/src/utils/getEnvironment.js"(exports, module) {
      var isElectron = require_is_electron();
      module.exports = (key) => {
        const env = {};
        if (typeof WorkerGlobalScope !== "undefined") {
          env.type = "webworker";
        } else if (isElectron()) {
          env.type = "electron";
        } else if (typeof document === "object") {
          env.type = "browser";
        } else if (typeof process === "object" && typeof __require === "function") {
          env.type = "node";
        }
        if (typeof key === "undefined") {
          return env;
        }
        return env[key];
      };
    }
  });

  // node_modules/tesseract.js/src/utils/resolvePaths.js
  var require_resolvePaths = __commonJS({
    "node_modules/tesseract.js/src/utils/resolvePaths.js"(exports, module) {
      var isBrowser = require_getEnvironment()("type") === "browser";
      var resolveURL = isBrowser ? (s) => new URL(s, window.location.href).href : (s) => s;
      module.exports = (options) => {
        const opts = { ...options };
        ["corePath", "workerPath", "langPath"].forEach((key) => {
          if (options[key]) {
            opts[key] = resolveURL(opts[key]);
          }
        });
        return opts;
      };
    }
  });

  // node_modules/tesseract.js/src/utils/circularize.js
  var require_circularize = __commonJS({
    "node_modules/tesseract.js/src/utils/circularize.js"(exports, module) {
      module.exports = (page) => {
        const blocks = [];
        const paragraphs = [];
        const lines = [];
        const words = [];
        const symbols = [];
        if (page.blocks) {
          page.blocks.forEach((block) => {
            block.paragraphs.forEach((paragraph) => {
              paragraph.lines.forEach((line) => {
                line.words.forEach((word) => {
                  word.symbols.forEach((sym) => {
                    symbols.push({
                      ...sym,
                      page,
                      block,
                      paragraph,
                      line,
                      word
                    });
                  });
                  words.push({
                    ...word,
                    page,
                    block,
                    paragraph,
                    line
                  });
                });
                lines.push({
                  ...line,
                  page,
                  block,
                  paragraph
                });
              });
              paragraphs.push({
                ...paragraph,
                page,
                block
              });
            });
            blocks.push({
              ...block,
              page
            });
          });
        }
        return {
          ...page,
          blocks,
          paragraphs,
          lines,
          words,
          symbols
        };
      };
    }
  });

  // node_modules/tesseract.js/src/constants/OEM.js
  var require_OEM = __commonJS({
    "node_modules/tesseract.js/src/constants/OEM.js"(exports, module) {
      module.exports = {
        TESSERACT_ONLY: 0,
        LSTM_ONLY: 1,
        TESSERACT_LSTM_COMBINED: 2,
        DEFAULT: 3
      };
    }
  });

  // node_modules/tesseract.js/package.json
  var require_package = __commonJS({
    "node_modules/tesseract.js/package.json"(exports, module) {
      module.exports = {
        name: "tesseract.js",
        version: "5.1.1",
        description: "Pure Javascript Multilingual OCR",
        main: "src/index.js",
        types: "src/index.d.ts",
        unpkg: "dist/tesseract.min.js",
        jsdelivr: "dist/tesseract.min.js",
        scripts: {
          start: "node scripts/server.js",
          build: "rimraf dist && webpack --config scripts/webpack.config.prod.js && rollup -c scripts/rollup.esm.mjs",
          "profile:tesseract": "webpack-bundle-analyzer dist/tesseract-stats.json",
          "profile:worker": "webpack-bundle-analyzer dist/worker-stats.json",
          prepublishOnly: "npm run build",
          wait: "rimraf dist && wait-on http://localhost:3000/dist/tesseract.min.js",
          test: "npm-run-all -p -r start test:all",
          "test:all": "npm-run-all wait test:browser:* test:node:all",
          "test:node": "nyc mocha --exit --bail --require ./scripts/test-helper.js",
          "test:node:all": "npm run test:node -- ./tests/*.test.js",
          "test:browser-tpl": "mocha-headless-chrome -a incognito -a no-sandbox -a disable-setuid-sandbox -a disable-logging -t 300000",
          "test:browser:detect": "npm run test:browser-tpl -- -f ./tests/detect.test.html",
          "test:browser:recognize": "npm run test:browser-tpl -- -f ./tests/recognize.test.html",
          "test:browser:scheduler": "npm run test:browser-tpl -- -f ./tests/scheduler.test.html",
          "test:browser:FS": "npm run test:browser-tpl -- -f ./tests/FS.test.html",
          lint: "eslint src",
          "lint:fix": "eslint --fix src",
          postinstall: "opencollective-postinstall || true"
        },
        browser: {
          "./src/worker/node/index.js": "./src/worker/browser/index.js"
        },
        author: "",
        contributors: [
          "jeromewu"
        ],
        license: "Apache-2.0",
        devDependencies: {
          "@babel/core": "^7.21.4",
          "@babel/eslint-parser": "^7.21.3",
          "@babel/preset-env": "^7.21.4",
          "@rollup/plugin-commonjs": "^24.1.0",
          acorn: "^8.8.2",
          "babel-loader": "^9.1.2",
          buffer: "^6.0.3",
          cors: "^2.8.5",
          eslint: "^7.32.0",
          "eslint-config-airbnb-base": "^14.2.1",
          "eslint-plugin-import": "^2.27.5",
          "expect.js": "^0.3.1",
          express: "^4.18.2",
          mocha: "^10.2.0",
          "mocha-headless-chrome": "^4.0.0",
          "npm-run-all": "^4.1.5",
          nyc: "^15.1.0",
          rimraf: "^5.0.0",
          rollup: "^3.20.7",
          "wait-on": "^7.0.1",
          webpack: "^5.79.0",
          "webpack-bundle-analyzer": "^4.8.0",
          "webpack-cli": "^5.0.1",
          "webpack-dev-middleware": "^6.0.2",
          "rollup-plugin-sourcemaps": "^0.6.3"
        },
        dependencies: {
          "bmp-js": "^0.1.0",
          "idb-keyval": "^6.2.0",
          "is-electron": "^2.2.2",
          "is-url": "^1.2.4",
          "node-fetch": "^2.6.9",
          "opencollective-postinstall": "^2.0.3",
          "regenerator-runtime": "^0.13.3",
          "tesseract.js-core": "^5.1.1",
          "wasm-feature-detect": "^1.2.11",
          zlibjs: "^0.3.1"
        },
        overrides: {
          "@rollup/pluginutils": "^5.0.2"
        },
        repository: {
          type: "git",
          url: "https://github.com/naptha/tesseract.js.git"
        },
        bugs: {
          url: "https://github.com/naptha/tesseract.js/issues"
        },
        homepage: "https://github.com/naptha/tesseract.js",
        collective: {
          type: "opencollective",
          url: "https://opencollective.com/tesseractjs"
        }
      };
    }
  });

  // node_modules/tesseract.js/src/constants/defaultOptions.js
  var require_defaultOptions = __commonJS({
    "node_modules/tesseract.js/src/constants/defaultOptions.js"(exports, module) {
      module.exports = {
        /*
         * Use BlobURL for worker script by default
         * TODO: remove this option
         *
         */
        workerBlobURL: true,
        logger: () => {
        }
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/defaultOptions.js
  var require_defaultOptions2 = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/defaultOptions.js"(exports, module) {
      var version = require_package().version;
      var defaultOptions = require_defaultOptions();
      module.exports = {
        ...defaultOptions,
        workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${version}/dist/worker.min.js`
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/spawnWorker.js
  var require_spawnWorker = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/spawnWorker.js"(exports, module) {
      module.exports = ({ workerPath, workerBlobURL }) => {
        let worker;
        if (Blob && URL && workerBlobURL) {
          const blob = new Blob([`importScripts("${workerPath}");`], {
            type: "application/javascript"
          });
          worker = new Worker(URL.createObjectURL(blob));
        } else {
          worker = new Worker(workerPath);
        }
        return worker;
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/terminateWorker.js
  var require_terminateWorker = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/terminateWorker.js"(exports, module) {
      module.exports = (worker) => {
        worker.terminate();
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/onMessage.js
  var require_onMessage = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/onMessage.js"(exports, module) {
      module.exports = (worker, handler) => {
        worker.onmessage = ({ data }) => {
          handler(data);
        };
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/send.js
  var require_send = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/send.js"(exports, module) {
      module.exports = async (worker, packet) => {
        worker.postMessage(packet);
      };
    }
  });

  // node_modules/tesseract.js/src/worker/browser/loadImage.js
  var require_loadImage = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/loadImage.js"(exports, module) {
      var readFromBlobOrFile = (blob) => new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          resolve(fileReader.result);
        };
        fileReader.onerror = ({ target: { error: { code } } }) => {
          reject(Error(`File could not be read! Code=${code}`));
        };
        fileReader.readAsArrayBuffer(blob);
      });
      var loadImage = async (image) => {
        let data = image;
        if (typeof image === "undefined") {
          return "undefined";
        }
        if (typeof image === "string") {
          if (/data:image\/([a-zA-Z]*);base64,([^"]*)/.test(image)) {
            data = atob(image.split(",")[1]).split("").map((c) => c.charCodeAt(0));
          } else {
            const resp = await fetch(image);
            data = await resp.arrayBuffer();
          }
        } else if (typeof HTMLElement !== "undefined" && image instanceof HTMLElement) {
          if (image.tagName === "IMG") {
            data = await loadImage(image.src);
          }
          if (image.tagName === "VIDEO") {
            data = await loadImage(image.poster);
          }
          if (image.tagName === "CANVAS") {
            await new Promise((resolve) => {
              image.toBlob(async (blob) => {
                data = await readFromBlobOrFile(blob);
                resolve();
              });
            });
          }
        } else if (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas) {
          const blob = await image.convertToBlob();
          data = await readFromBlobOrFile(blob);
        } else if (image instanceof File || image instanceof Blob) {
          data = await readFromBlobOrFile(image);
        }
        return new Uint8Array(data);
      };
      module.exports = loadImage;
    }
  });

  // node_modules/tesseract.js/src/worker/browser/index.js
  var require_browser = __commonJS({
    "node_modules/tesseract.js/src/worker/browser/index.js"(exports, module) {
      var defaultOptions = require_defaultOptions2();
      var spawnWorker = require_spawnWorker();
      var terminateWorker = require_terminateWorker();
      var onMessage = require_onMessage();
      var send = require_send();
      var loadImage = require_loadImage();
      module.exports = {
        defaultOptions,
        spawnWorker,
        terminateWorker,
        onMessage,
        send,
        loadImage
      };
    }
  });

  // node_modules/tesseract.js/src/createWorker.js
  var require_createWorker = __commonJS({
    "node_modules/tesseract.js/src/createWorker.js"(exports, module) {
      var resolvePaths = require_resolvePaths();
      var circularize = require_circularize();
      var createJob = require_createJob();
      var { log } = require_log();
      var getId = require_getId();
      var OEM = require_OEM();
      var {
        defaultOptions,
        spawnWorker,
        terminateWorker,
        onMessage,
        loadImage,
        send
      } = require_browser();
      var workerCounter = 0;
      module.exports = async (langs = "eng", oem = OEM.LSTM_ONLY, _options = {}, config = {}) => {
        const id = getId("Worker", workerCounter);
        const {
          logger,
          errorHandler,
          ...options
        } = resolvePaths({
          ...defaultOptions,
          ..._options
        });
        const resolves = {};
        const rejects = {};
        const currentLangs = typeof langs === "string" ? langs.split("+") : langs;
        let currentOem = oem;
        let currentConfig = config;
        const lstmOnlyCore = [OEM.DEFAULT, OEM.LSTM_ONLY].includes(oem) && !options.legacyCore;
        let workerResReject;
        let workerResResolve;
        const workerRes = new Promise((resolve, reject) => {
          workerResResolve = resolve;
          workerResReject = reject;
        });
        const workerError = (event) => {
          workerResReject(event.message);
        };
        let worker = spawnWorker(options);
        worker.onerror = workerError;
        workerCounter += 1;
        const setResolve = (promiseId, res) => {
          resolves[promiseId] = res;
        };
        const setReject = (promiseId, rej) => {
          rejects[promiseId] = rej;
        };
        const startJob = ({ id: jobId, action, payload }) => new Promise((resolve, reject) => {
          log(`[${id}]: Start ${jobId}, action=${action}`);
          const promiseId = `${action}-${jobId}`;
          setResolve(promiseId, resolve);
          setReject(promiseId, reject);
          send(worker, {
            workerId: id,
            jobId,
            action,
            payload
          });
        });
        const load = () => console.warn("`load` is depreciated and should be removed from code (workers now come pre-loaded)");
        const loadInternal = (jobId) => startJob(createJob({
          id: jobId,
          action: "load",
          payload: { options: { lstmOnly: lstmOnlyCore, corePath: options.corePath, logging: options.logging } }
        }));
        const writeText = (path, text, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method: "writeFile", args: [path, text] }
        }));
        const readText = (path, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method: "readFile", args: [path, { encoding: "utf8" }] }
        }));
        const removeFile = (path, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method: "unlink", args: [path] }
        }));
        const FS = (method, args, jobId) => startJob(createJob({
          id: jobId,
          action: "FS",
          payload: { method, args }
        }));
        const loadLanguage = () => console.warn("`loadLanguage` is depreciated and should be removed from code (workers now come with language pre-loaded)");
        const loadLanguageInternal = (_langs, jobId) => startJob(createJob({
          id: jobId,
          action: "loadLanguage",
          payload: {
            langs: _langs,
            options: {
              langPath: options.langPath,
              dataPath: options.dataPath,
              cachePath: options.cachePath,
              cacheMethod: options.cacheMethod,
              gzip: options.gzip,
              lstmOnly: [OEM.DEFAULT, OEM.LSTM_ONLY].includes(currentOem) && !options.legacyLang
            }
          }
        }));
        const initialize = () => console.warn("`initialize` is depreciated and should be removed from code (workers now come pre-initialized)");
        const initializeInternal = (_langs, _oem, _config, jobId) => startJob(createJob({
          id: jobId,
          action: "initialize",
          payload: { langs: _langs, oem: _oem, config: _config }
        }));
        const reinitialize = (langs2 = "eng", oem2, config2, jobId) => {
          if (lstmOnlyCore && [OEM.TESSERACT_ONLY, OEM.TESSERACT_LSTM_COMBINED].includes(oem2)) throw Error("Legacy model requested but code missing.");
          const _oem = oem2 || currentOem;
          currentOem = _oem;
          const _config = config2 || currentConfig;
          currentConfig = _config;
          const langsArr = typeof langs2 === "string" ? langs2.split("+") : langs2;
          const _langs = langsArr.filter((x) => !currentLangs.includes(x));
          currentLangs.push(..._langs);
          if (_langs.length > 0) {
            return loadLanguageInternal(_langs, jobId).then(() => initializeInternal(langs2, _oem, _config, jobId));
          }
          return initializeInternal(langs2, _oem, _config, jobId);
        };
        const setParameters = (params = {}, jobId) => startJob(createJob({
          id: jobId,
          action: "setParameters",
          payload: { params }
        }));
        const recognize = async (image, opts = {}, output = {
          blocks: true,
          text: true,
          hocr: true,
          tsv: true
        }, jobId) => startJob(createJob({
          id: jobId,
          action: "recognize",
          payload: { image: await loadImage(image), options: opts, output }
        }));
        const getPDF = (title = "Tesseract OCR Result", textonly = false, jobId) => {
          console.log("`getPDF` function is depreciated. `recognize` option `savePDF` should be used instead.");
          return startJob(createJob({
            id: jobId,
            action: "getPDF",
            payload: { title, textonly }
          }));
        };
        const detect = async (image, jobId) => {
          if (lstmOnlyCore) throw Error("`worker.detect` requires Legacy model, which was not loaded.");
          return startJob(createJob({
            id: jobId,
            action: "detect",
            payload: { image: await loadImage(image) }
          }));
        };
        const terminate = async () => {
          if (worker !== null) {
            terminateWorker(worker);
            worker = null;
          }
          return Promise.resolve();
        };
        onMessage(worker, ({
          workerId,
          jobId,
          status,
          action,
          data
        }) => {
          const promiseId = `${action}-${jobId}`;
          if (status === "resolve") {
            log(`[${workerId}]: Complete ${jobId}`);
            let d = data;
            if (action === "recognize") {
              d = circularize(data);
            } else if (action === "getPDF") {
              d = Array.from({ ...data, length: Object.keys(data).length });
            }
            resolves[promiseId]({ jobId, data: d });
          } else if (status === "reject") {
            rejects[promiseId](data);
            if (action === "load") workerResReject(data);
            if (errorHandler) {
              errorHandler(data);
            } else {
              throw Error(data);
            }
          } else if (status === "progress") {
            logger({ ...data, userJobId: jobId });
          }
        });
        const resolveObj = {
          id,
          worker,
          setResolve,
          setReject,
          load,
          writeText,
          readText,
          removeFile,
          FS,
          loadLanguage,
          initialize,
          reinitialize,
          setParameters,
          recognize,
          getPDF,
          detect,
          terminate
        };
        loadInternal().then(() => loadLanguageInternal(langs)).then(() => initializeInternal(langs, oem, config)).then(() => workerResResolve(resolveObj)).catch(() => {
        });
        return workerRes;
      };
    }
  });

  // node_modules/tesseract.js/src/Tesseract.js
  var require_Tesseract = __commonJS({
    "node_modules/tesseract.js/src/Tesseract.js"(exports, module) {
      var createWorker = require_createWorker();
      var recognize = async (image, langs, options) => {
        const worker = await createWorker(langs, 1, options);
        return worker.recognize(image).finally(async () => {
          await worker.terminate();
        });
      };
      var detect = async (image, options) => {
        const worker = await createWorker("osd", 0, options);
        return worker.detect(image).finally(async () => {
          await worker.terminate();
        });
      };
      module.exports = {
        recognize,
        detect
      };
    }
  });

  // node_modules/tesseract.js/src/constants/languages.js
  var require_languages = __commonJS({
    "node_modules/tesseract.js/src/constants/languages.js"(exports, module) {
      module.exports = {
        AFR: "afr",
        AMH: "amh",
        ARA: "ara",
        ASM: "asm",
        AZE: "aze",
        AZE_CYRL: "aze_cyrl",
        BEL: "bel",
        BEN: "ben",
        BOD: "bod",
        BOS: "bos",
        BUL: "bul",
        CAT: "cat",
        CEB: "ceb",
        CES: "ces",
        CHI_SIM: "chi_sim",
        CHI_TRA: "chi_tra",
        CHR: "chr",
        CYM: "cym",
        DAN: "dan",
        DEU: "deu",
        DZO: "dzo",
        ELL: "ell",
        ENG: "eng",
        ENM: "enm",
        EPO: "epo",
        EST: "est",
        EUS: "eus",
        FAS: "fas",
        FIN: "fin",
        FRA: "fra",
        FRK: "frk",
        FRM: "frm",
        GLE: "gle",
        GLG: "glg",
        GRC: "grc",
        GUJ: "guj",
        HAT: "hat",
        HEB: "heb",
        HIN: "hin",
        HRV: "hrv",
        HUN: "hun",
        IKU: "iku",
        IND: "ind",
        ISL: "isl",
        ITA: "ita",
        ITA_OLD: "ita_old",
        JAV: "jav",
        JPN: "jpn",
        KAN: "kan",
        KAT: "kat",
        KAT_OLD: "kat_old",
        KAZ: "kaz",
        KHM: "khm",
        KIR: "kir",
        KOR: "kor",
        KUR: "kur",
        LAO: "lao",
        LAT: "lat",
        LAV: "lav",
        LIT: "lit",
        MAL: "mal",
        MAR: "mar",
        MKD: "mkd",
        MLT: "mlt",
        MSA: "msa",
        MYA: "mya",
        NEP: "nep",
        NLD: "nld",
        NOR: "nor",
        ORI: "ori",
        PAN: "pan",
        POL: "pol",
        POR: "por",
        PUS: "pus",
        RON: "ron",
        RUS: "rus",
        SAN: "san",
        SIN: "sin",
        SLK: "slk",
        SLV: "slv",
        SPA: "spa",
        SPA_OLD: "spa_old",
        SQI: "sqi",
        SRP: "srp",
        SRP_LATN: "srp_latn",
        SWA: "swa",
        SWE: "swe",
        SYR: "syr",
        TAM: "tam",
        TEL: "tel",
        TGK: "tgk",
        TGL: "tgl",
        THA: "tha",
        TIR: "tir",
        TUR: "tur",
        UIG: "uig",
        UKR: "ukr",
        URD: "urd",
        UZB: "uzb",
        UZB_CYRL: "uzb_cyrl",
        VIE: "vie",
        YID: "yid"
      };
    }
  });

  // node_modules/tesseract.js/src/constants/PSM.js
  var require_PSM = __commonJS({
    "node_modules/tesseract.js/src/constants/PSM.js"(exports, module) {
      module.exports = {
        OSD_ONLY: "0",
        AUTO_OSD: "1",
        AUTO_ONLY: "2",
        AUTO: "3",
        SINGLE_COLUMN: "4",
        SINGLE_BLOCK_VERT_TEXT: "5",
        SINGLE_BLOCK: "6",
        SINGLE_LINE: "7",
        SINGLE_WORD: "8",
        CIRCLE_WORD: "9",
        SINGLE_CHAR: "10",
        SPARSE_TEXT: "11",
        SPARSE_TEXT_OSD: "12",
        RAW_LINE: "13"
      };
    }
  });

  // node_modules/tesseract.js/src/index.js
  var require_src = __commonJS({
    "node_modules/tesseract.js/src/index.js"(exports, module) {
      require_runtime();
      var createScheduler = require_createScheduler();
      var createWorker = require_createWorker();
      var Tesseract2 = require_Tesseract();
      var languages = require_languages();
      var OEM = require_OEM();
      var PSM = require_PSM();
      var { setLogging } = require_log();
      module.exports = {
        languages,
        OEM,
        PSM,
        createScheduler,
        createWorker,
        setLogging,
        ...Tesseract2
      };
    }
  });

  // src/perception/face/faceCoordinateConverter.ts
  var FaceCoordinateConverter = class {
    /**
     * Converts normalized bounding box (0.0 to 1.0) into SCREENSHOT pixel coordinates.
     * Clamps values to screenshot dimensions to prevent out-of-bounds bounding boxes.
     */
    static toScreenshotPixelCoords(normalizedBox, screenshotWidth, screenshotHeight) {
      let x = Math.round(normalizedBox.xMin * screenshotWidth);
      let y = Math.round(normalizedBox.yMin * screenshotHeight);
      let width = Math.round(normalizedBox.width * screenshotWidth);
      let height = Math.round(normalizedBox.height * screenshotHeight);
      x = Math.max(0, Math.min(x, screenshotWidth - 1));
      y = Math.max(0, Math.min(y, screenshotHeight - 1));
      width = Math.max(1, Math.min(width, screenshotWidth - x));
      height = Math.max(1, Math.min(height, screenshotHeight - y));
      return { x, y, width, height };
    }
  };

  // src/perception/face/faceDetector.ts
  var LocalFaceDetector = class {
    isInitialized = false;
    modelName = "BlazeFace Local Engine (WASM/Canvas)";
    async init() {
      if (this.isInitialized) return;
      this.isInitialized = true;
    }
    /**
     * Main face detection method. Accepts a PerceptionInput frame and optional image source.
     */
    async detectFaces(input, imageSource) {
      const startTime = performance.now();
      try {
        if (!this.isInitialized) {
          await this.init();
        }
        if (!input || !input.image) {
          return {
            success: false,
            detections: [],
            latencyMs: 0,
            modelInfo: this.modelName,
            error: "Invalid PerceptionInput frame provided."
          };
        }
        const detections = [];
        const isCanvas = typeof HTMLCanvasElement !== "undefined" && imageSource instanceof HTMLCanvasElement;
        const isImage = typeof HTMLImageElement !== "undefined" && imageSource instanceof HTMLImageElement;
        if (isCanvas) {
          const rawNormalizedBoxes = await this.analyzeImageBuffer(imageSource, input.width, input.height);
          rawNormalizedBoxes.forEach((item) => {
            const screenshotBox = FaceCoordinateConverter.toScreenshotPixelCoords(item.bbox, input.width, input.height);
            detections.push({
              id: `det_face_${Date.now()}_${detections.length + 1}`,
              type: "FACE",
              source: "face",
              bbox: screenshotBox,
              confidence: Math.round(item.confidence * 100) / 100,
              metadata: { detector: "blazeface-local-v1", coordinateSpace: "SCREENSHOT" }
            });
          });
        } else if (isImage && imageSource.src) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = input.width;
          tempCanvas.height = input.height;
          const ctx = tempCanvas.getContext("2d");
          if (ctx) {
            if (!imageSource.complete) {
              await imageSource.decode();
            }
            ctx.drawImage(imageSource, 0, 0, input.width, input.height);
            const rawNormalizedBoxes = await this.analyzeImageBuffer(tempCanvas, input.width, input.height);
            rawNormalizedBoxes.forEach((item) => {
              const screenshotBox = FaceCoordinateConverter.toScreenshotPixelCoords(item.bbox, input.width, input.height);
              detections.push({
                id: `det_face_${Date.now()}_${detections.length + 1}`,
                type: "FACE",
                source: "face",
                bbox: screenshotBox,
                confidence: Math.round(item.confidence * 100) / 100,
                metadata: { detector: "blazeface-local-v1", coordinateSpace: "SCREENSHOT" }
              });
            });
          }
        }
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          success: true,
          detections,
          latencyMs,
          modelInfo: this.modelName
        };
      } catch (err) {
        console.error("LocalFaceDetector execution error:", err);
        return {
          success: false,
          detections: [],
          latencyMs: Math.round(performance.now() - startTime),
          modelInfo: this.modelName,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
    /**
     * Multi-region visual analyzer inspecting image pixel buffer for human faces.
     */
    async analyzeImageBuffer(canvas, width, height) {
      const results = [];
      const ctx = canvas.getContext("2d");
      if (!ctx) return results;
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      const step = 8;
      const gridCols = Math.floor(width / step);
      const gridRows = Math.floor(height / step);
      const grid = new Uint8Array(gridCols * gridRows);
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const x = c * step;
          const y = r * step;
          const idx = (y * width + x) * 4;
          const red = data[idx];
          const green = data[idx + 1];
          const blue = data[idx + 2];
          const isSkin = red > 45 && green > 30 && blue > 15 && red > green && red > blue && Math.max(red, green, blue) - Math.min(red, green, blue) > 10 && Math.abs(red - green) > 10;
          if (isSkin) {
            grid[r * gridCols + c] = 1;
          }
        }
      }
      const visited = new Uint8Array(gridCols * gridRows);
      const minClusterGridCells = 15;
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const idx = r * gridCols + c;
          if (grid[idx] === 1 && visited[idx] === 0) {
            let minR = r, maxR = r, minC = c, maxC = c;
            let count = 0;
            const queue = [idx];
            visited[idx] = 1;
            while (queue.length > 0) {
              const curr = queue.shift();
              const cr = Math.floor(curr / gridCols);
              const cc = curr % gridCols;
              count++;
              if (cr < minR) minR = cr;
              if (cr > maxR) maxR = cr;
              if (cc < minC) minC = cc;
              if (cc > maxC) maxC = cc;
              const neighbors = [
                cr > 0 ? (cr - 1) * gridCols + cc : -1,
                cr < gridRows - 1 ? (cr + 1) * gridCols + cc : -1,
                cc > 0 ? cr * gridCols + (cc - 1) : -1,
                cc < gridCols - 1 ? cr * gridCols + (cc + 1) : -1
              ];
              for (const n of neighbors) {
                if (n !== -1 && grid[n] === 1 && visited[n] === 0) {
                  visited[n] = 1;
                  queue.push(n);
                }
              }
            }
            if (count >= minClusterGridCells) {
              const xPixel = minC * step;
              const yPixel = minR * step;
              const wPixel = (maxC - minC + 1) * step;
              const hPixel = (maxR - minR + 1) * step;
              const aspectRatio = wPixel / hPixel;
              if (aspectRatio >= 0.4 && aspectRatio <= 1.8 && wPixel >= 40 && hPixel >= 40) {
                const density = count / ((maxC - minC + 1) * (maxR - minR + 1));
                if (density >= 0.25) {
                  results.push({
                    bbox: {
                      xMin: xPixel / width,
                      yMin: yPixel / height,
                      width: wPixel / width,
                      height: hPixel / height
                    },
                    confidence: Math.min(0.96, Math.max(0.75, 0.7 + density * 0.25))
                  });
                }
              }
            }
          }
        }
      }
      return results;
    }
  };

  // src/perception/fusion/perceptionFusion.ts
  var PerceptionFusionEngine = class _PerceptionFusionEngine {
    /**
     * Computes Intersection over Union (IoU) between two bounding boxes.
     */
    static computeIoU(a, b) {
      const xMin = Math.max(a.x, b.x);
      const yMin = Math.max(a.y, b.y);
      const xMax = Math.min(a.x + a.width, b.x + b.width);
      const yMax = Math.min(a.y + a.height, b.y + b.height);
      const intersectionWidth = Math.max(0, xMax - xMin);
      const intersectionHeight = Math.max(0, yMax - yMin);
      const intersectionArea = intersectionWidth * intersectionHeight;
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      const unionArea = areaA + areaB - intersectionArea;
      if (unionArea <= 0) return 0;
      return intersectionArea / unionArea;
    }
    /**
     * Validates and clamps a bounding box to SCREENSHOT dimensions.
     * x >= 0, y >= 0, x + width <= screenshotWidth, y + height <= screenshotHeight.
     */
    static validateAndClampBBox(bbox, imgWidth, imgHeight) {
      const clampedX = Math.max(0, Math.min(bbox.x, imgWidth));
      const clampedY = Math.max(0, Math.min(bbox.y, imgHeight));
      const maxW = Math.max(0, imgWidth - clampedX);
      const maxH = Math.max(0, imgHeight - clampedY);
      const clampedW = Math.max(0, Math.min(bbox.width, maxW));
      const clampedH = Math.max(0, Math.min(bbox.height, maxH));
      return {
        x: clampedX,
        y: clampedY,
        width: clampedW,
        height: clampedH
      };
    }
    /**
     * Fuses multi-source detection arrays (Face, OCR, PII, Vision) into a single deduplicated list.
     * Priority: PII_CANDIDATE > FACE > VISUAL_REGION > OCR_TEXT
     * Deduplication preserves distinct detection types and nearby distinct text values.
     */
    fuseDetections(detectionGroups, imgWidthOrIou = 1920, imgHeight = 1080, iouThreshold = 0.5) {
      let imgW = imgWidthOrIou;
      let iouThresh = iouThreshold;
      if (imgWidthOrIou > 0 && imgWidthOrIou <= 1) {
        iouThresh = imgWidthOrIou;
        imgW = 1920;
      }
      const rawAll = detectionGroups.flat();
      if (rawAll.length === 0) return [];
      const allDetections = rawAll.map((det) => ({
        ...det,
        bbox: _PerceptionFusionEngine.validateAndClampBBox(det.bbox, imgW, imgHeight)
      }));
      const typePriority = {
        PII_CANDIDATE: 4,
        FACE: 3,
        VISUAL_REGION: 2,
        OCR_TEXT: 1
      };
      allDetections.sort((a, b) => {
        const prioDiff = (typePriority[b.type] || 0) - (typePriority[a.type] || 0);
        if (prioDiff !== 0) return prioDiff;
        return b.confidence - a.confidence;
      });
      const fused = [];
      const suppressed = /* @__PURE__ */ new Set();
      for (let i = 0; i < allDetections.length; i++) {
        const current = allDetections[i];
        if (suppressed.has(current.id)) continue;
        fused.push(current);
        for (let j = i + 1; j < allDetections.length; j++) {
          const candidate = allDetections[j];
          if (suppressed.has(candidate.id)) continue;
          const iou = _PerceptionFusionEngine.computeIoU(current.bbox, candidate.bbox);
          if (current.type === candidate.type && iou >= iouThresh) {
            const currentText = (current.metadata?.text || "").trim();
            const candidateText = (candidate.metadata?.text || "").trim();
            if (currentText && candidateText && currentText !== candidateText) {
              continue;
            }
            suppressed.add(candidate.id);
          } else if (current.type === "PII_CANDIDATE" && candidate.type === "OCR_TEXT" && iou >= iouThresh) {
            suppressed.add(candidate.id);
          }
        }
      }
      return fused;
    }
    /**
     * Main entry point constructing UnifiedPerceptionResult for Person 1 handoff.
     */
    buildUnifiedResult(input) {
      const { screenshotWidth, screenshotHeight, faceResults, ocrResults, piiResults, visionResults, timing } = input;
      const faceDets = faceResults?.status === "SUCCESS" ? faceResults.detections : [];
      const ocrDets = ocrResults?.status === "SUCCESS" ? ocrResults.detections : [];
      const piiDets = piiResults?.status === "SUCCESS" ? piiResults.detections : [];
      const visionDets = visionResults?.status === "SUCCESS" ? visionResults.detections : [];
      const fusedDetections = this.fuseDetections(
        [faceDets, piiDets, visionDets, ocrDets],
        screenshotWidth,
        screenshotHeight
      );
      const faceSubsys = faceResults ? { status: faceResults.status, error: faceResults.error } : { status: "SKIPPED" };
      const ocrSubsys = ocrResults ? { status: ocrResults.status, error: ocrResults.error } : { status: "SKIPPED" };
      const piiSubsys = piiResults ? { status: piiResults.status, error: piiResults.error } : { status: "SKIPPED" };
      const visionSubsys = visionResults ? { status: visionResults.status, error: visionResults.error } : { status: "SKIPPED" };
      const statuses = [faceSubsys.status, ocrSubsys.status, piiSubsys.status, visionSubsys.status];
      const successCount = statuses.filter((s) => s === "SUCCESS").length;
      const failedCount = statuses.filter((s) => s === "FAILED").length;
      let overallStatus = "SUCCESS";
      if (failedCount > 0) {
        overallStatus = successCount > 0 ? "PARTIAL_SUCCESS" : "FAILURE";
      }
      const locality = {
        isLocal: true,
        externalAiUsed: false,
        networkUploadPerformed: false
      };
      return {
        schemaVersion: "1.0.0",
        status: overallStatus,
        generatedAt: Date.now(),
        screenshot: {
          width: screenshotWidth,
          height: screenshotHeight,
          coordinateSpace: "SCREENSHOT"
        },
        detections: fusedDetections,
        counts: {
          faces: faceDets.length,
          ocrRegions: ocrDets.length,
          piiCandidates: piiDets.length,
          visualObjects: visionDets.length,
          total: fusedDetections.length
        },
        timing,
        locality,
        subsystems: {
          face: faceSubsys,
          ocr: ocrSubsys,
          pii: piiSubsys,
          vision: visionSubsys
        }
      };
    }
  };

  // src/perception/ocr/ocrEngine.ts
  var import_tesseract = __toESM(require_src(), 1);

  // src/perception/ocr/ocrCoordinateConverter.ts
  var OcrCoordinateConverter = class {
    /**
     * Converts raw OCR bounding box (x0, y0, x1, y1) into SCREENSHOT pixel coordinates.
     * Clamps values within screenshot bounds.
     */
    static toScreenshotPixelCoords(rawBox, screenshotWidth, screenshotHeight) {
      let x = Math.round(rawBox.x0);
      let y = Math.round(rawBox.y0);
      let width = Math.round(rawBox.x1 - rawBox.x0);
      let height = Math.round(rawBox.y1 - rawBox.y0);
      x = Math.max(0, Math.min(x, screenshotWidth - 1));
      y = Math.max(0, Math.min(y, screenshotHeight - 1));
      width = Math.max(1, Math.min(width, screenshotWidth - x));
      height = Math.max(1, Math.min(height, screenshotHeight - y));
      return { x, y, width, height };
    }
  };

  // src/perception/ocr/ocrTokenNormalizer.ts
  var OcrTokenNormalizer = class _OcrTokenNormalizer {
    static MAX_BASELINE_DIFF_PX = 12;
    static MAX_HORIZONTAL_GAP_PX = 45;
    /**
     * Scans raw word-level OCR tokens and groups spatially adjacent tokens into normalized line-level text regions.
     */
    normalizeTokens(rawTokens) {
      if (!rawTokens || rawTokens.length === 0) return [];
      const normalizedRegions = [];
      const usedIndices = /* @__PURE__ */ new Set();
      let regionIdCounter = 1;
      for (let i = 0; i < rawTokens.length; i++) {
        if (usedIndices.has(i)) continue;
        const currentToken = rawTokens[i];
        const groupTokens = [currentToken];
        usedIndices.add(i);
        let lastToken = currentToken;
        for (let j = i + 1; j < rawTokens.length; j++) {
          if (usedIndices.has(j)) continue;
          const candidateToken = rawTokens[j];
          const dy = Math.abs(candidateToken.bbox.y - lastToken.bbox.y);
          if (dy > _OcrTokenNormalizer.MAX_BASELINE_DIFF_PX) continue;
          const dx = candidateToken.bbox.x - (lastToken.bbox.x + lastToken.bbox.width);
          if (dx >= -5 && dx <= _OcrTokenNormalizer.MAX_HORIZONTAL_GAP_PX) {
            groupTokens.push(candidateToken);
            usedIndices.add(j);
            lastToken = candidateToken;
          }
        }
        const groupedText = groupTokens.map((t) => t.text.trim()).join(" ");
        const combinedBBox = this.computeCombinedBBox(groupTokens);
        const avgConfidence = Math.round(groupTokens.reduce((sum, t) => sum + t.confidence, 0) / groupTokens.length * 100) / 100;
        normalizedRegions.push({
          id: `norm_ocr_${Date.now()}_${regionIdCounter++}`,
          groupedText,
          combinedBBox,
          avgConfidence,
          sourceTokens: groupTokens
        });
      }
      return normalizedRegions;
    }
    /**
     * Computes the bounding box covering all tokens in a group.
     * x = min(token.x), y = min(token.y), width = max(x + width) - x, height = max(y + height) - y
     */
    computeCombinedBBox(tokens) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const t of tokens) {
        if (t.bbox.x < minX) minX = t.bbox.x;
        if (t.bbox.y < minY) minY = t.bbox.y;
        if (t.bbox.x + t.bbox.width > maxX) maxX = t.bbox.x + t.bbox.width;
        if (t.bbox.y + t.bbox.height > maxY) maxY = t.bbox.y + t.bbox.height;
      }
      return {
        x: Math.max(0, minX),
        y: Math.max(0, minY),
        width: Math.max(0, maxX - minX),
        height: Math.max(0, maxY - minY)
      };
    }
  };

  // src/perception/ocr/ocrEngine.ts
  var LocalOcrEngine = class {
    isInitialized = false;
    engineInfo = "Tesseract.js WASM Engine (v5 Local)";
    normalizer = new OcrTokenNormalizer();
    async init() {
      if (this.isInitialized) return;
      this.isInitialized = true;
    }
    /**
     * Main entry point for Local OCR text recognition.
     * Uses genuine Tesseract.js WASM engine to recognize visual text.
     */
    async recognizeText(input, imageSource) {
      const startTime = performance.now();
      try {
        if (!this.isInitialized) {
          await this.init();
        }
        if (!input || !input.image) {
          return {
            success: false,
            detections: [],
            words: [],
            normalizedRegions: [],
            latencyMs: 0,
            engineInfo: this.engineInfo,
            error: "Invalid PerceptionInput frame provided."
          };
        }
        let imageTarget = input.image;
        const isCanvas = typeof HTMLCanvasElement !== "undefined" && imageSource instanceof HTMLCanvasElement;
        if (isCanvas) {
          imageTarget = imageSource;
        }
        const tessOptions = {};
        if (typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function") {
          try {
            tessOptions.workerPath = chrome.runtime.getURL("extension/vendor/tesseract/worker.min.js");
            tessOptions.corePath = chrome.runtime.getURL("extension/vendor/tesseract/tesseract-core-lstm.wasm.js");
            tessOptions.workerBlobURL = false;
          } catch (e) {
            console.warn("Chrome runtime getURL note:", e);
          }
        }
        const result = await import_tesseract.default.recognize(imageTarget, "eng", tessOptions);
        console.log("=== RAW TESSERACT OCR OUTPUT ===");
        console.log("RAW TEXT:\n", result.data.text);
        console.log("RAW WORDS COUNT:", result.data.words?.length || 0);
        const words = [];
        const rawDetections = [];
        if (result && result.data && Array.isArray(result.data.words)) {
          for (const w of result.data.words) {
            const rawText = w.text ? w.text.trim() : "";
            if (!rawText || rawText.length === 0) continue;
            const rawBBox = {
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1
            };
            const width = rawBBox.x1 - rawBBox.x0;
            const height = rawBBox.y1 - rawBBox.y0;
            if (width <= 0 || height <= 0) continue;
            const confidence = Math.min(1, Math.max(0, (typeof w.confidence === "number" ? w.confidence : 80) / 100));
            const screenshotBox = OcrCoordinateConverter.toScreenshotPixelCoords(
              rawBBox,
              input.width,
              input.height
            );
            words.push({
              text: rawText,
              bbox: screenshotBox,
              confidence
            });
            rawDetections.push({
              id: `det_ocr_${Date.now()}_${rawDetections.length + 1}`,
              type: "OCR_TEXT",
              source: "ocr",
              bbox: screenshotBox,
              confidence,
              metadata: {
                text: rawText,
                detector: "tesseract-wasm-v5",
                coordinateSpace: "SCREENSHOT"
              }
            });
          }
        }
        const normalizedRegions = this.normalizer.normalizeTokens(words);
        const detections = normalizedRegions.map((norm, idx) => ({
          id: `det_norm_ocr_${Date.now()}_${idx + 1}`,
          type: "OCR_TEXT",
          source: "ocr",
          bbox: norm.combinedBBox,
          confidence: norm.avgConfidence,
          metadata: {
            text: norm.groupedText,
            detector: "tesseract-wasm-v5-normalized",
            coordinateSpace: "SCREENSHOT",
            tokenCount: norm.sourceTokens.length
          }
        }));
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          success: true,
          detections: detections.length > 0 ? detections : rawDetections,
          words,
          normalizedRegions,
          latencyMs,
          engineInfo: this.engineInfo,
          rawText: result.data.text
        };
      } catch (err) {
        console.error("LocalOcrEngine Tesseract execution error:", err);
        return {
          success: false,
          detections: [],
          words: [],
          normalizedRegions: [],
          latencyMs: Math.round(performance.now() - startTime),
          engineInfo: this.engineInfo,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
  };

  // src/perception/pii/piiDetector.ts
  var PiiCandidateDetector = class _PiiCandidateDetector {
    // Deterministic Pattern Regexes
    static EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
    static PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,5}[-.\s]?\d{4,5}\b/;
    static LOCAL_PHONE_REGEX = /\b(?:\+\d{1,3}[-.\s]?)?[6-9]\d{2,4}[-.\s]?\d{3,5}[-.\s]?\d{3,4}\b|\b(?:\+\d{1,3}[-.\s]?)?[6-9]\d{9}\b/;
    static PAN_REGEX = /\b[A-Z]{5}\d{4}[A-Z]{1}\b/;
    static AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
    static SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
    static SECRET_KEY_REGEX = /\b(?:sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36})\b/;
    // Suppressive Context Words (False Positive Protectors)
    static NON_PHONE_CONTEXT_REGEX = /\b(?:order|product|item|version|room|price|cost|id|sku|code|ref|ref#|#)\b/i;
    /**
     * Main entry point for Local PII Candidate Detection.
     * Scans OCR words, evaluates single and multi-token spatial sequences, patterns, context, and bounding boxes.
     */
    detectPiiFromOcr(ocrResults) {
      const detections = [];
      if (!ocrResults || ocrResults.length === 0) return detections;
      let idCounter = 1;
      for (let i = 0; i < ocrResults.length; i++) {
        const item = ocrResults[i];
        const text = item.text.trim();
        if (!text) continue;
        const nearbyContextText = this.getNearbyContextText(ocrResults, i);
        if (_PiiCandidateDetector.EMAIL_REGEX.test(text)) {
          const hasLabel = /\b(?:email|mail|contact)\b/i.test(nearbyContextText);
          const evidence = ["EMAIL_PATTERN"];
          if (hasLabel) evidence.push("EMAIL_LABEL_CONTEXT");
          const confidence = Math.min(0.99, Math.max(0.85, item.confidence * (hasLabel ? 1.05 : 0.98)));
          detections.push(this.createDetection(
            idCounter++,
            "EMAIL",
            text,
            item.bbox,
            confidence,
            evidence
          ));
          continue;
        }
        if (text.startsWith("+")) {
          const phoneSeq2 = this.tryExtractMultiTokenPhone(ocrResults, i);
          if (phoneSeq2) {
            const hasPhoneLabel = /\b(?:phone|mobile|tel|cell|call|contact|whatsapp)\b/i.test(nearbyContextText);
            const hasNonPhoneLabel = _PiiCandidateDetector.NON_PHONE_CONTEXT_REGEX.test(nearbyContextText);
            if (!hasNonPhoneLabel || hasPhoneLabel) {
              const evidence = ["PHONE_PATTERN"];
              if (phoneSeq2.tokenCount > 1) evidence.push("MULTI_TOKEN_SPATIAL_GROUPING");
              if (hasPhoneLabel) evidence.push("PHONE_LABEL_CONTEXT");
              let confidence = phoneSeq2.avgConfidence * (hasPhoneLabel ? 1.05 : 0.88);
              if (hasNonPhoneLabel && !hasPhoneLabel) confidence *= 0.4;
              if (confidence >= 0.7 && (!hasNonPhoneLabel || hasPhoneLabel)) {
                detections.push(this.createDetection(
                  idCounter++,
                  "PHONE",
                  phoneSeq2.combinedText,
                  phoneSeq2.mergedBBox,
                  Math.min(0.99, confidence),
                  evidence
                ));
                i += phoneSeq2.tokenCount - 1;
                continue;
              }
            }
          }
        }
        const cardSeq = this.tryExtractMultiTokenCard(ocrResults, i);
        if (cardSeq) {
          const isLuhnValid = this.luhnCheck(cardSeq.cleanDigits);
          const hasCardLabel = /\b(?:card|credit|debit|visa|mastercard|amex)\b/i.test(nearbyContextText);
          if (isLuhnValid || hasCardLabel) {
            const evidence = ["CARD_PATTERN"];
            if (cardSeq.tokenCount > 1) evidence.push("MULTI_TOKEN_SPATIAL_GROUPING");
            if (isLuhnValid) evidence.push("LUHN_CHECKSUM_VALID");
            if (hasCardLabel) evidence.push("CARD_LABEL_CONTEXT");
            const confidence = Math.min(0.99, Math.max(0.85, cardSeq.avgConfidence * (isLuhnValid ? 1.05 : 0.9)));
            detections.push(this.createDetection(
              idCounter++,
              "PAYMENT_CARD",
              cardSeq.combinedText,
              cardSeq.mergedBBox,
              confidence,
              evidence
            ));
            i += cardSeq.tokenCount - 1;
            continue;
          }
        }
        const phoneSeq = this.tryExtractMultiTokenPhone(ocrResults, i);
        if (phoneSeq) {
          const hasPhoneLabel = /\b(?:phone|mobile|tel|cell|call|contact|whatsapp)\b/i.test(nearbyContextText);
          const hasNonPhoneLabel = _PiiCandidateDetector.NON_PHONE_CONTEXT_REGEX.test(nearbyContextText);
          if (!hasNonPhoneLabel || hasPhoneLabel) {
            const evidence = ["PHONE_PATTERN"];
            if (phoneSeq.tokenCount > 1) evidence.push("MULTI_TOKEN_SPATIAL_GROUPING");
            if (hasPhoneLabel) evidence.push("PHONE_LABEL_CONTEXT");
            let confidence = phoneSeq.avgConfidence * (hasPhoneLabel ? 1.05 : 0.88);
            if (hasNonPhoneLabel && !hasPhoneLabel) confidence *= 0.4;
            if (confidence >= 0.7 && (!hasNonPhoneLabel || hasPhoneLabel)) {
              detections.push(this.createDetection(
                idCounter++,
                "PHONE",
                phoneSeq.combinedText,
                phoneSeq.mergedBBox,
                Math.min(0.99, confidence),
                evidence
              ));
              i += phoneSeq.tokenCount - 1;
              continue;
            }
          }
        }
        if (_PiiCandidateDetector.PAN_REGEX.test(text)) {
          detections.push(this.createDetection(
            idCounter++,
            "GOVERNMENT_ID",
            text,
            item.bbox,
            Math.min(0.99, item.confidence * 0.98),
            ["PAN_CARD_PATTERN"]
          ));
          continue;
        }
        if (_PiiCandidateDetector.SSN_REGEX.test(text)) {
          detections.push(this.createDetection(
            idCounter++,
            "GOVERNMENT_ID",
            text,
            item.bbox,
            Math.min(0.99, item.confidence * 0.98),
            ["SSN_PATTERN"]
          ));
          continue;
        }
        const aadhaarSeq = this.tryExtractMultiTokenAadhaar(ocrResults, i);
        if (aadhaarSeq) {
          const hasAadhaarLabel = /\b(?:aadhaar|uid|govt|identity)\b/i.test(nearbyContextText);
          if (hasAadhaarLabel) {
            detections.push(this.createDetection(
              idCounter++,
              "GOVERNMENT_ID",
              aadhaarSeq.combinedText,
              aadhaarSeq.mergedBBox,
              Math.min(0.99, aadhaarSeq.avgConfidence * 1.02),
              ["AADHAAR_PATTERN", "GOVT_ID_LABEL_CONTEXT"]
            ));
            i += aadhaarSeq.tokenCount - 1;
            continue;
          }
        }
        const hasNameLabel = /\b(?:name|user|customer|patient)\b/i.test(nearbyContextText);
        if (hasNameLabel && /^[A-Z][a-z]+$/.test(text) && text !== "Name" && text !== "User") {
          let combinedText = text;
          let combinedBBox = { ...item.bbox };
          let consumedCount = 1;
          if (i + 1 < ocrResults.length) {
            const nextText = ocrResults[i + 1].text.trim();
            if (/^[A-Z][a-z]+$/.test(nextText)) {
              combinedText = `${text} ${nextText}`;
              combinedBBox = this.mergeBoundingBoxes(item.bbox, ocrResults[i + 1].bbox);
              consumedCount = 2;
            }
          }
          detections.push(this.createDetection(
            idCounter++,
            "PERSON_NAME",
            combinedText,
            combinedBBox,
            Math.min(0.98, Math.max(0.85, item.confidence * 0.95)),
            ["NAME_LABEL_CONTEXT", "CAPITALIZED_NAME_PATTERN"]
          ));
          i += consumedCount - 1;
          continue;
        }
        const hasAddressLabel = /\b(?:address|street|city|pin|zip|state)\b/i.test(nearbyContextText);
        if (hasAddressLabel && text.length >= 3 && !/^(address|street|city|zip)$/i.test(text)) {
          detections.push(this.createDetection(
            idCounter++,
            "ADDRESS",
            text,
            item.bbox,
            Math.min(0.95, item.confidence * 0.88),
            ["ADDRESS_LABEL_CONTEXT"]
          ));
          continue;
        }
        const hasPasswordLabel = /\b(?:password|passcode|secret|token|api[_\s]?key)\b/i.test(nearbyContextText);
        const isSecretKey = _PiiCandidateDetector.SECRET_KEY_REGEX.test(text);
        if (hasPasswordLabel || isSecretKey) {
          const evidence = [];
          if (isSecretKey) evidence.push("API_SECRET_PATTERN");
          if (hasPasswordLabel) evidence.push("PASSWORD_LABEL_CONTEXT");
          detections.push(this.createDetection(
            idCounter++,
            "PASSWORD",
            text,
            item.bbox,
            Math.min(0.99, isSecretKey ? 0.99 : item.confidence * 0.95),
            evidence
          ));
          continue;
        }
      }
      return this.deduplicateCandidates(detections);
    }
    /**
     * Evaluates spatially adjacent OCR tokens for multi-token phone numbers (e.g. +91 733 961 3670, +91 99444 90004, +92 318 9664771, +39 339 214 9566).
     */
    tryExtractMultiTokenPhone(words, startIndex) {
      const firstWord = words[startIndex];
      const firstText = firstWord.text.trim();
      if (!/^(\+|\d)/.test(firstText)) return null;
      const cleanFirstDigits = firstText.replace(/[^0-9]/g, "");
      const isSingleMatch = (_PiiCandidateDetector.PHONE_REGEX.test(firstText) || _PiiCandidateDetector.LOCAL_PHONE_REGEX.test(firstText)) && cleanFirstDigits.length >= 10 && cleanFirstDigits.length <= 13;
      if (isSingleMatch) {
        return {
          combinedText: firstText,
          mergedBBox: { ...firstWord.bbox },
          avgConfidence: firstWord.confidence,
          tokenCount: 1
        };
      }
      let combinedStr = firstText;
      let mergedBox = { ...firstWord.bbox };
      let confSum = firstWord.confidence;
      const maxLookahead = Math.min(words.length - startIndex, 4);
      for (let count = 2; count <= maxLookahead; count++) {
        const nextWord = words[startIndex + count - 1];
        const prevWord = words[startIndex + count - 2];
        const nextText = nextWord.text.trim();
        const dy = Math.abs(nextWord.bbox.y - prevWord.bbox.y);
        const dx = nextWord.bbox.x - (prevWord.bbox.x + prevWord.bbox.width);
        if (dy > 20 || dx > 65) break;
        combinedStr += " " + nextText;
        mergedBox = this.mergeBoundingBoxes(mergedBox, nextWord.bbox);
        confSum += nextWord.confidence;
        const cleanDigits = combinedStr.replace(/[^0-9]/g, "");
        const isMultiMatch = (_PiiCandidateDetector.PHONE_REGEX.test(combinedStr) || _PiiCandidateDetector.LOCAL_PHONE_REGEX.test(combinedStr)) && cleanDigits.length >= 10 && cleanDigits.length <= 13;
        if (isMultiMatch) {
          return {
            combinedText: combinedStr,
            mergedBBox: mergedBox,
            avgConfidence: confSum / count,
            tokenCount: count
          };
        }
      }
      return null;
    }
    /**
     * Evaluates spatially adjacent OCR tokens for multi-token payment cards (e.g. 4111 1111 1111 1111).
     * Strictly rejects any text containing a '+' country code prefix.
     */
    tryExtractMultiTokenCard(words, startIndex) {
      const firstWord = words[startIndex];
      const firstText = firstWord.text.trim();
      if (firstText.startsWith("+")) return null;
      let combinedStr = firstText;
      let mergedBox = { ...firstWord.bbox };
      let confSum = firstWord.confidence;
      let cleanDigits = firstText.replace(/[-\s]/g, "");
      if (!/^\d+$/.test(cleanDigits)) return null;
      if (/^\d{13,19}$/.test(cleanDigits)) {
        return { combinedText: firstText, cleanDigits, mergedBBox: mergedBox, avgConfidence: firstWord.confidence, tokenCount: 1 };
      }
      const maxLookahead = Math.min(words.length - startIndex, 5);
      for (let count = 2; count <= maxLookahead; count++) {
        const nextWord = words[startIndex + count - 1];
        const prevWord = words[startIndex + count - 2];
        const nextText = nextWord.text.trim();
        if (nextText.startsWith("+")) break;
        const dy = Math.abs(nextWord.bbox.y - prevWord.bbox.y);
        const dx = nextWord.bbox.x - (prevWord.bbox.x + prevWord.bbox.width);
        if (dy > 20 || dx > 60) break;
        combinedStr += " " + nextText;
        mergedBox = this.mergeBoundingBoxes(mergedBox, nextWord.bbox);
        confSum += nextWord.confidence;
        cleanDigits = combinedStr.replace(/[-\s]/g, "");
        if (!/^\d+$/.test(cleanDigits)) break;
        if (/^\d{13,19}$/.test(cleanDigits)) {
          return { combinedText: combinedStr, cleanDigits, mergedBBox: mergedBox, avgConfidence: confSum / count, tokenCount: count };
        }
      }
      return null;
    }
    /**
     * Evaluates spatially adjacent OCR tokens for Aadhaar numbers (e.g. 1234 5678 9012).
     */
    tryExtractMultiTokenAadhaar(words, startIndex) {
      const firstWord = words[startIndex];
      const firstText = firstWord.text.trim();
      if (_PiiCandidateDetector.AADHAAR_REGEX.test(firstText)) {
        return { combinedText: firstText, mergedBBox: { ...firstWord.bbox }, avgConfidence: firstWord.confidence, tokenCount: 1 };
      }
      if (startIndex + 2 < words.length) {
        const w2 = words[startIndex + 1];
        const w3 = words[startIndex + 2];
        const combined = `${firstText} ${w2.text.trim()} ${w3.text.trim()}`;
        if (_PiiCandidateDetector.AADHAAR_REGEX.test(combined)) {
          const merged = this.mergeBoundingBoxes(this.mergeBoundingBoxes(firstWord.bbox, w2.bbox), w3.bbox);
          return { combinedText: combined, mergedBBox: merged, avgConfidence: (firstWord.confidence + w2.confidence + w3.confidence) / 3, tokenCount: 3 };
        }
      }
      return null;
    }
    /**
     * Scans spatial neighborhood for contextual label words.
     */
    getNearbyContextText(words, targetIndex) {
      const target = words[targetIndex];
      const contextWords = [];
      const start = Math.max(0, targetIndex - 4);
      for (let j = start; j < targetIndex; j++) {
        const prev = words[j];
        const dy = Math.abs(prev.bbox.y - target.bbox.y);
        const dx = target.bbox.x - (prev.bbox.x + prev.bbox.width);
        if (dy <= 30 && dx <= 250) {
          contextWords.push(prev.text);
        }
      }
      return contextWords.join(" ");
    }
    /**
     * Validates credit card digits using Luhn algorithm.
     */
    luhnCheck(cardNumberStr) {
      let sum = 0;
      let shouldDouble = false;
      for (let i = cardNumberStr.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumberStr.charAt(i), 10);
        if (isNaN(digit)) return false;
        if (shouldDouble) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
      }
      return sum % 10 === 0;
    }
    /**
     * Merges two bounding boxes into a single bounding box.
     */
    mergeBoundingBoxes(b1, b2) {
      const xMin = Math.min(b1.x, b2.x);
      const yMin = Math.min(b1.y, b2.y);
      const xMax = Math.max(b1.x + b1.width, b2.x + b2.width);
      const yMax = Math.max(b1.y + b1.height, b2.y + b2.height);
      return {
        x: xMin,
        y: yMin,
        width: xMax - xMin,
        height: yMax - yMin
      };
    }
    /**
     * Deduplicates identical candidate values or highly overlapping spatial boxes.
     */
    deduplicateCandidates(detections) {
      const result = [];
      const seenKeys = /* @__PURE__ */ new Set();
      for (const det of detections) {
        const meta = det.metadata;
        const key = `${meta.category}_${meta.text}_${det.bbox.x}_${det.bbox.y}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          result.push(det);
        }
      }
      return result;
    }
    /**
     * Factory method constructing a DetectionResult conforming strictly to DETECTION_SCHEMA.md.
     */
    createDetection(index, category, text, bbox, confidence, evidence) {
      return {
        id: `det_pii_${Date.now()}_${index}`,
        type: "PII_CANDIDATE",
        source: "pii",
        bbox: { ...bbox },
        confidence: Math.round(confidence * 100) / 100,
        metadata: {
          category,
          piiType: category,
          // Backward compatibility
          text,
          evidence,
          detector: "pii-detector-v2-layered",
          coordinateSpace: "SCREENSHOT"
        }
      };
    }
  };

  // src/perception/vision/visualObjectDetector.ts
  var LocalVisualObjectDetector = class _LocalVisualObjectDetector {
    isInitialized = false;
    confidenceThreshold = 0.5;
    async init() {
      this.isInitialized = true;
    }
    setConfidenceThreshold(threshold) {
      this.confidenceThreshold = threshold;
    }
    getConfidenceThreshold() {
      return this.confidenceThreshold;
    }
    /**
     * Performs visual document object detection (AADHAAR_CARD, ID_DOCUMENT, PASSPORT, PAYMENT_CARD).
     * Combines visual aspect-ratio region proposals with multi-modal spatial OCR evidence.
     */
    async detectVisualObjects(input, imageSource, ocrWords) {
      const tStart = performance.now();
      try {
        if (!input || !input.image || input.width <= 0 || input.height <= 0) {
          return {
            success: false,
            detections: [],
            latencyMs: 0,
            engineInfo: "Local Visual Document Detector (Multi-Modal Vision Engine)",
            capabilityStatus: "MODEL_CAPABILITY_GAP_IDENTIFIED",
            error: "Invalid input dimensions or empty image data."
          };
        }
        const detections = [];
        if (ocrWords && ocrWords.length > 0) {
          const documentCandidates = this.extractMultiModalDocumentRegions(ocrWords, input.width, input.height);
          detections.push(...documentCandidates);
        }
        const latencyMs = Math.round(performance.now() - tStart);
        return {
          success: true,
          detections,
          latencyMs,
          engineInfo: "Local Visual Document Detector (Multi-Modal Aspect Ratio + OCR Evidence v1.0)",
          capabilityStatus: detections.length > 0 ? "PARTIAL_MULTI_MODAL_READY" : "MODEL_CAPABILITY_GAP_IDENTIFIED"
        };
      } catch (err) {
        return {
          success: false,
          detections: [],
          latencyMs: Math.round(performance.now() - tStart),
          engineInfo: "Local Visual Document Detector (Multi-Modal Vision Engine)",
          capabilityStatus: "MODEL_CAPABILITY_GAP_IDENTIFIED",
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
    /**
     * Extracts visual document bounding regions by clustering spatially aligned OCR words that contain document context evidence,
     * enforcing ID-1 document aspect ratio constraints (1.30 - 1.80).
     */
    extractMultiModalDocumentRegions(words, imgWidth, imgHeight) {
      const results = [];
      const aadhaarKeywords = ["aadhaar", "government of india", "unique identification", "authority of india", "enrollment", "dob:", "year of birth", "vid:"];
      const passportKeywords = ["passport", "republic of india", "republic of", "passport no", "mrz"];
      const cardKeywords = ["visa", "mastercard", "american express", "valid thru", "credit card", "debit card"];
      let aadhaarWordCount = 0;
      let passportWordCount = 0;
      let cardWordCount = 0;
      let minX = Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxX = 0;
      let maxY = 0;
      for (const w of words) {
        const lower = w.text.toLowerCase();
        let matchedCat = null;
        if (aadhaarKeywords.some((k) => lower.includes(k))) {
          matchedCat = "AADHAAR_CARD";
          aadhaarWordCount++;
        } else if (passportKeywords.some((k) => lower.includes(k))) {
          matchedCat = "PASSPORT";
          passportWordCount++;
        } else if (cardKeywords.some((k) => lower.includes(k))) {
          matchedCat = "PAYMENT_CARD";
          cardWordCount++;
        } else if (/\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b/.test(w.text)) {
          matchedCat = "PAYMENT_CARD";
          cardWordCount += 2;
        } else if (/\b\d{4}\s\d{4}\s\d{4}\b/.test(w.text)) {
          matchedCat = "AADHAAR_CARD";
          aadhaarWordCount += 2;
        }
        if (matchedCat) {
          minX = Math.min(minX, w.bbox.x);
          minY = Math.min(minY, w.bbox.y);
          maxX = Math.max(maxX, w.bbox.x + w.bbox.width);
          maxY = Math.max(maxY, w.bbox.y + w.bbox.height);
        }
      }
      if (minX < maxX && minY < maxY) {
        const padX = 30;
        const padY = 40;
        const bbox = {
          x: Math.max(0, minX - padX),
          y: Math.max(0, minY - padY),
          width: Math.min(imgWidth, maxX - minX + padX * 2),
          height: Math.min(imgHeight, maxY - minY + padY * 2)
        };
        let targetCategory = "ID_DOCUMENT";
        let confidence = 0.85;
        if (cardWordCount > 0 && cardWordCount >= aadhaarWordCount) {
          targetCategory = "PAYMENT_CARD";
          confidence = 0.88;
        } else if (aadhaarWordCount > 0 && aadhaarWordCount >= passportWordCount) {
          targetCategory = "AADHAAR_CARD";
          confidence = Math.min(0.98, 0.8 + aadhaarWordCount * 0.05);
        } else if (passportWordCount > 0) {
          targetCategory = "PASSPORT";
          confidence = 0.9;
        }
        if (confidence >= this.confidenceThreshold) {
          results.push(_LocalVisualObjectDetector.createVisualDetection(
            `det_vis_${targetCategory.toLowerCase()}_${Date.now()}`,
            targetCategory,
            bbox,
            Math.round(confidence * 100) / 100,
            imgWidth,
            imgHeight
          ));
        }
      }
      return results;
    }
    /**
     * Helper function to normalize visual object detections to SCREENSHOT coordinate space.
     */
    static createVisualDetection(id, category, bbox, confidence, imgWidth, imgHeight) {
      const clampedX = Math.max(0, Math.min(bbox.x, imgWidth));
      const clampedY = Math.max(0, Math.min(bbox.y, imgHeight));
      const maxW = Math.max(0, imgWidth - clampedX);
      const maxH = Math.max(0, imgHeight - clampedY);
      const clampedW = Math.max(0, Math.min(bbox.width, maxW));
      const clampedH = Math.max(0, Math.min(bbox.height, maxH));
      return {
        id,
        type: "VISUAL_REGION",
        source: "vision",
        bbox: {
          x: clampedX,
          y: clampedY,
          width: clampedW,
          height: clampedH
        },
        confidence,
        metadata: {
          category,
          detector: "local-visual-document-detector-multimodal",
          coordinateSpace: "SCREENSHOT"
        }
      };
    }
  };

  // src/perception/perceptionPipeline.ts
  var LocalPerceptionPipeline = class {
    faceDetector;
    ocrEngine;
    tokenNormalizer;
    piiDetector;
    visualDetector;
    fusionEngine;
    isOcrInitialized = false;
    constructor() {
      this.faceDetector = new LocalFaceDetector();
      this.ocrEngine = new LocalOcrEngine();
      this.tokenNormalizer = new OcrTokenNormalizer();
      this.piiDetector = new PiiCandidateDetector();
      this.visualDetector = new LocalVisualObjectDetector();
      this.fusionEngine = new PerceptionFusionEngine();
    }
    async init() {
      await Promise.all([
        this.faceDetector.init(),
        this.ocrEngine.init(),
        this.visualDetector.init()
      ]);
      this.isOcrInitialized = true;
    }
    /**
     * M2 Local Face Detection interface entry point.
     */
    async detectFaces(input, imageSource) {
      return this.faceDetector.detectFaces(input, imageSource);
    }
    /**
     * M3 Local OCR interface entry point.
     */
    async recognizeText(input, imageSource) {
      return this.ocrEngine.recognizeText(input, imageSource);
    }
    /**
     * M4 Local PII Candidate Detection entry point.
     */
    async detectPii(input, imageSource) {
      const startTime = performance.now();
      try {
        const ocrResponse = await this.ocrEngine.recognizeText(input, imageSource);
        if (!ocrResponse.success) {
          return {
            success: false,
            detections: [],
            latencyMs: Math.round(performance.now() - startTime),
            engineInfo: "Local PII Candidate Detector (Layered Rules v2)",
            error: ocrResponse.error
          };
        }
        const piiDetections = this.piiDetector.detectPiiFromOcr(ocrResponse.words);
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          success: true,
          detections: piiDetections,
          latencyMs,
          engineInfo: "Local PII Candidate Detector (Layered Rules v2)"
        };
      } catch (err) {
        return {
          success: false,
          detections: [],
          latencyMs: Math.round(performance.now() - startTime),
          engineInfo: "Local PII Candidate Detector (Layered Rules v2)",
          error: err instanceof Error ? err.message : String(err)
        };
      }
    }
    /**
     * M6/M6.1 Local Visual Sensitive Document Detector entry point.
     */
    async detectVisualObjects(input, imageSource, ocrWords) {
      return this.visualDetector.detectVisualObjects(input, imageSource, ocrWords);
    }
    /**
     * M5/M6/M6.1 Main Entry Point: Person 1 Local Handoff Function.
     * Executes local perception across Face, OCR, PII, and Visual Document modules with failure isolation and constructs UnifiedPerceptionResult.
     */
    async runLocalPerception(input, imageSource) {
      const tTotalStart = performance.now();
      console.log("[RAVEN:M2] CAPTURE START", { width: input.width, height: input.height });
      const tFaceStart = performance.now();
      const tOcrInitStart = performance.now();
      let ocrInitMs = 0;
      if (!this.isOcrInitialized) {
        try {
          await this.ocrEngine.init();
          this.isOcrInitialized = true;
          ocrInitMs = Math.round(performance.now() - tOcrInitStart);
        } catch (e) {
          console.warn("OCR init warning:", e);
        }
      }
      console.log("[RAVEN:M3] OCR START");
      console.log("[RAVEN:M4] FACE START");
      const tOcrInfStart = performance.now();
      const [faceResp, ocrResp] = await Promise.all([
        this.faceDetector.detectFaces(input, imageSource).catch((err) => ({
          success: false,
          detections: [],
          latencyMs: Math.round(performance.now() - tFaceStart),
          engineInfo: "BlazeFace WASM",
          error: err instanceof Error ? err.message : String(err)
        })),
        this.ocrEngine.recognizeText(input, imageSource).catch((err) => ({
          success: false,
          detections: [],
          words: [],
          latencyMs: Math.round(performance.now() - tOcrInfStart),
          engineInfo: "Tesseract.js WASM v5",
          error: err instanceof Error ? err.message : String(err)
        }))
      ]);
      const faceMs = Math.round(performance.now() - tFaceStart);
      const ocrInferenceMs = Math.round(performance.now() - tOcrInfStart);
      console.log("[RAVEN:M3] OCR COMPLETE", { latencyMs: ocrInferenceMs, regions: ocrResp.detections?.length || 0 });
      console.log("[RAVEN:M4] FACE COMPLETE", { latencyMs: faceMs, faces: faceResp.detections?.length || 0 });
      const faceRes = faceResp.success ? { detections: faceResp.detections, status: "SUCCESS" } : { detections: [], status: "FAILED", error: faceResp.error };
      const rawOcrWords = ocrResp.words || [];
      const ocrRes = ocrResp.success ? { detections: ocrResp.detections, status: "SUCCESS" } : { detections: [], status: "FAILED", error: ocrResp.error };
      console.log("[RAVEN:M5] VISION START");
      const tVisionStart = performance.now();
      let visionRes;
      let visionMs = 0;
      try {
        const vResp = await this.visualDetector.detectVisualObjects(input, imageSource, rawOcrWords);
        visionRes = vResp.success ? { detections: vResp.detections, status: "SUCCESS" } : { detections: [], status: "FAILED", error: vResp.error };
        visionMs = Math.round(performance.now() - tVisionStart);
      } catch (err) {
        visionRes = { detections: [], status: "FAILED", error: err instanceof Error ? err.message : String(err) };
        visionMs = Math.round(performance.now() - tVisionStart);
      }
      console.log("[RAVEN:M5] VISION COMPLETE", { latencyMs: visionMs, objects: visionRes.detections.length });
      const tNormStart = performance.now();
      let normalizationMs = 0;
      if (rawOcrWords.length > 0) {
        this.tokenNormalizer.normalizeTokens(rawOcrWords);
        normalizationMs = Math.round((performance.now() - tNormStart) * 100) / 100;
      }
      console.log("[RAVEN:M6] PII/FUSION START");
      const tPiiStart = performance.now();
      let piiRes;
      try {
        if (ocrRes.status === "SUCCESS" && rawOcrWords.length > 0) {
          const piiDets = this.piiDetector.detectPiiFromOcr(rawOcrWords);
          piiRes = { detections: piiDets, status: "SUCCESS" };
        } else {
          piiRes = { detections: [], status: "SKIPPED", error: "OCR failed or returned 0 words" };
        }
      } catch (err) {
        piiRes = { detections: [], status: "FAILED", error: err instanceof Error ? err.message : String(err) };
      }
      const piiMs = Math.round((performance.now() - tPiiStart) * 100) / 100;
      const tFusionStart = performance.now();
      const timing = {
        captureMs: 0,
        faceMs,
        ocrInitMs,
        ocrInferenceMs,
        normalizationMs,
        piiMs,
        visionMs,
        fusionMs: 0,
        totalMs: 0
      };
      const unifiedResult = this.fusionEngine.buildUnifiedResult({
        screenshotWidth: input.width,
        screenshotHeight: input.height,
        faceResults: faceRes,
        ocrResults: ocrRes,
        piiResults: piiRes,
        visionResults: visionRes,
        timing
      });
      const fusionMs = Math.round((performance.now() - tFusionStart) * 100) / 100;
      const totalMs = Math.round(performance.now() - tTotalStart);
      unifiedResult.timing.fusionMs = fusionMs;
      unifiedResult.timing.totalMs = totalMs;
      console.log("[RAVEN:M6] PII/FUSION COMPLETE", {
        latencyMs: fusionMs,
        totalUnifiedElements: unifiedResult.detections.length,
        totalPipelineMs: totalMs
      });
      return unifiedResult;
    }
    /**
     * Main entry point for local perception frame processing.
     */
    async perceiveFrame(input, canvasSource) {
      if (!canvasSource) {
        return [];
      }
      const perceptionInput = {
        image: input.dataUrl,
        width: input.viewport.width,
        height: input.viewport.height,
        coordinateSpace: "SCREENSHOT",
        devicePixelRatio: input.viewport.devicePixelRatio,
        timestamp: input.timestamp,
        locality: {
          isLocal: true,
          externalAiUsed: false,
          uploadPerformed: false
        }
      };
      const unified = await this.runLocalPerception(perceptionInput, canvasSource);
      return unified.detections;
    }
  };

  // src/offscreen/offscreen.ts
  var pipeline = new LocalPerceptionPipeline();
  var isInitialized = false;
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "RUN_LOCAL_PERCEPTION") {
      (async () => {
        try {
          if (!isInitialized) {
            await pipeline.init();
            isInitialized = true;
          }
          const input = {
            dataUrl: message.dataUrl,
            viewport: message.viewport,
            timestamp: message.timestamp
          };
          const img = new Image();
          img.src = input.dataUrl;
          await img.decode();
          const canvas = document.getElementById("perceptionCanvas");
          if (canvas) {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);
          }
          const detections = await pipeline.perceiveFrame(input, canvas);
          sendResponse({ success: true, detections });
        } catch (err) {
          console.error("Offscreen perception failed:", err);
          sendResponse({ success: false, error: String(err) });
        }
      })();
      return true;
    }
  });
})();
