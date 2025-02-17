#define DUCKDB_EXTENSION_MAIN

#include "ui_extension.hpp"
#include "duckdb.hpp"
#include "duckdb/common/exception.hpp"
#include "duckdb/common/string_util.hpp"
#include "duckdb/function/scalar_function.hpp"
#include "duckdb/main/extension_util.hpp"
#include <duckdb/parser/parsed_data/create_scalar_function_info.hpp>

// OpenSSL linked through vcpkg
#include <openssl/opensslv.h>

namespace duckdb {

inline void UiScalarFun(DataChunk &args, ExpressionState &state, Vector &result) {
    auto &name_vector = args.data[0];
    UnaryExecutor::Execute<string_t, string_t>(
	    name_vector, result, args.size(),
	    [&](string_t name) {
			return StringVector::AddString(result, "Ui "+name.GetString()+" 🐥");
        });
}

inline void UiOpenSSLVersionScalarFun(DataChunk &args, ExpressionState &state, Vector &result) {
    auto &name_vector = args.data[0];
    UnaryExecutor::Execute<string_t, string_t>(
	    name_vector, result, args.size(),
	    [&](string_t name) {
			return StringVector::AddString(result, "Ui " + name.GetString() +
                                                     ", my linked OpenSSL version is " +
                                                     OPENSSL_VERSION_TEXT );
        });
}

static void LoadInternal(DatabaseInstance &instance) {
    // Register a scalar function
    auto ui_scalar_function = ScalarFunction("ui", {LogicalType::VARCHAR}, LogicalType::VARCHAR, UiScalarFun);
    ExtensionUtil::RegisterFunction(instance, ui_scalar_function);

    // Register another scalar function
    auto ui_openssl_version_scalar_function = ScalarFunction("ui_openssl_version", {LogicalType::VARCHAR},
                                                LogicalType::VARCHAR, UiOpenSSLVersionScalarFun);
    ExtensionUtil::RegisterFunction(instance, ui_openssl_version_scalar_function);
}

void UiExtension::Load(DuckDB &db) {
	LoadInternal(*db.instance);
}
std::string UiExtension::Name() {
	return "ui";
}

std::string UiExtension::Version() const {
#ifdef EXT_VERSION_UI
	return EXT_VERSION_UI;
#else
	return "";
#endif
}

} // namespace duckdb

extern "C" {

DUCKDB_EXTENSION_API void ui_init(duckdb::DatabaseInstance &db) {
    duckdb::DuckDB db_wrapper(db);
    db_wrapper.LoadExtension<duckdb::UiExtension>();
}

DUCKDB_EXTENSION_API const char *ui_version() {
	return duckdb::DuckDB::LibraryVersion();
}
}

#ifndef DUCKDB_EXTENSION_MAIN
#error DUCKDB_EXTENSION_MAIN not defined
#endif
