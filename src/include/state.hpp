#pragma once

#include <string>
#include <duckdb/storage/storage_extension.hpp>
#include <duckdb/main/connection.hpp>

namespace duckdb {
// Distinct from core DuckDB's "ui" storage extension key so both can be
// registered in the same DBConfig without one clobbering the other.
const static std::string STORAGE_EXTENSION_KEY = "gis";

class UIStorageExtensionInfo : public StorageExtensionInfo {
public:
  static UIStorageExtensionInfo &GetState(const DatabaseInstance &instance);

  shared_ptr<Connection> FindConnection(const std::string &connection_name);
  shared_ptr<Connection>
  FindOrCreateConnection(DatabaseInstance &db,
                         const std::string &connection_name);

private:
  std::mutex connections_mutex;
  std::unordered_map<std::string, shared_ptr<Connection>> connections;
};

} // namespace duckdb
