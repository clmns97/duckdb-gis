#define DUCKDB_EXTENSION_MAIN

#include <duckdb.hpp>
#include <duckdb/common/string_util.hpp>

#include "http_server.hpp"
#include "settings.hpp"
#include "state.hpp"
#include "gis_extension.hpp"
#include "utils/env.hpp"
#include "utils/helpers.hpp"
#include "version.hpp"

#ifdef _WIN32
#define OPEN_COMMAND "start"
#undef CreateDirectory // avoid being transformed to `CreateDirectoryA`
#elif __linux__
#define OPEN_COMMAND "xdg-open"
#else
#define OPEN_COMMAND "open"
#endif

namespace duckdb {

std::string StartUIFunction(ClientContext &context) {
  if (!ui::HttpServer::Started() &&
      ui::HttpServer::IsRunningOnMachine(context)) {
    return "duckdb-gis already running in a different DuckDB instance";
  }

  const auto &server = ui::HttpServer::Start(context);
  const auto local_url = server.LocalUrl();

  const auto command = StringUtil::Format("%s %s", OPEN_COMMAND, local_url);
  return system(command.c_str())
             ? StringUtil::Format("Navigate browser to %s",
                                  local_url) // open command failed
             : StringUtil::Format("duckdb-gis started at %s", local_url);
}

std::string StartUIServerFunction(ClientContext &context) {
  if (!ui::HttpServer::Started() &&
      ui::HttpServer::IsRunningOnMachine(context)) {
    return "duckdb-gis already running in a different DuckDB instance";
  }

  bool was_started = false;
  const auto &server = ui::HttpServer::Start(context, &was_started);
  const char *already = was_started ? "already " : "";
  return StringUtil::Format("duckdb-gis server %sstarted at %s", already,
                            server.LocalUrl());
}

std::string StopUIServerFunction(ClientContext &context) {
  return ui::HttpServer::Stop() ? "duckdb-gis server stopped"
                                : "duckdb-gis server already stopped";
}

std::string GetUIURLFunction(ClientContext &context) {
  if (!ui::HttpServer::Started()) {
    throw ExecutorException("duckdb-gis server not started");
  }

  auto server = ui::HttpServer::GetInstance(context);
  return server->LocalUrl();
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

#if DUCKDB_VERSION_AT_LEAST(1, 5, 0)
  auto ext = duckdb::make_shared_ptr<duckdb::StorageExtension>();
  ext->storage_info = duckdb::make_uniq<UIStorageExtensionInfo>();
  StorageExtension::Register(config, STORAGE_EXTENSION_KEY, ext);
#else
  auto ext = duckdb::make_uniq<duckdb::StorageExtension>();
  ext->storage_info = duckdb::make_uniq<UIStorageExtensionInfo>();
  config.storage_extensions[STORAGE_EXTENSION_KEY] = std::move(ext);
#endif
}

#ifdef DUCKDB_CPP_EXTENSION_ENTRY
static void LoadInternal(ExtensionLoader &loader) {
  auto &instance = loader.GetDatabaseInstance();
#else
static void LoadInternal(DatabaseInstance &instance) {
#endif
  InitStorageExtension(instance);

  // If the server is already running we need to update the database instance
  // since the previous one was invalidated (eg. in the shell when we '.open'
  // a new database)
  ui::HttpServer::UpdateDatabaseInstanceIfRunning(instance.shared_from_this());

  auto &fs = FileSystem::GetFileSystem(instance);
  // CreateDirectory is a single-level mkdir; ~/.duckdb won't exist yet on a
  // genuinely fresh home directory (a pristine CI container, or a real
  // first-time install), so it must be created recursively. Expand "~" on
  // its own and JoinPath the rest, rather than embedding "/" in a string
  // with "~" -- ExpandPath produces a native (backslash) path on Windows, so
  // concatenating "~/.duckdb/..." mixes separators, which broke path parsing
  // there (observed: CreateDirectoriesRecursive still failed on Windows CI
  // with a mixed "C:\Users\foo/.duckdb/..." path). Chain the two-arg
  // JoinPath rather than the variadic N-arg overload: this extension
  // supports DuckDB back to v1.4, whose FileSystem header doesn't have the
  // variadic template (confirmed by a v1.4.5/linux_arm64 CI build failure).
  auto data_dir = fs.JoinPath(fs.ExpandPath("~"), ".duckdb");
  data_dir = fs.JoinPath(data_dir, "extension_data");
  data_dir = fs.JoinPath(data_dir, "gis");
  fs.CreateDirectoriesRecursive(data_dir);

  auto &config = DBConfig::GetConfig(instance);
  {
    auto default_port = GetEnvOrDefaultInt(UI_LOCAL_PORT_SETTING_NAME,
                                           UI_LOCAL_PORT_SETTING_DEFAULT);
    config.AddExtensionOption(
        UI_LOCAL_PORT_SETTING_NAME, "Local port on which the UI server listens",
        LogicalType::USMALLINT, Value::USMALLINT(default_port));
  }

  {
    auto def = GetEnvOrDefault(UI_REMOTE_URL_SETTING_NAME,
                               UI_REMOTE_URL_SETTING_DEFAULT);
    config.AddExtensionOption(
        UI_REMOTE_URL_SETTING_NAME,
        "Remote URL to which the UI server forwards GET requests",
        LogicalType::VARCHAR, Value(def));
  }

  {
    auto def = GetEnvOrDefaultInt(UI_POLLING_INTERVAL_SETTING_NAME,
                                  UI_POLLING_INTERVAL_SETTING_DEFAULT);
    config.AddExtensionOption(
        UI_POLLING_INTERVAL_SETTING_NAME,
        "Period of time between UI polling requests (in ms)",
        LogicalType::UINTEGER, Value::UINTEGER(def));
  }

  // duckdb-gis launch verbs. No start_ui/*_ui aliases: this extension can be
  // LOADed alongside DuckDB core's own `ui` extension, so registering names it
  // already owns would collide (see T-052). That means `duckdb -ui`, which the
  // shell hardcodes to `CALL start_ui()`, no longer launches this UI. Users can
  // restore it with `.ui_command start_gis()` in their `~/.duckdbrc`.
  REGISTER_TF("start_gis", StartUIFunction);
  REGISTER_TF("start_gis_server", StartUIServerFunction);
  REGISTER_TF("stop_gis_server", StopUIServerFunction);
  REGISTER_TF("get_gis_url", GetUIURLFunction);
  {
    TableFunction gis_tf("gis_is_started", {}, IsUIStartedTableFunc,
                         internal::SingleBoolResultBind,
                         RunOnceTableFunctionState::Init);
#ifdef DUCKDB_CPP_EXTENSION_ENTRY
    loader.RegisterFunction(gis_tf);
#else
    ExtensionUtil::RegisterFunction(instance, gis_tf);
#endif
  }
}

#ifdef DUCKDB_CPP_EXTENSION_ENTRY
void GisExtension::Load(ExtensionLoader &loader) { LoadInternal(loader); }
#else
void GisExtension::Load(DuckDB &db) { LoadInternal(*db.instance); }
#endif

std::string GisExtension::Name() { return "gis"; }

std::string GisExtension::Version() const { return UI_EXTENSION_VERSION; }

} // namespace duckdb

extern "C" {

#ifdef DUCKDB_CPP_EXTENSION_ENTRY
DUCKDB_CPP_EXTENSION_ENTRY(gis, loader) { duckdb::LoadInternal(loader); }
#else
DUCKDB_EXTENSION_API void gis_init(duckdb::DatabaseInstance &db) {
  duckdb::DuckDB db_wrapper(db);
  db_wrapper.LoadExtension<duckdb::GisExtension>();
}
#endif

DUCKDB_EXTENSION_API const char *gis_version() {
  return duckdb::DuckDB::LibraryVersion();
}
}

#ifndef DUCKDB_EXTENSION_MAIN
#error DUCKDB_EXTENSION_MAIN not defined
#endif
