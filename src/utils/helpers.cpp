#include "utils/helpers.hpp"
#include <duckdb/main/extension_util.hpp>

namespace duckdb {

bool ShouldRun(TableFunctionInput &input) {
	auto state = dynamic_cast<RunOnceTableFunctionState *>(input.global_state.get());
	D_ASSERT(state != nullptr);
	if (state->run) {
		return false;
	}

	state->run = true;
	return true;
}

unique_ptr<FunctionData> ResultBind(ClientContext &, TableFunctionBindInput &,
	vector<LogicalType> &out_types,
	vector<std::string> &out_names) {
	out_names.emplace_back("result");
	out_types.emplace_back(LogicalType::VARCHAR);
	return nullptr;
}

void RegisterTF(DatabaseInstance &instance, const char* name, table_function_t func) {
	TableFunction tf(name, {}, func, ResultBind, RunOnceTableFunctionState::Init);
	ExtensionUtil::RegisterFunction(instance, tf);
}

} // namespace duckdb
