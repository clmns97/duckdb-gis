#define DUCKDB_EXTENSION_MAIN

#include "utils/env.hpp"
#include "utils/helpers.hpp"
#include "ui_extension.hpp"
#include "http_server.hpp"
#include <duckdb.hpp>
#include <duckdb/common/string_util.hpp>

#ifdef _WIN32
#define OPEN_COMMAND "start"
#elif __linux__
#define OPEN_COMMAND "xdg-open"
#else
#define OPEN_COMMAND "open"
#endif

#define UI_LOCAL_PORT_SETTING_NAME        "ui_local_port"
#define UI_LOCAL_PORT_SETTING_DESCRIPTION "Local port on which the UI server listens"
#define UI_LOCAL_PORT_SETTING_DEFAULT     4213

#define UI_REMOTE_URL_SETTING_NAME        "ui_remote_url"
#define UI_REMOTE_URL_SETTING_DESCRIPTION "Remote URL to which the UI server forwards GET requests"
#define UI_REMOTE_URL_SETTING_DEFAULT     "https://app.motherduck.com"

namespace duckdb {

namespace internal {

bool StartHttpServer(const ClientContext &context) {
	const auto url = GetSetting<std::string>(context, UI_REMOTE_URL_SETTING_NAME,
		GetEnvOrDefault(UI_REMOTE_URL_SETTING_NAME, UI_REMOTE_URL_SETTING_DEFAULT));
	const uint16_t port = GetSetting(context, UI_LOCAL_PORT_SETTING_NAME, UI_LOCAL_PORT_SETTING_DEFAULT);;
	return ui::HttpServer::instance()->Start(port, url, context.db);
}

std::string GetHttpServerLocalURL() {
	return StringUtil::Format("http://localhost:%d/", ui::HttpServer::instance()->LocalPort());
}

} // namespace internal

std::string StartUIFunction(ClientContext &context) {
	internal::StartHttpServer(context);
	auto local_url = internal::GetHttpServerLocalURL();

	const std::string command = StringUtil::Format("%s %s", OPEN_COMMAND, local_url);
	return system(command.c_str()) ?
		  StringUtil::Format("Navigate browser to %s", local_url) // open command failed
	 	: StringUtil::Format("MotherDuck UI started at %s", local_url);
}

std::string StartUIServerFunction(ClientContext &context) {
	const char* already = internal::StartHttpServer(context) ? "already " : "";
	return StringUtil::Format("MotherDuck UI server %sstarted at %s", already, internal::GetHttpServerLocalURL());
}

std::string StopUIServerFunction() {
	return ui::HttpServer::instance()->Stop() ? "UI server stopped" : "UI server already stopped";
}

// Connected notification
struct NotifyConnectedFunctionData : public TableFunctionData {
	NotifyConnectedFunctionData(std::string _token) : token(_token) {}

	std::string token;
};

static unique_ptr<FunctionData> NotifyConnectedBind(ClientContext &, TableFunctionBindInput &input,
	vector<LogicalType> &out_types, vector<string> &out_names) {
	if (input.inputs[0].IsNull()) {
		throw BinderException("Must provide a token");
	}

	out_names.emplace_back("result");
	out_types.emplace_back(LogicalType::VARCHAR);
	return make_uniq<NotifyConnectedFunctionData>(input.inputs[0].ToString());
}

std::string NotifyConnectedFunction(ClientContext &context, TableFunctionInput &input) {
	auto &inputs = input.bind_data->Cast<NotifyConnectedFunctionData>();
	ui::HttpServer::instance()->SendConnectedEvent(inputs.token);
	return "OK";
}

// - connected notification

std::string NotifyCatalogChangedFunction() {
	ui::HttpServer::instance()->SendCatalogChangedEvent();
	return "OK";
}

static void LoadInternal(DatabaseInstance &instance) {
    auto &config = DBConfig::GetConfig(instance);

	config.AddExtensionOption(UI_LOCAL_PORT_SETTING_NAME, UI_LOCAL_PORT_SETTING_DESCRIPTION,
								LogicalType::USMALLINT, Value::USMALLINT(UI_LOCAL_PORT_SETTING_DEFAULT));

	config.AddExtensionOption(
		UI_REMOTE_URL_SETTING_NAME, UI_REMOTE_URL_SETTING_DESCRIPTION, LogicalType::VARCHAR,
		Value(GetEnvOrDefault(UI_REMOTE_URL_SETTING_NAME, UI_REMOTE_URL_SETTING_DEFAULT)));

	RESISTER_TF("start_ui", StartUIFunction);
	RESISTER_TF("start_ui_server", StartUIServerFunction);
	RESISTER_TF("stop_ui_server", StopUIServerFunction);
	RESISTER_TF("notify_ui_catalog_changed", NotifyCatalogChangedFunction);
	RESISTER_TF_ARGS("notify_ui_connected", {LogicalType::VARCHAR}, NotifyConnectedFunction, NotifyConnectedBind);
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
