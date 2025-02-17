#pragma once

#include <duckdb.hpp>

namespace duckdb {

struct RunOnceTableFunctionState : GlobalTableFunctionState {
	RunOnceTableFunctionState() : run(false) {};
	std::atomic<bool> run;

	static unique_ptr<GlobalTableFunctionState> Init(ClientContext &,
																TableFunctionInitInput &) {
		return make_uniq<RunOnceTableFunctionState>();
	}
};

template <typename T>
T GetSetting(const ClientContext &context, const char *setting_name, const T default_value) {
	Value value;
	return context.TryGetCurrentSetting(setting_name, value) ? value.GetValue<T>() : default_value;
}

bool ShouldRun(TableFunctionInput &input);

void RegisterTF(DatabaseInstance &instance, const char* name, table_function_t func);

} // namespace duckdb
