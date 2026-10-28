#include "http_server.hpp"

#include "embedded_assets.hpp"
#include "httplib.hpp"
#include "query.hpp"

#include <atomic>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <thread>

DUCKDB_EXTENSION_EXTERN

namespace gis {

namespace {

class Server {
public:
  void SetConnection(duckdb_connection new_connection) {
    std::lock_guard<std::mutex> guard(query_mutex);
    duckdb_connection old = connection.exchange(new_connection);
    if (old) {
      duckdb_disconnect(&old);
    }
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
      ServeAsset(req.path, res);
    });
    server.Post("/ddb/run", [this](const httplib::Request &req, httplib::Response &res) {
      if (!FromUi(req)) {
        res.status = 401;
        return;
      }
      std::string body;
      std::string error;
      {
        std::lock_guard<std::mutex> guard(query_mutex);
        auto current = connection.load();
        error = current ? RunToArrowIpc(current, req.body, body)
                        : "duckdb-gis: no database connection";
      }
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
      // Not under query_mutex: the query holds it while running.
      if (auto current = connection.load()) {
        duckdb_interrupt(current);
      }
    });
  }

  static const EmbeddedAsset *FindAsset(const std::string &path) {
    for (size_t i = 0; i < EMBEDDED_ASSETS_COUNT; i++) {
      if (path == EMBEDDED_ASSETS[i].path) {
        return &EMBEDDED_ASSETS[i];
      }
    }
    return nullptr;
  }

  static void ServeAsset(const std::string &request_path, httplib::Response &res) {
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

  std::mutex query_mutex; // one query at a time on the shared connection
  // Atomic so /ddb/interrupt can read it while a query holds query_mutex.
  std::atomic<duckdb_connection> connection{nullptr};
};

// Never destroyed: a static destructor would race the server thread at exit.
Server &Instance() {
  static Server *server = new Server();
  return *server;
}

} // namespace

void SetServerConnection(duckdb_connection connection) {
  Instance().SetConnection(connection);
}

void StartServer(uint16_t port, bool &already_started) {
  Instance().Start(port, already_started);
}

bool StopServer() { return Instance().Stop(); }

bool ServerStarted() { return Instance().Started(); }

std::string ServerUrl() { return Instance().Url(); }

} // namespace gis
