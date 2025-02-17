cmake_minimum_required(VERSION 3.5...3.31.5)

# Set extension name here
set(TARGET_NAME ui)

# DuckDB's extension distribution supports vcpkg. As such, dependencies can be added in ./vcpkg.json and then
# used in cmake with find_package. Feel free to remove or replace with other dependencies.
# Note that it should also be removed from vcpkg.json to prevent needlessly installing it..
find_package(OpenSSL REQUIRED)

set(EXTENSION_NAME ${TARGET_NAME}_extension)

project(${TARGET_NAME})
include_directories(
  src/include
  ${DuckDB_SOURCE_DIR}/third_party/httplib
)

set(EXTENSION_SOURCES
  src/ui_extension.cpp
  src/http_server.cpp
  src/utils/encoding.cpp
  src/utils/env.cpp
  src/utils/helpers.cpp
  src/utils/serialization.cpp
)

build_static_extension(${TARGET_NAME} ${EXTENSION_SOURCES})
build_loadable_extension(${TARGET_NAME} " " ${EXTENSION_SOURCES})

target_link_libraries(${EXTENSION_NAME} OpenSSL::SSL OpenSSL::Crypto)

install(
  TARGETS ${EXTENSION_NAME}
  EXPORT "${DUCKDB_EXPORT_SET}"
  LIBRARY DESTINATION "${INSTALL_LIB_DIR}"
  ARCHIVE DESTINATION "${INSTALL_LIB_DIR}")
