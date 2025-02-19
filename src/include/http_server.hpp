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

class EventDispatcher {
public:
  bool WaitEvent(httplib::DataSink *sink);
  void SendEvent(const std::string &message);
  void Close();

private:
  std::mutex mutex_;
  std::condition_variable cv_;
  std::atomic_int next_id_{0};
  std::atomic_int current_id_{-1};
  std::atomic_int wait_count_{0};
  std::string message_;
  std::atomic_bool closed_{false};
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

  uint16_t local_port_;
  std::string remote_url_;
  shared_ptr<DatabaseInstance> ddb_instance_;
  std::string user_agent_;
  httplib::Server server_;
  unique_ptr<std::thread> thread_;
  std::mutex connections_mutex_;
  std::unordered_map<std::string, shared_ptr<Connection>> connections_;
  unique_ptr<EventDispatcher> event_dispatcher_;

  static unique_ptr<HttpServer> instance_;
};
;

} // namespace ui
} // namespace duckdb
