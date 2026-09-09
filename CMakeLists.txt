cmake_minimum_required(VERSION 3.5...3.31.5)

# Set extension name here
set(TARGET_NAME gis)

# DuckDB's extension distribution supports vcpkg. As such, dependencies can be
# added in ./vcpkg.json and then used in cmake with find_package. Feel free to
# remove or replace with other dependencies. Note that it should also be removed
# from vcpkg.json to prevent needlessly installing it..
find_package(OpenSSL REQUIRED)

include_directories(${OPENSSL_INCLUDE_DIR})

set(EXTENSION_NAME ${TARGET_NAME}_extension)

project(${TARGET_NAME})
include_directories(src/include ${PROJECT_SOURCE_DIR}/third_party/httplib)

set(EXTENSION_SOURCES
    src/event_dispatcher.cpp
    src/http_server.cpp
    src/settings.cpp
    src/state.cpp
    src/gis_extension.cpp
    src/utils/encoding.cpp
    src/utils/env.cpp
    src/utils/helpers.cpp
    src/utils/serialization.cpp
    src/watcher.cpp)

# Embed frontend/dist (committed build output; see `make frontend`) into the
# extension as gzip-compressed byte arrays, keyed by request path. Regenerated
# whenever frontend/dist changes so a stale UI can't silently ship (T-053).
find_package(Python3 COMPONENTS Interpreter REQUIRED)

set(EMBEDDED_ASSETS_SRC ${CMAKE_CURRENT_BINARY_DIR}/embedded_assets.generated.cpp)
file(GLOB_RECURSE FRONTEND_DIST_FILES CONFIGURE_DEPENDS
     ${PROJECT_SOURCE_DIR}/frontend/dist/*)

add_custom_command(
  OUTPUT ${EMBEDDED_ASSETS_SRC}
  COMMAND ${Python3_EXECUTABLE}
          ${PROJECT_SOURCE_DIR}/scripts/generate_embedded_assets.py
          --dist-dir ${PROJECT_SOURCE_DIR}/frontend/dist
          --output ${EMBEDDED_ASSETS_SRC}
  DEPENDS ${FRONTEND_DIST_FILES}
          ${PROJECT_SOURCE_DIR}/scripts/generate_embedded_assets.py
  COMMENT "Generating embedded GIS frontend assets from frontend/dist"
  VERBATIM)

list(APPEND EXTENSION_SOURCES ${EMBEDDED_ASSETS_SRC})

add_definitions(-DDUCKDB_MAJOR_VERSION=${DUCKDB_MAJOR_VERSION})
add_definitions(-DDUCKDB_MINOR_VERSION=${DUCKDB_MINOR_VERSION})
add_definitions(-DDUCKDB_PATCH_VERSION=${DUCKDB_PATCH_VERSION})

find_package(Git)
if(NOT Git_FOUND)
  message(FATAL_ERROR "Git not found, unable to determine git sha")
endif()

execute_process(
  COMMAND ${GIT_EXECUTABLE} rev-list --count HEAD
  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
  OUTPUT_VARIABLE GIS_EXTENSION_SEQ_NUM
  OUTPUT_STRIP_TRAILING_WHITESPACE)

message(STATUS "GIS_EXTENSION_SEQ_NUM=${GIS_EXTENSION_SEQ_NUM}")
add_definitions(-DGIS_EXTENSION_SEQ_NUM="${GIS_EXTENSION_SEQ_NUM}")

execute_process(
  COMMAND ${GIT_EXECUTABLE} rev-parse --short=10 HEAD
  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
  OUTPUT_VARIABLE GIS_EXTENSION_GIT_SHA
  OUTPUT_STRIP_TRAILING_WHITESPACE)

message(STATUS "GIS_EXTENSION_GIT_SHA=${GIS_EXTENSION_GIT_SHA}")
add_definitions(-DGIS_EXTENSION_GIT_SHA="${GIS_EXTENSION_GIT_SHA}")

build_static_extension(${TARGET_NAME} ${EXTENSION_SOURCES})
build_loadable_extension(${TARGET_NAME} " " ${EXTENSION_SOURCES})

target_link_libraries(${EXTENSION_NAME} OpenSSL::SSL OpenSSL::Crypto)
target_link_libraries(${TARGET_NAME}_loadable_extension OpenSSL::SSL OpenSSL::Crypto)

# DuckDB's vendored httplib auto-enables CPPHTTPLIB_USE_CERTS_FROM_MACOSX_KEYCHAIN
# on macOS, so the inline tls::load_system_certs it pulls into http_server.cpp
# needs the system frameworks at link time. Same pattern as duckdb-httpfs.
if(APPLE)
  find_library(COREFOUNDATION_FRAMEWORK CoreFoundation)
  find_library(SECURITY_FRAMEWORK Security)
  target_link_libraries(${EXTENSION_NAME} ${COREFOUNDATION_FRAMEWORK}
                        ${SECURITY_FRAMEWORK})
  target_link_libraries(${TARGET_NAME}_loadable_extension
                        ${COREFOUNDATION_FRAMEWORK} ${SECURITY_FRAMEWORK})
endif()

install(
  TARGETS ${EXTENSION_NAME}
  EXPORT "${DUCKDB_EXPORT_SET}"
  LIBRARY DESTINATION "${INSTALL_LIB_DIR}"
  ARCHIVE DESTINATION "${INSTALL_LIB_DIR}")
