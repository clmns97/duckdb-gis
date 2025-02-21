#pragma once

#include <duckdb.hpp>
#include <thread>

namespace duckdb {
namespace ui {
struct CatalogState {
  std::map<idx_t, optional_idx> db_to_catalog_version;
};
class HttpServer;
class Watcher {
public:
  Watcher(HttpServer &server);

  void Start();
  void Stop();

private:
  void Watch();
  unique_ptr<std::thread> thread;
  std::mutex mutex;
  std::condition_variable cv;
  std::atomic<bool> should_run;
  HttpServer &server;
};
} // namespace ui
} // namespace duckdb
