#include "http_server.hpp"

#include "state.hpp"
#include "utils/encoding.hpp"
#include "utils/env.hpp"
#include "utils/serialization.hpp"
#include <duckdb/common/serializer/binary_serializer.hpp>
#include <duckdb/common/serializer/memory_stream.hpp>
#include <duckdb/main/attached_database.hpp>
#include <duckdb/parser/parser.hpp>

// Chosen to be no more than half of the lesser of the two limits:
//  - The default httplib thread pool size = 8
//  - The browser limit on the number of server-sent event connections = 6
#define MAX_EVENT_WAIT_COUNT 3

namespace duckdb {
namespace ui {

// An empty Server-Sent Events message. See
// https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes
constexpr const char *EMPTY_SSE_MESSAGE = ":\r\r";
constexpr idx_t EMPTY_SSE_MESSAGE_LENGTH = 3;

bool EventDispatcher::WaitEvent(httplib::DataSink *sink) {
  std::unique_lock<std::mutex> lock(mutex);
  // Don't allow too many simultaneous waits, because each consumes a thread in
  // the httplib thread pool, and also browsers limit the number of server-sent
  // event connections.
  if (closed || wait_count >= MAX_EVENT_WAIT_COUNT) {
    return false;
  }
  int target_id = next_id;
  wait_count++;
  cv.wait_for(lock, std::chrono::seconds(5));
  wait_count--;
  if (closed) {
    return false;
  }
  if (current_id == target_id) {
    sink->write(message.data(), message.size());
  } else {
    // Our wait timer expired. Write an empty, no-op message.
    // This enables detecting when the client is gone.
    sink->write(EMPTY_SSE_MESSAGE, EMPTY_SSE_MESSAGE_LENGTH);
  }
  return true;
}

void EventDispatcher::SendEvent(const std::string &_message) {
  std::lock_guard<std::mutex> guard(mutex);
  if (closed) {
    return;
  }

  current_id = next_id++;
  message = _message;
  cv.notify_all();
}

void EventDispatcher::Close() {
  std::lock_guard<std::mutex> guard(mutex);
  if (closed) {
    return;
  }

  current_id = next_id++;
  closed = true;
  cv.notify_all();
}

unique_ptr<HttpServer> HttpServer::server_instance;

HttpServer *HttpServer::GetInstance(ClientContext &context) {
  if (server_instance) {
    // We already have an instance, make sure we're running on the right DB
    server_instance->UpdateDatabaseInstance(context.db);
  } else {
    server_instance = make_uniq<HttpServer>(context.db);
    std::atexit(HttpServer::StopInstance);
  }
  return server_instance.get();
}

void HttpServer::UpdateDatabaseInstanceIfRunning(
    shared_ptr<DatabaseInstance> db) {
  if (server_instance) {
    server_instance->UpdateDatabaseInstance(db);
  }
}

void HttpServer::UpdateDatabaseInstance(
    shared_ptr<DatabaseInstance> context_db) {
  const auto current_db = server_instance->ddb_instance.lock();
  if (current_db != context_db) {
    server_instance->StopWatcher(); // Likely already stopped, but just in case
    server_instance->ddb_instance = context_db;
    server_instance->StartWatcher();
  }
}

bool HttpServer::Started() {
  return server_instance && server_instance->main_thread;
}

void HttpServer::StopInstance() {
  if (server_instance) {
    server_instance->Stop();
  }
}

const HttpServer &HttpServer::Start(const uint16_t _local_port,
                                    const std::string &_remote_url,
                                    bool *was_started) {
  if (main_thread) {
    if (was_started) {
      *was_started = true;
    }
    return *this;
  }

  local_port = _local_port;
  remote_url = _remote_url;
#ifndef UI_EXTENSION_GIT_SHA
#error "UI_EXTENSION_GIT_SHA must be defined"
#endif
  user_agent =
      StringUtil::Format("duckdb-ui/%s-%s(%s)", DuckDB::LibraryVersion(),
                         UI_EXTENSION_GIT_SHA, DuckDB::Platform());
  event_dispatcher = make_uniq<EventDispatcher>();
  main_thread = make_uniq<std::thread>(&HttpServer::Run, this);
  StartWatcher();
  return *this;
}

void HttpServer::StartWatcher() {
  {
    std::lock_guard<std::mutex> guard(watcher_mutex);
    watcher_should_run = true;
  }

  if (!watcher_thread) {
    watcher_thread = make_uniq<std::thread>(&HttpServer::Watch, this);
  }
}

void HttpServer::StopWatcher() {
  if (!watcher_thread) {
    return;
  }

  {
    std::lock_guard<std::mutex> guard(watcher_mutex);
    watcher_should_run = false;
  }
  watcher_cv.notify_all();
  watcher_thread->join();
  watcher_thread.reset();
}

bool HttpServer::Stop() {
  if (!main_thread) {
    return false;
  }

  event_dispatcher->Close();
  server.stop();

  StopWatcher();

  main_thread->join();
  main_thread.reset();
  event_dispatcher.reset();
  ddb_instance.reset();
  remote_url = "";
  local_port = 0;
  return true;
}

std::string HttpServer::LocalUrl() const {
  return StringUtil::Format("http://localhost:%d/", local_port);
}

void HttpServer::SendConnectedEvent(const std::string &token) {
  SendEvent(StringUtil::Format("event: ConnectedEvent\ndata: %s\n\n", token));
}

void HttpServer::SendCatalogChangedEvent() {
  SendEvent("event: CatalogChangeEvent\ndata:\n\n");
}

void HttpServer::SendEvent(const std::string &message) {
  if (event_dispatcher) {
    event_dispatcher->SendEvent(message);
  }
}

bool WasCatalogUpdated(DatabaseInstance &db, Connection &connection,
                       CatalogState &last_state) {
  bool has_change = false;
  auto &context = *connection.context;
  connection.BeginTransaction();

  const auto &databases = db.GetDatabaseManager().GetDatabases(context);
  std::set<idx_t> db_oids;

  // Check currently attached databases
  for (const auto &db_ref : databases) {
    auto &db = db_ref.get();
    if (db.IsTemporary()) {
      continue; // ignore temp databases
    }

    db_oids.insert(db.oid);
    auto &catalog = db.GetCatalog();
    auto current_version = catalog.GetCatalogVersion(context);
    auto last_version_it = last_state.db_to_catalog_version.find(db.oid);
    if (last_version_it == last_state.db_to_catalog_version.end() // first time
        || !(last_version_it->second == current_version)) {       // updated
      has_change = true;
      last_state.db_to_catalog_version[db.oid] = current_version;
    }
  }

  // Now check if any databases have been detached
  for (auto it = last_state.db_to_catalog_version.begin();
       it != last_state.db_to_catalog_version.end();) {
    if (db_oids.find(it->first) == db_oids.end()) {
      has_change = true;
      it = last_state.db_to_catalog_version.erase(it);
    } else {
      ++it;
    }
  }

  connection.Rollback();
  return has_change;
}

std::string GetMDToken(Connection &connection) {
  auto query_res = connection.Query("CALL GET_MD_TOKEN()");
  if (query_res->HasError()) {
    query_res->ThrowError();
    return ""; // unreachable
  }

  auto chunk = query_res->Fetch();
  return chunk->GetValue(0, 0).GetValue<std::string>();
}

bool IsMDConnected(Connection &con) {
  if (!con.context->db->ExtensionIsLoaded("motherduck")) {
    return false;
  }
  auto query_res = con.Query("CALL MD_IS_CONNECTED()");
  if (query_res->HasError()) {
    std::cerr << "Error in IsMDConnected: " << query_res->GetError()
              << std::endl;
    return false;
  }

  auto chunk = query_res->Fetch();
  return chunk->GetValue(0, 0).GetValue<bool>();
}

void HttpServer::Watch() {
  CatalogState last_state;
  bool is_md_connected = false;
  while (watcher_should_run) {
    auto db = ddb_instance.lock();
    if (!db) {
      break; // DB went away, nothing to watch
    }

    try {
      duckdb::Connection con{*db};
      if (WasCatalogUpdated(*db, con, last_state)) {
        SendCatalogChangedEvent();
      }

      if (!is_md_connected && IsMDConnected(con)) {
        is_md_connected = true;
        SendConnectedEvent(GetMDToken(con));
      }
    } catch (std::exception &ex) {
      // Do not crash with uncaught exception, but quit.
      std::cerr << "Error in watcher: " << ex.what() << std::endl;
      std::cerr << "Will now terminate." << std::endl;
      return;
    }
    {
      std::unique_lock<std::mutex> lock(watcher_mutex);
      watcher_cv.wait_for(lock,
                          std::chrono::milliseconds(2000)); // TODO - configure
    }
  }
}

void HttpServer::Run() {
  server.Get("/localEvents",
             [&](const httplib::Request &req, httplib::Response &res) {
               HandleGetLocalEvents(req, res);
             });
  server.Get("/localToken",
             [&](const httplib::Request &req, httplib::Response &res) {
               HandleGetLocalToken(req, res);
             });
  server.Get("/.*", [&](const httplib::Request &req, httplib::Response &res) {
    HandleGet(req, res);
  });
  server.Post("/ddb/interrupt",
              [&](const httplib::Request &req, httplib::Response &res) {
                HandleInterrupt(req, res);
              });
  server.Post("/ddb/run",
              [&](const httplib::Request &req, httplib::Response &res,
                  const httplib::ContentReader &content_reader) {
                HandleRun(req, res, content_reader);
              });
  server.Post("/ddb/tokenize",
              [&](const httplib::Request &req, httplib::Response &res,
                  const httplib::ContentReader &content_reader) {
                HandleTokenize(req, res, content_reader);
              });
  server.listen("localhost", local_port);
}

void HttpServer::HandleGetLocalEvents(const httplib::Request &req,
                                      httplib::Response &res) {
  res.set_chunked_content_provider(
      "text/event-stream", [&](size_t /*offset*/, httplib::DataSink &sink) {
        if (event_dispatcher->WaitEvent(&sink)) {
          return true;
        }
        sink.done();
        return false;
      });
}

void HttpServer::HandleGetLocalToken(const httplib::Request &req,
                                     httplib::Response &res) {
  auto db = ddb_instance.lock();
  if (!db) {
    res.status = 500;
    res.set_content("Database was invalidated, UI needs to be restarted",
                    "text/plain");
    return;
  }

  if (!db->ExtensionIsLoaded("motherduck")) {
    res.set_content("", "text/plain"); // UI expects an empty response if the
                                       // extension is not loaded
    return;
  }

  Connection connection{*db};
  try {
    auto token = GetMDToken(connection);
    res.status = 200;
    res.set_content(token, "text/plain");
  } catch (std::exception &ex) {
    if (StringUtil::Contains(
            ex.what(), "GET_MD_TOKEN will be available after you connect")) {
      // UI expects an empty response if MD isn't connected
      res.status = 200;
      res.set_content("", "text/plain");
    } else {
      res.status = 500;
      res.set_content("Could not get token: " + std::string(ex.what()),
                      "text/plain");
    }
  }
}

void HttpServer::HandleGet(const httplib::Request &req,
                           httplib::Response &res) {
  // Create HTTP client to remote URL
  // TODO: Can this be created once and shared?
  httplib::Client client(remote_url);
  client.set_keep_alive(true);

  // Provide a way to turn on or off server certificate verification, at least
  // for now, because it requires httplib to correctly get the root certficates
  // on each platform, which doesn't appear to always work. Currently, default
  // to no verification, until we understand when it breaks things.
  if (IsEnvEnabled("ui_enable_server_certificate_verification")) {
    client.enable_server_certificate_verification(true);
  } else {
    client.enable_server_certificate_verification(false);
  }

  // forward GET to remote URL
  auto result = client.Get(req.path, req.params, {{"User-Agent", user_agent}});
  if (!result) {
    res.status = 500;
    return;
  }

  // Repond with result of forwarded GET
  res = result.value();

  // If this is the config request, set the X-MD-DuckDB-Mode header to HTTP.
  // The UI looks for this to select the appropriate DuckDB mode (HTTP or Wasm).
  if (req.path == "/config") {
    res.set_header("X-MD-DuckDB-Mode", "HTTP");
  }
}

void HttpServer::HandleInterrupt(const httplib::Request &req,
                                 httplib::Response &res) {
  auto description = req.get_header_value("X-MD-Description");
  auto connection_name = req.get_header_value("X-MD-Connection-Name");

  auto db = ddb_instance.lock();
  if (!db) {
    res.status = 404;
    return;
  }

  auto connection =
      UIStorageExtensionInfo::GetState(*db).FindConnection(connection_name);
  if (!connection) {
    res.status = 404;
    return;
  }

  connection->Interrupt();

  SetResponseEmptyResult(res);
}

void HttpServer::HandleRun(const httplib::Request &req, httplib::Response &res,
                           const httplib::ContentReader &content_reader) {
  try {
    DoHandleRun(req, res, content_reader);
  } catch (const std::exception &ex) {
    SetResponseErrorResult(res, ex.what());
  }
}

void HttpServer::DoHandleRun(const httplib::Request &req,
                             httplib::Response &res,
                             const httplib::ContentReader &content_reader) {
  auto description = req.get_header_value("X-MD-Description");
  auto connection_name = req.get_header_value("X-MD-Connection-Name");

  auto database_name = DecodeBase64(req.get_header_value("X-MD-Database-Name"));
  auto parameter_count = req.get_header_value_count("X-MD-Parameter");

  std::string content = ReadContent(content_reader);

  auto db = ddb_instance.lock();
  if (!db) {
    SetResponseErrorResult(
        res, "Database was invalidated, UI needs to be restarted");
    return;
  }

  auto connection =
      UIStorageExtensionInfo::GetState(*db).FindOrCreateConnection(
          *db, connection_name);

  // Set current database if optional header is provided.
  if (!database_name.empty()) {
    auto &context = *connection->context;
    context.RunFunctionInTransaction([&] {
      auto &manager = context.db->GetDatabaseManager();
      manager.SetDefaultDatabase(context, database_name);
    });
  }

  // We use a pending query so we can execute tasks and fetch chunks
  // incrementally. This enables cancellation.
  unique_ptr<PendingQueryResult> pending;

  // Create pending query, with request content as SQL.
  if (parameter_count > 0) {
    auto prepared = connection->Prepare(content);
    if (prepared->HasError()) {
      SetResponseErrorResult(res, prepared->GetError());
      return;
    }

    vector<Value> values;
    for (idx_t i = 0; i < parameter_count; ++i) {
      auto parameter = DecodeBase64(req.get_header_value("X-MD-Parameter", i));
      values.push_back(
          Value(parameter)); // TODO: support non-string parameters? (SURF-1546)
    }
    pending = prepared->PendingQuery(values, true);
  } else {
    pending = connection->PendingQuery(content, true);
  }

  if (pending->HasError()) {
    SetResponseErrorResult(res, pending->GetError());
    return;
  }

  // Execute tasks until result is ready (or there's an error).
  auto exec_result = PendingExecutionResult::RESULT_NOT_READY;
  while (!PendingQueryResult::IsResultReady(exec_result)) {
    exec_result = pending->ExecuteTask();
    if (exec_result == PendingExecutionResult::BLOCKED ||
        exec_result == PendingExecutionResult::NO_TASKS_AVAILABLE) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
  }

  switch (exec_result) {

  case PendingExecutionResult::EXECUTION_ERROR:
    SetResponseErrorResult(res, pending->GetError());
    break;

  case PendingExecutionResult::EXECUTION_FINISHED:
  case PendingExecutionResult::RESULT_READY: {
    // Get the result. This should be quick because it's ready.
    auto result = pending->Execute();

    // Fetch the chunks and serialize the result.
    SuccessResult success_result;
    success_result.column_names_and_types = {std::move(result->names),
                                             std::move(result->types)};

    // TODO: support limiting the number of chunks fetched (SURF-1540)
    auto chunk = result->Fetch();
    while (chunk) {
      success_result.chunks.push_back(
          {static_cast<uint16_t>(chunk->size()), std::move(chunk->data)});
      chunk = result->Fetch();
    }

    MemoryStream success_response_content;
    BinarySerializer::Serialize(success_result, success_response_content);
    SetResponseContent(res, success_response_content);
    break;
  }
  default:
    SetResponseErrorResult(res, "Unexpected PendingExecutionResult");
    break;
  }
}

void HttpServer::HandleTokenize(const httplib::Request &req,
                                httplib::Response &res,
                                const httplib::ContentReader &content_reader) {
  auto description = req.get_header_value("X-MD-Description");

  std::string content = ReadContent(content_reader);

  auto tokens = Parser::Tokenize(content);

  // Read and serialize result
  TokenizeResult result;
  result.offsets.reserve(tokens.size());
  result.types.reserve(tokens.size());

  for (auto token : tokens) {
    result.offsets.push_back(token.start);
    result.types.push_back(token.type);
  }

  MemoryStream response_content;
  BinarySerializer::Serialize(result, response_content);
  SetResponseContent(res, response_content);
}

std::string
HttpServer::ReadContent(const httplib::ContentReader &content_reader) {
  std::ostringstream oss;
  content_reader([&](const char *data, size_t data_length) {
    oss.write(data, data_length);
    return true;
  });
  return oss.str();
}

void HttpServer::SetResponseContent(httplib::Response &res,
                                    const MemoryStream &content) {
  auto data = content.GetData();
  auto length = content.GetPosition();
  res.set_content(reinterpret_cast<const char *>(data), length,
                  "application/octet-stream");
}

void HttpServer::SetResponseEmptyResult(httplib::Response &res) {
  EmptyResult empty_result;
  MemoryStream response_content;
  BinarySerializer::Serialize(empty_result, response_content);
  SetResponseContent(res, response_content);
}

void HttpServer::SetResponseErrorResult(httplib::Response &res,
                                        const std::string &error) {
  ErrorResult error_result;
  error_result.error = error;
  MemoryStream response_content;
  BinarySerializer::Serialize(error_result, response_content);
  SetResponseContent(res, response_content);
}

} // namespace ui
} // namespace duckdb
