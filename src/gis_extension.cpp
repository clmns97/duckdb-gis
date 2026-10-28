// The gis extension: registers the SQL functions that start and stop the UI
// server. Built on DuckDB's stable C extension API (see CMakeLists.txt).
#include "duckdb_extension.h"

#include "http_server.hpp"

#include <cstdint>
#include <cstdlib>
#include <exception>
#include <string>

DUCKDB_EXTENSION_EXTERN

namespace gis {

namespace {

constexpr uint16_t DEFAULT_PORT = 4214;
// Before the C-API port this was the gis_local_port setting (and its
// GIS_LOCAL_PORT environment variable). Custom settings need a newer C API
// than we target, so the port is a named parameter, with the variable as
// fallback.
constexpr const char *PORT_ENV_VAR = "GIS_LOCAL_PORT";

#ifdef _WIN32
constexpr const char *OPEN_COMMAND = "start";
#elif defined(__linux__)
constexpr const char *OPEN_COMMAND = "xdg-open";
#else
constexpr const char *OPEN_COMMAND = "open";
#endif

uint16_t PortFromEnvironment() {
  const char *value = std::getenv(PORT_ENV_VAR);
  if (!value || !*value) {
    return DEFAULT_PORT;
  }
  char *end = nullptr;
  long port = std::strtol(value, &end, 10);
  if (*end != '\0' || port < 1 || port > 65535) {
    return DEFAULT_PORT;
  }
  return static_cast<uint16_t>(port);
}

// What a function does when it runs. Each returns one row with one value.
enum class Verb { START_AND_OPEN, START, STOP, URL, IS_STARTED };

struct BindData {
  Verb verb;
  uint16_t port;
};

struct InitData {
  bool done = false;
};

std::string StartMessage(uint16_t port, bool &already_started) {
  StartServer(port, already_started);
  return std::string("duckdb-gis server ") + (already_started ? "already " : "") +
         "started at " + ServerUrl();
}

void Bind(duckdb_bind_info info) {
  auto verb = *static_cast<Verb *>(duckdb_bind_get_extra_info(info));
  auto data = new BindData{verb, PortFromEnvironment()};
  if (verb == Verb::START || verb == Verb::START_AND_OPEN) {
    duckdb_value port = duckdb_bind_get_named_parameter(info, "port");
    if (port) {
      int64_t requested = duckdb_get_int64(port);
      duckdb_destroy_value(&port);
      if (requested < 1 || requested > 65535) {
        delete data;
        duckdb_bind_set_error(info, "duckdb-gis: port must be between 1 and 65535");
        return;
      }
      data->port = static_cast<uint16_t>(requested);
    }
  }
  auto type = duckdb_create_logical_type(verb == Verb::IS_STARTED ? DUCKDB_TYPE_BOOLEAN
                                                                  : DUCKDB_TYPE_VARCHAR);
  duckdb_bind_add_result_column(info, "result", type);
  duckdb_destroy_logical_type(&type);
  duckdb_bind_set_bind_data(info, data, [](void *p) { delete static_cast<BindData *>(p); });
}

void Init(duckdb_init_info info) {
  duckdb_init_set_init_data(info, new InitData(),
                            [](void *p) { delete static_cast<InitData *>(p); });
}

// Runs the verb once, producing one row.
void Execute(duckdb_function_info info, duckdb_data_chunk output) {
  auto &init = *static_cast<InitData *>(duckdb_function_get_init_data(info));
  if (init.done) {
    duckdb_data_chunk_set_size(output, 0);
    return;
  }
  init.done = true;
  auto &bind = *static_cast<BindData *>(duckdb_function_get_bind_data(info));
  auto column = duckdb_data_chunk_get_vector(output, 0);
  try {
    std::string result;
    bool already_started = false;
    switch (bind.verb) {
    case Verb::IS_STARTED:
      static_cast<bool *>(duckdb_vector_get_data(column))[0] = ServerStarted();
      duckdb_data_chunk_set_size(output, 1);
      return;
    case Verb::START:
      result = StartMessage(bind.port, already_started);
      break;
    case Verb::START_AND_OPEN: {
      StartServer(bind.port, already_started);
      const auto command = std::string(OPEN_COMMAND) + " " + ServerUrl();
      result = std::system(command.c_str()) == 0
                   ? "duckdb-gis started at " + ServerUrl()
                   : "Navigate browser to " + ServerUrl(); // open command failed
      break;
    }
    case Verb::STOP:
      result = StopServer() ? "duckdb-gis server stopped" : "duckdb-gis server already stopped";
      break;
    case Verb::URL:
      result = ServerUrl();
      if (result.empty()) {
        duckdb_function_set_error(info, "duckdb-gis server not started");
        return;
      }
      break;
    }
    duckdb_vector_assign_string_element(column, 0, result.c_str());
    duckdb_data_chunk_set_size(output, 1);
  } catch (std::exception &ex) {
    duckdb_function_set_error(info, ex.what());
  }
}

bool Register(duckdb_connection connection, const char *name, Verb verb) {
  static Verb verbs[] = {Verb::START_AND_OPEN, Verb::START, Verb::STOP, Verb::URL,
                         Verb::IS_STARTED};
  auto function = duckdb_create_table_function();
  duckdb_table_function_set_name(function, name);
  duckdb_table_function_set_extra_info(function, &verbs[static_cast<int>(verb)], nullptr);
  if (verb == Verb::START || verb == Verb::START_AND_OPEN) {
    auto type = duckdb_create_logical_type(DUCKDB_TYPE_INTEGER);
    duckdb_table_function_add_named_parameter(function, "port", type);
    duckdb_destroy_logical_type(&type);
  }
  duckdb_table_function_set_bind(function, Bind);
  duckdb_table_function_set_init(function, Init);
  duckdb_table_function_set_function(function, Execute);
  bool ok = duckdb_register_table_function(connection, function) == DuckDBSuccess;
  duckdb_destroy_table_function(&function);
  return ok;
}

} // namespace

} // namespace gis

DUCKDB_EXTENSION_ENTRYPOINT(duckdb_connection connection, duckdb_extension_info info,
                            struct duckdb_extension_access *access) {
  // The server's own connection: see SetServerConnection.
  duckdb_connection server_connection = nullptr;
  if (duckdb_connect(*access->get_database(info), &server_connection) == DuckDBError) {
    access->set_error(info, "duckdb-gis: could not open a connection for the UI server");
    return false;
  }
  gis::SetServerConnection(server_connection);

  using gis::Verb;
  if (!gis::Register(connection, "start_gis", Verb::START_AND_OPEN) ||
      !gis::Register(connection, "start_gis_server", Verb::START) ||
      !gis::Register(connection, "stop_gis_server", Verb::STOP) ||
      !gis::Register(connection, "get_gis_url", Verb::URL) ||
      !gis::Register(connection, "gis_is_started", Verb::IS_STARTED)) {
    access->set_error(info, "duckdb-gis: could not register its functions");
    return false;
  }
  return true;
}
