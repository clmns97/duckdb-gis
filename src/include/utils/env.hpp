#pragma once

#include <string>

namespace duckdb {

const char *TryGetEnv(const char *name);

std::string GetEnvOrDefault(const char *name, const char *default_value);

bool IsEnvEnabled(const char *name);

} // namespace duckdb
