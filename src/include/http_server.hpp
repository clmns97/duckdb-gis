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
  HttpServer(shared_ptr<DatabaseInstance> _ddb_instance)
      : ddb_instance(_ddb_instance) {}
  static HttpServer *GetInstance(ClientContext &);
  static void UpdateDatabaseInstanceIfRunning(shared_ptr<DatabaseInstance>);
  static bool Started();
  static void StopInstance();

  const HttpServer &Start(const uint16_t local_port,
                          const std::string &remote_url,
                          bool *was_started = nullptr);
  bool Stop();
  std::string LocalUrl() const;
  void SendConnectedEvent(const std::string &token);
  void SendCatalogChangedEvent();

private:
  void UpdateDatabaseInstance(shared_ptr<DatabaseInstance> context_db);
  void SendEvent(const std::string &message);
  void Run();
  void Watch();
  void StartWatcher();
  void StopWatcher();
  void HandleGetLocalEvents(const httplib::Request &req,
                            httplib::Response &res);
  void HandleGetLocalToken(const httplib::Request &req, httplib::Response &res);
  void HandleGet(const httplib::Request &req, httplib::Response &res);
  void HandleInterrupt(const httplib::Request &req, httplib::Response &res);
  void DoHandleRun(const httplib::Request &req, httplib::Response &res,
                   const httplib::ContentReader &content_reader);
  void HandleRun(const httplib::Request &req, httplib::Response &res,
                 const httplib::ContentReader &content_reader);
  void HandleTokenize(const httplib::Request &req, httplib::Response &res,
                      const httplib::ContentReader &content_reader);
  std::string ReadContent(const httplib::ContentReader &content_reader);

  void SetResponseContent(httplib::Response &res, const MemoryStream &content);
  void SetResponseEmptyResult(httplib::Response &res);
  void SetResponseErrorResult(httplib::Response &res, const std::string &error);

  // Watchers
  void WatchForCatalogUpdate(DatabaseInstance &, CatalogState &last_state);

  uint16_t local_port;
  std::string remote_url;
  weak_ptr<DatabaseInstance> ddb_instance;
  std::string user_agent;
  httplib::Server server;
  unique_ptr<std::thread> main_thread;
  unique_ptr<std::thread> watcher_thread;
  std::mutex watcher_mutex;
  std::condition_variable watcher_cv;
  std::atomic<bool> watcher_should_run;

  unique_ptr<EventDispatcher> event_dispatcher;

  static unique_ptr<HttpServer> server_instance;
};
;

} // namespace ui
} // namespace duckdb
