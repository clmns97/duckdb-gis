#pragma once

#include "duckdb.hpp"

#define CPPHTTPLIB_OPENSSL_SUPPORT
#include "httplib.hpp"

#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>

namespace httplib = duckdb_httplib_openssl;

namespace duckdb {
class MemoryStream;

namespace ui {

struct CatalogState {
  std::map<idx_t, optional_idx> db_to_catalog_version;
};

class EventDispatcher {
public:
  bool WaitEvent(httplib::DataSink *sink);
  void SendEvent(const std::string &message);
  void Close();

private:
  std::mutex mutex;
  std::condition_variable cv;
  std::atomic_int next_id{0};
  std::atomic_int current_id{-1};
  std::atomic_int wait_count{0};
  std::string message;
  std::atomic_bool closed{false};
};

class HttpServer {

public:
  static HttpServer *instance();
  static bool Started();
  static void StopInstance();

  bool Start(const uint16_t localPort, const std::string &remoteUrl,
             const shared_ptr<DatabaseInstance> &ddbInstance);
  bool Stop();
  uint16_t LocalPort();
  void SendConnectedEvent(const std::string &token);
  void SendCatalogChangedEvent();

private:
  void SendEvent(const std::string &message);
  void Run();
  void Watch();
  void HandleGetLocalEvents(const httplib::Request &req,
                            httplib::Response &res);
  void HandleGetLocalToken(const httplib::Request &req, httplib::Response &res);
  void HandleGet(const httplib::Request &req, httplib::Response &res);
  void HandleInterrupt(const httplib::Request &req, httplib::Response &res);
  void DoHandleRun(const httplib::Request &req, httplib::Response &res,
                   const httplib::ContentReader &contentReader);
  void HandleRun(const httplib::Request &req, httplib::Response &res,
                 const httplib::ContentReader &contentReader);
  void HandleTokenize(const httplib::Request &req, httplib::Response &res,
                      const httplib::ContentReader &contentReader);
  std::string ReadContent(const httplib::ContentReader &contentReader);
  shared_ptr<Connection> FindConnection(const std::string &connectionName);
  shared_ptr<Connection>
  FindOrCreateConnection(const std::string &connectionName);
  void SetResponseContent(httplib::Response &res, const MemoryStream &content);
  void SetResponseEmptyResult(httplib::Response &res);
  void SetResponseErrorResult(httplib::Response &res, const std::string &error);

  // Watchers
  void WatchForCatalogUpdate(CatalogState &last_state);

  uint16_t local_port;
  std::string remote_url;
  shared_ptr<DatabaseInstance> ddb_instance;
  std::string user_agent;
  httplib::Server server;
  unique_ptr<std::thread> main_thread;
  unique_ptr<std::thread> watcher_thread;
  std::mutex watcher_mutex;
  std::condition_variable watcher_cv;
  std::atomic<bool> watcher_should_run;

  std::mutex connections_mutex;
  std::unordered_map<std::string, shared_ptr<Connection>> connections;
  unique_ptr<EventDispatcher> event_dispatcher;

  static unique_ptr<HttpServer> server_instance;
};
;

} // namespace ui
} // namespace duckdb
