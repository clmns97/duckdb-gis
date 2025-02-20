#define DUCKDB_EXTENSION_MAIN

#include "ui_extension.hpp"
#include "http_server.hpp"
#include "state.hpp"
#include "utils/env.hpp"
#include "utils/helpers.hpp"
#include <duckdb.hpp>
#include <duckdb/common/string_util.hpp>

#ifdef _WIN32
#define OPEN_COMMAND "start"
#elif __linux__
#define OPEN_COMMAND "xdg-open"
#else
#define OPEN_COMMAND "open"
#endif

#define UI_LOCAL_PORT_SETTING_NAME "ui_local_port"
#define UI_LOCAL_PORT_SETTING_DESCRIPTION                                      \
  "Local port on which the UI server listens"
#define UI_LOCAL_PORT_SETTING_DEFAULT 4213

#define UI_REMOTE_URL_SETTING_NAME "ui_remote_url"
#define UI_REMOTE_URL_SETTING_DESCRIPTION                                      \
  "Remote URL to which the UI server forwards GET requests"
#define UI_REMOTE_URL_SETTING_DEFAULT "https://app.motherduck.com"

namespace duckdb {

namespace internal {

const ui::HttpServer &StartHttpServer(ClientContext &context,
                                      bool *was_started = nullptr) {
  const auto remote_url =
      GetSetting<std::string>(context, UI_REMOTE_URL_SETTING_NAME,
                              GetEnvOrDefault(UI_REMOTE_URL_SETTING_NAME,
                                              UI_REMOTE_URL_SETTING_DEFAULT));
  const uint16_t port = GetSetting(context, UI_LOCAL_PORT_SETTING_NAME,
                                   UI_LOCAL_PORT_SETTING_DEFAULT);
  return ui::HttpServer::GetInstance(context)->Start(port, remote_url,
                                                     was_started);
}

} // namespace internal

std::string StartUIFunction(ClientContext &context) {
  const auto &server = internal::StartHttpServer(context);
  const auto local_url = server.LocalUrl();

  const std::string command =
      StringUtil::Format("%s %s", OPEN_COMMAND, local_url);
  return system(command.c_str())
             ? StringUtil::Format("Navigate browser to %s",
                                  local_url) // open command failed
             : StringUtil::Format("UI started at %s", local_url);
}

std::string StartUIServerFunction(ClientContext &context) {
  bool was_started = false;
  const auto &server = internal::StartHttpServer(context, &was_started);
  const char *already = was_started ? "already " : "";
  return StringUtil::Format("UI server %sstarted at %s", already,
                            server.LocalUrl());
}

std::string StopUIServerFunction(ClientContext &context) {
  return ui::HttpServer::GetInstance(context)->Stop()
             ? "UI server stopped"
             : "UI server already stopped";
}

// Connected notification
struct NotifyConnectedFunctionData : public TableFunctionData {
  NotifyConnectedFunctionData(std::string _token) : token(_token) {}

  std::string token;
};

static unique_ptr<FunctionData>
NotifyConnectedBind(ClientContext &, TableFunctionBindInput &input,
                    vector<LogicalType> &out_types, vector<string> &out_names) {
  if (input.inputs[0].IsNull()) {
    throw BinderException("Must provide a token");
  }

  out_names.emplace_back("result");
  out_types.emplace_back(LogicalType::VARCHAR);
  return make_uniq<NotifyConnectedFunctionData>(input.inputs[0].ToString());
}

std::string NotifyConnectedFunction(ClientContext &context,
                                    TableFunctionInput &input) {
  auto &inputs = input.bind_data->Cast<NotifyConnectedFunctionData>();
  ui::HttpServer::GetInstance(context)->SendConnectedEvent(inputs.token);
  return "OK";
}

std::string NotifyCatalogChangedFunction(ClientContext &context) {
  ui::HttpServer::GetInstance(context)->SendCatalogChangedEvent();
  return "OK";
}

// - connected notification

unique_ptr<FunctionData> SingleBoolResultBind(ClientContext &,
                                              TableFunctionBindInput &,
                                              vector<LogicalType> &out_types,
                                              vector<std::string> &out_names) {
  out_names.emplace_back("result");
  out_types.emplace_back(LogicalType::BOOLEAN);
  return nullptr;
}

void IsUIStartedTableFunc(ClientContext &context, TableFunctionInput &input,
                          DataChunk &output) {
  if (!internal::ShouldRun(input)) {
    return;
  }

  output.SetCardinality(1);
  output.SetValue(0, 0, ui::HttpServer::Started());
}

void InitStorageExtension(duckdb::DatabaseInstance &db) {
  auto &config = db.config;
  auto ext = duckdb::make_uniq<duckdb::StorageExtension>();
  ext->storage_info = duckdb::make_uniq<UIStorageExtensionInfo>();
  config.storage_extensions[STORAGE_EXTENSION_KEY] = std::move(ext);
}

static void LoadInternal(DatabaseInstance &instance) {
  InitStorageExtension(instance);

  // If the server is already running we need to update the database instance
  // since the previous one was invalidated (eg. in the shell when we '.open'
  // a new database)
  ui::HttpServer::UpdateDatabaseInstanceIfRunning(instance.shared_from_this());

  auto &config = DBConfig::GetConfig(instance);
  config.AddExtensionOption(
      UI_LOCAL_PORT_SETTING_NAME, UI_LOCAL_PORT_SETTING_DESCRIPTION,
      LogicalType::USMALLINT, Value::USMALLINT(UI_LOCAL_PORT_SETTING_DEFAULT));

  config.AddExtensionOption(
      UI_REMOTE_URL_SETTING_NAME, UI_REMOTE_URL_SETTING_DESCRIPTION,
      LogicalType::VARCHAR,
      Value(GetEnvOrDefault(UI_REMOTE_URL_SETTING_NAME,
                            UI_REMOTE_URL_SETTING_DEFAULT)));

  RESISTER_TF("start_ui", StartUIFunction);
  RESISTER_TF("start_ui_server", StartUIServerFunction);
  RESISTER_TF("stop_ui_server", StopUIServerFunction);
  RESISTER_TF("notify_ui_catalog_changed", NotifyCatalogChangedFunction);
  RESISTER_TF_ARGS("notify_ui_connected", {LogicalType::VARCHAR},
                   NotifyConnectedFunction, NotifyConnectedBind);
  {
    TableFunction tf("ui_is_started", {}, IsUIStartedTableFunc,
                     SingleBoolResultBind, RunOnceTableFunctionState::Init);
    ExtensionUtil::RegisterFunction(instance, tf);
  }
}

void UiExtension::Load(DuckDB &db) { LoadInternal(*db.instance); }
std::string UiExtension::Name() { return "ui"; }

std::string UiExtension::Version() const {
#ifdef UI_EXTENSION_GIT_SHA
  return UI_EXTENSION_GIT_SHA;
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
