#pragma once

#include <duckdb/common/exception.hpp>
#include <duckdb/main/client_context.hpp>

#define GIS_LOCAL_PORT_SETTING_NAME "gis_local_port"
// Distinct from core DuckDB ui's default (4213) so `start_ui()`/`start_gis()`
// can both run at once without an explicit SET gis_local_port.
#define GIS_LOCAL_PORT_SETTING_DEFAULT 4214
#define GIS_REMOTE_URL_SETTING_NAME "gis_remote_url"
// Empty default -> serve the embedded frontend (see HttpServer::HandleGet).
// Set to e.g. "http://localhost:5173" to proxy to a Vite dev server instead.
#define GIS_REMOTE_URL_SETTING_DEFAULT ""
#define GIS_POLLING_INTERVAL_SETTING_NAME "gis_polling_interval"
#define GIS_POLLING_INTERVAL_SETTING_DEFAULT 284

namespace duckdb {

namespace internal {

template <typename T>
T GetSetting(const ClientContext &context, const char *setting_name) {
  Value value;
  if (!context.TryGetCurrentSetting(setting_name, value)) {
    throw Exception(ExceptionType::SETTINGS,
                    "Setting \"" + std::string(setting_name) + "\" not found");
  }
  return value.GetValue<T>();
}
} // namespace internal

std::string GetRemoteUrl(const ClientContext &);
uint16_t GetLocalPort(const ClientContext &);
uint32_t GetPollingInterval(const ClientContext &);

} // namespace duckdb
