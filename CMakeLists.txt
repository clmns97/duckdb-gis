cmake_minimum_required(VERSION 3.5...3.31.5)
option(DUCKDB_WASM_EXTENSION "Whether compiling for Wasm target" OFF)

# The gis extension targets DuckDB's stable C extension API (see #88): it calls
# DuckDB only through the function table DuckDB hands it at load time, so it
# contains no DuckDB code and one binary loads on every DuckDB that provides
# the targeted API version (TARGET_DUCKDB_VERSION in the Makefile). Layout
# follows duckdb/extension-template-c.

###
# Configuration
###
if(NOT DEFINED EXTENSION_NAME)
  message(FATAL_ERROR "DuckDB extension name is required")
endif()
if(DEFINED TARGET_DUCKDB_VERSION_MAJOR)
  add_definitions(-DDUCKDB_EXTENSION_API_VERSION_MAJOR=${TARGET_DUCKDB_VERSION_MAJOR})
endif()
if(DEFINED TARGET_DUCKDB_VERSION_MINOR)
  add_definitions(-DDUCKDB_EXTENSION_API_VERSION_MINOR=${TARGET_DUCKDB_VERSION_MINOR})
endif()
if(DEFINED TARGET_DUCKDB_VERSION_PATCH)
  add_definitions(-DDUCKDB_EXTENSION_API_VERSION_PATCH=${TARGET_DUCKDB_VERSION_PATCH})
endif()
add_definitions(-DDUCKDB_EXTENSION_NAME=${EXTENSION_NAME})
if(DEFINED DUCKDB_EXTENSION_API_VERSION_UNSTABLE)
  add_definitions(-DDUCKDB_EXTENSION_API_VERSION_UNSTABLE=${DUCKDB_EXTENSION_API_VERSION_UNSTABLE})
endif()

###
# Build
###
project(${EXTENSION_NAME} LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Before any target is created, so it applies to them: DuckDB looks up only
# the entrypoint, which is exported explicitly.
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)

set(EXTENSION_SOURCES
    src/gis_extension.cpp
    src/http_server.cpp
    src/query.cpp
    third_party/nanoarrow/src/nanoarrow.c
    third_party/nanoarrow/src/nanoarrow_ipc.c
    third_party/nanoarrow/src/flatcc.c)

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

set(GIS_INCLUDE_DIRS
    src/include
    duckdb_capi
    third_party/httplib
    third_party/nanoarrow/include)

# When compiled in-tree as part of a DuckDB build, DuckDB provides the C-API
# build helpers (see duckdb/extension-template-c for the details).
if(COMMAND build_static_extension_capi_unstable)
  if(DEFINED DUCKDB_EXTENSION_API_VERSION_UNSTABLE OR NOT DEFINED TARGET_DUCKDB_VERSION_MAJOR)
    build_loadable_extension_capi_unstable(${EXTENSION_NAME} ${EXTENSION_SOURCES})
    build_static_extension_capi_unstable(${EXTENSION_NAME} ${EXTENSION_SOURCES})
  else()
    if(NOT DEFINED TARGET_DUCKDB_VERSION_MINOR)
      set(TARGET_DUCKDB_VERSION_MINOR 0)
    endif()
    if(NOT DEFINED TARGET_DUCKDB_VERSION_PATCH)
      set(TARGET_DUCKDB_VERSION_PATCH 0)
    endif()
    build_loadable_extension_capi(${EXTENSION_NAME} ${TARGET_DUCKDB_VERSION_MAJOR} ${TARGET_DUCKDB_VERSION_MINOR} ${TARGET_DUCKDB_VERSION_PATCH} ${EXTENSION_SOURCES})
    build_static_extension_capi(${EXTENSION_NAME} ${TARGET_DUCKDB_VERSION_MAJOR} ${TARGET_DUCKDB_VERSION_MINOR} ${TARGET_DUCKDB_VERSION_PATCH} ${EXTENSION_SOURCES})
  endif()
  foreach(_capi_target ${EXTENSION_NAME}_loadable_extension ${EXTENSION_NAME}_extension)
    target_include_directories(${_capi_target} PRIVATE ${GIS_INCLUDE_DIRS})
  endforeach()
  return()
endif()

if(DUCKDB_WASM_EXTENSION)
  add_library(${EXTENSION_NAME} STATIC ${EXTENSION_SOURCES})
else()
  add_library(${EXTENSION_NAME} SHARED ${EXTENSION_SOURCES})
endif()
target_include_directories(${EXTENSION_NAME} PRIVATE ${GIS_INCLUDE_DIRS})

set(THREADS_PREFER_PTHREAD_FLAG ON)
find_package(Threads REQUIRED)
target_link_libraries(${EXTENSION_NAME} PRIVATE Threads::Threads)
if(WIN32)
  # cpp-httplib's sockets.
  target_link_libraries(${EXTENSION_NAME} PRIVATE ws2_32)
endif()

if(NOT MSVC)
  # Strip release builds, and drop unreferenced code and data.
  set(CMAKE_C_FLAGS_RELEASE "${CMAKE_C_FLAGS_RELEASE} -s")
  set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -s")
  target_compile_options(${EXTENSION_NAME} PRIVATE -ffunction-sections -fdata-sections)
  if(APPLE)
    target_link_options(${EXTENSION_NAME} PRIVATE -Wl,-dead_strip)
  else()
    target_link_options(${EXTENSION_NAME} PRIVATE -Wl,--gc-sections)
  endif()
endif()
