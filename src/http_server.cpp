#include "http_server.hpp"

#include "embedded_assets.hpp"
#include "httplib.hpp"
#include "query.hpp"

#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>

DUCKDB_EXTENSION_EXTERN

namespace gis {

namespace {

// Run one statement for its first value, as a string ("" on error or NULL).
std::string QueryString(duckdb_connection connection, const char *sql) {
  duckdb_result result;
  std::string value;
  if (duckdb_query(connection, sql, &result) == DuckDBSuccess) {
    if (char *text = duckdb_value_varchar(&result, 0, 0)) {
      value = text;
      duckdb_free(text);
    }
  }
  duckdb_destroy_result(&result);
  return value;
}

// A `USE` statement for the connection's current database and schema.
constexpr const char *CURRENT_CATALOG_SQL =
    "SELECT 'USE \"' || replace(current_database(), '\"', '\"\"') || '\".\"' || "
    "replace(current_schema(), '\"', '\"\"') || '\"'";

class Server {
public:
  void SetConnections(duckdb_connection new_session, std::vector<duckdb_connection> new_pool) {
    {
      std::lock_guard<std::mutex> guard(query_mutex);
      duckdb_connection old = session.exchange(new_session);
      if (old) {
        duckdb_disconnect(&old);
      }
      RecordSessionCatalog(new_session);
    }
    std::unique_lock<std::mutex> lock(pool_mutex);
    // Wait out pooled queries still running on the old connections.
    pool_idle.wait(lock, [this] { return idle.size() == pool.size(); });
    for (auto &old : pool) {
      duckdb_disconnect(&old);
    }
    pool = std::move(new_pool);
    idle = pool;
  }

  void Start(uint16_t port, bool &already_started) {
    std::lock_guard<std::mutex> guard(state_mutex);
    already_started = static_cast<bool>(http);
    if (already_started) {
      return;
    }
    auto server = std::make_unique<httplib::Server>();
    origin = "http://localhost:" + std::to_string(port);
    Route(*server);
    // Bind before returning, so a port in use is reported to the caller.
    if (!server->bind_to_port("localhost", port)) {
      throw std::runtime_error("duckdb-gis: could not listen on localhost:" +
                               std::to_string(port) + " (is the port in use?)");
    }
    http = std::move(server);
    url = origin + "/";
    thread = std::thread([server = http.get()] { server->listen_after_bind(); });
  }

  bool Stop() {
    std::lock_guard<std::mutex> guard(state_mutex);
    if (!http) {
      return false;
    }
    http->stop();
    if (thread.joinable()) {
      thread.join();
    }
    http.reset();
    url.clear();
    return true;
  }

  bool Started() {
    std::lock_guard<std::mutex> guard(state_mutex);
    return static_cast<bool>(http);
  }

  std::string Url() {
    std::lock_guard<std::mutex> guard(state_mutex);
    return url;
  }

private:
  // Only the UI itself (and the Vite dev proxy, which rewrites Origin to it)
  // may run SQL: a page from any other origin must not reach localhost.
  bool FromUi(const httplib::Request &req) const {
    return req.get_header_value("Origin") == origin;
  }

  void Route(httplib::Server &server) {
    server.Get(".*", [](const httplib::Request &req, httplib::Response &res) {
      ServeAsset(req, res);
    });
    server.Post("/ddb/run", [this](const httplib::Request &req, httplib::Response &res) {
      if (!FromUi(req)) {
        res.status = 401;
        return;
      }
      std::string body;
      std::string error = req.get_header_value("X-GIS-Connection") == "pool"
                              ? RunPooled(req.body, body)
                              : RunOnSession(req.body, body);
      if (!error.empty()) {
        res.status = 400;
        res.set_content(error, "text/plain; charset=utf-8");
        return;
      }
      res.set_content(body, "application/vnd.apache.arrow.stream");
    });
    server.Post("/ddb/interrupt", [this](const httplib::Request &req, httplib::Response &res) {
      if (!FromUi(req)) {
        res.status = 401;
        return;
      }
      // Cancels the session's query (the SQL editor's); pooled background
      // reads aren't interruptible. Not under query_mutex: the query holds it.
      if (auto current = session.load()) {
        duckdb_interrupt(current);
      }
    });
  }

  // The session connection runs everything that depends on connection state:
  // SQL the user types, USE, transactions (BEGIN ... COMMIT spans requests).
  // One query at a time, in arrival order.
  std::string RunOnSession(const std::string &sql, std::string &out) {
    std::lock_guard<std::mutex> guard(query_mutex);
    auto current = session.load();
    if (!current) {
      return "duckdb-gis: no database connection";
    }
    auto error = RunToArrowIpc(current, sql, out);
    RecordSessionCatalog(current);
    return error;
  }

  // Pooled connections run the UI's own background reads (layer data, the
  // catalog tree, ...) in parallel with the session and each other, so a slow
  // query doesn't stall the rest of the UI. Each query first switches to the
  // session's current database and schema, so unqualified names resolve the
  // same way; this also repairs a pooled connection whose current database
  // was detached and re-attached in the meantime.
  std::string RunPooled(const std::string &sql, std::string &out) {
    std::string use;
    {
      std::lock_guard<std::mutex> guard(catalog_mutex);
      use = session_catalog;
    }
    duckdb_connection connection = nullptr;
    {
      std::unique_lock<std::mutex> lock(pool_mutex);
      if (pool.empty()) {
        lock.unlock();
        return RunOnSession(sql, out);
      }
      pool_idle.wait(lock, [this] { return !idle.empty(); });
      connection = idle.back();
      idle.pop_back();
    }
    auto error = RunToArrowIpc(connection, use.empty() ? sql : use + ";\n" + sql, out);
    {
      std::lock_guard<std::mutex> guard(pool_mutex);
      idle.push_back(connection);
    }
    pool_idle.notify_all();
    return error;
  }

  // Called with query_mutex held, after anything that may have run USE.
  void RecordSessionCatalog(duckdb_connection connection) {
    auto use = connection ? QueryString(connection, CURRENT_CATALOG_SQL) : "";
    std::lock_guard<std::mutex> guard(catalog_mutex);
    session_catalog = use;
  }

  static const EmbeddedAsset *FindAsset(const std::string &path) {
    for (size_t i = 0; i < EMBEDDED_ASSETS_COUNT; i++) {
      if (path == EMBEDDED_ASSETS[i].path) {
        return &EMBEDDED_ASSETS[i];
      }
    }
    return nullptr;
  }

  static void ServeAsset(const httplib::Request &req, httplib::Response &res) {
    const auto &request_path = req.path;
    auto path = request_path == "/" ? "/index.html" : request_path;
    auto asset = FindAsset(path);
    if (!asset) {
      // SPA fallback: a path with no file extension in its last segment is a
      // client-side route (e.g. deep link), not a missing asset.
      auto last_segment = path.substr(path.find_last_of('/') + 1);
      if (last_segment.find('.') == std::string::npos) {
        asset = FindAsset("/index.html");
      }
    }
    if (!asset) {
      res.status = 404;
      res.set_content("Not found: " + request_path, "text/plain");
      return;
    }
    // Asset names carry no content hash (frontend/vite.config.ts), so let the
    // browser cache but revalidate every time: a reload of an unchanged asset
    // is a 304 instead of re-sending it.
    res.set_header("Cache-Control", "no-cache");
    res.set_header("ETag", asset->etag);
    if (req.get_header_value("If-None-Match") == asset->etag) {
      res.status = 304;
      return;
    }
    // Assets are stored pre-gzipped; hand the browser the compressed bytes.
    res.set_header("Content-Encoding", "gzip");
    res.set_content(reinterpret_cast<const char *>(asset->gzip_data), asset->gzip_size,
                    httplib::detail::find_content_type(asset->path, {},
                                                       "application/octet-stream"));
  }

  std::mutex state_mutex; // http, thread, origin, url
  std::unique_ptr<httplib::Server> http;
  std::thread thread;
  std::string origin;
  std::string url;

  std::mutex query_mutex; // one query at a time on the session connection
  // Atomic so /ddb/interrupt can read it while a query holds query_mutex.
  std::atomic<duckdb_connection> session{nullptr};

  std::mutex catalog_mutex;
  std::string session_catalog; // e.g. USE "memory"."main"; "" if unknown

  std::mutex pool_mutex; // pool, idle
  std::condition_variable pool_idle;
  std::vector<duckdb_connection> pool;
  std::vector<duckdb_connection> idle;
};

// Never destroyed: a static destructor would race the server thread at exit.
Server &Instance() {
  static Server *server = new Server();
  return *server;
}

} // namespace

void SetServerConnections(duckdb_connection session, std::vector<duckdb_connection> pool) {
  Instance().SetConnections(session, std::move(pool));
}

void StartServer(uint16_t port, bool &already_started) {
  Instance().Start(port, already_started);
}

bool StopServer() { return Instance().Stop(); }

bool ServerStarted() { return Instance().Started(); }

std::string ServerUrl() { return Instance().Url(); }

} // namespace gis
