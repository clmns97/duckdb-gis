#pragma once

#include <duckdb.hpp>
#include <duckdb/main/extension_util.hpp>
#include <type_traits>

namespace duckdb {

typedef std::string (*simple_tf_t)(ClientContext &);

struct RunOnceTableFunctionState : GlobalTableFunctionState {
  RunOnceTableFunctionState() : run(false){};
  std::atomic<bool> run;

  static unique_ptr<GlobalTableFunctionState> Init(ClientContext &,
                                                   TableFunctionInitInput &) {
    return make_uniq<RunOnceTableFunctionState>();
  }
};

template <typename T>
T GetSetting(const ClientContext &context, const char *setting_name,
             const T default_value) {
  Value value;
  return context.TryGetCurrentSetting(setting_name, value) ? value.GetValue<T>()
                                                           : default_value;
}

namespace internal {
unique_ptr<FunctionData> ResultBind(ClientContext &, TableFunctionBindInput &,
                                    vector<LogicalType> &,
                                    vector<std::string> &);

bool ShouldRun(TableFunctionInput &input);

template <typename Func> struct CallFunctionHelper;

template <> struct CallFunctionHelper<std::string (*)()> {
  static std::string call(ClientContext &context, TableFunctionInput &input,
                          std::string (*f)()) {
    return f();
  }
};

template <> struct CallFunctionHelper<std::string (*)(ClientContext &)> {
  static std::string call(ClientContext &context, TableFunctionInput &input,
                          std::string (*f)(ClientContext &)) {
    return f(context);
  }
};

template <>
struct CallFunctionHelper<std::string (*)(ClientContext &,
                                          TableFunctionInput &)> {
  static std::string call(ClientContext &context, TableFunctionInput &input,
                          std::string (*f)(ClientContext &,
                                           TableFunctionInput &)) {
    return f(context, input);
  }
};

template <typename Func, Func func>
void TableFunc(ClientContext &context, TableFunctionInput &input,
               DataChunk &output) {
  if (!ShouldRun(input)) {
    return;
  }

  const std::string result =
      CallFunctionHelper<Func>::call(context, input, func);
  output.SetCardinality(1);
  output.SetValue(0, 0, result);
}

template <typename Func, Func func>
void RegisterTF(DatabaseInstance &instance, const char *name) {
  TableFunction tf(name, {}, internal::TableFunc<Func, func>,
                   internal::ResultBind, RunOnceTableFunctionState::Init);
  ExtensionUtil::RegisterFunction(instance, tf);
}

template <typename Func, Func func>
void RegisterTFWithArgs(DatabaseInstance &instance, const char *name,
                        vector<LogicalType> arguments,
                        table_function_bind_t bind) {
  TableFunction tf(name, arguments, internal::TableFunc<Func, func>, bind,
                   RunOnceTableFunctionState::Init);
  ExtensionUtil::RegisterFunction(instance, tf);
}

} // namespace internal

#define RESISTER_TF(name, func)                                                \
  internal::RegisterTF<decltype(&func), &func>(instance, name)

#define RESISTER_TF_ARGS(name, args, func, bind)                               \
  internal::RegisterTFWithArgs<decltype(&func), &func>(instance, name, args,   \
                                                       bind)

} // namespace duckdb
