#pragma once

#include <duckdb/main/client_context.hpp>
#include <duckdb/common/exception.hpp>

#define UI_LOCAL_PORT_SETTING_NAME "ui_local_port"
#define UI_REMOTE_URL_SETTING_NAME "ui_remote_url"
#define UI_POLLING_INTERVAL_SETTING_NAME "ui_polling_interval"

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
